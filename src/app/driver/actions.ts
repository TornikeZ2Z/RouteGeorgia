"use server";

import { revalidatePath } from "next/cache";
import { savePattern, freeRange, blockRange, PATTERN_HORIZON_DAYS } from "@/lib/availability-patterns";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, sql } from "@db/client";
import { driverProfiles, driverLanguages, vehicles, pricePlans, priceBands } from "@db/schema";
import { requireUser, requirePermission, getSessionUser } from "@/lib/auth/session";
import { IMPERSONATION_COOKIE } from "@/lib/auth/impersonation";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { validatePlanAgainstBand } from "@/lib/pricing/engine";
import { parseMajor } from "@/lib/money";
import { createBlock, deleteBlock, AvailabilityConflictError } from "@/lib/availability";
import { getStorage, hashDocumentNumber, assertUploadAllowed, UploadRejectedError } from "@/lib/storage";
import { signContract, type SignError } from "@/lib/contract";
import { getTranslator, isLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { headers } from "next/headers";

export type ActionState = { ok: boolean; message?: string; errors?: string[] };

/** Every driver action resolves the caller's OWN profile — never a supplied id. */
async function myDriver() {
  const user = await requireUser();
  const [driver] = await sql<{ id: string; status: string }[]>`
    SELECT id, status::text AS status FROM driver_profiles WHERE user_id = ${user.id}::uuid`;
  return { user, driver: driver ?? null };
}

const LOCKED_STATES = new Set(["SUSPENDED", "REJECTED"]);

// --------------------------------------------------------------- profile ---
const ProfileSchema = z.object({
  publicName: z.string().min(2).max(80),
  legalFirstName: z.string().min(1).max(80),
  legalLastName: z.string().min(1).max(80),
  bio: z.string().max(1200).optional(),
  baseLocationId: z.string().uuid().optional().or(z.literal("")),
  emergencyContact: z.string().max(80).optional(),
  languages: z.string().optional(), // "en:FLUENT,ka:NATIVE"
});

export async function saveProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, driver } = await myDriver();
  const parsed = ProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const v = parsed.data;

  if (driver && LOCKED_STATES.has(driver.status)) {
    return { ok: false, message: "Your profile is locked. Contact support." };
  }

  const values = {
    publicName: v.publicName,
    legalFirstName: v.legalFirstName,
    legalLastName: v.legalLastName,
    bio: v.bio ?? null,
    baseLocationId: v.baseLocationId ? v.baseLocationId : null,
    emergencyContact: v.emergencyContact ?? null,
    updatedAt: new Date(),
  };

  let driverId: string;
  if (driver) {
    await db.update(driverProfiles).set(values).where(eq(driverProfiles.id, driver.id));
    driverId = driver.id;
  } else {
    const handle = await uniqueHandle(v.publicName);
    const [created] = await db.insert(driverProfiles)
      .values({ ...values, userId: user.id, handle, status: "DRAFT" })
      .returning({ id: driverProfiles.id });
    driverId = created!.id;
  }

  if (v.languages !== undefined) {
    const entries = v.languages.split(",").map((s) => s.trim()).filter(Boolean);
    await sql`DELETE FROM driver_languages WHERE driver_id = ${driverId}::uuid`;
    for (const entry of entries) {
      const [lang, level] = entry.split(":");
      if (!lang || !level) continue;
      if (!["BASIC", "CONVERSATIONAL", "FLUENT", "NATIVE"].includes(level)) continue;
      // Note: declared_level only. verified_level is set by staff after an
      // interview — a driver can never mark their own language as verified.
      await db.insert(driverLanguages)
        .values({ driverId, language: lang.toLowerCase(), declaredLevel: level as never })
        .onConflictDoNothing();
    }
  }

  await writeAudit({
    actorUserId: user.id, actorRole: "DRIVER", action: "driver.profile_saved",
    objectType: "driver_profile", objectId: driverId, after: values,
  });
  revalidatePath("/driver");
  return { ok: true, message: "Saved." };
}

export async function submitApplicationAction(): Promise<ActionState> {
  const { user, driver } = await myDriver();
  if (!driver) return { ok: false, message: "Create your profile first." };
  if (!["DRAFT", "CHANGES_REQUESTED"].includes(driver.status)) {
    return { ok: false, message: "Your application has already been submitted." };
  }

  // Completeness gate: refuse to waste a reviewer's time on a partial file.
  // Insurance is deliberately NOT on this list — the platform no longer
  // collects it. Identity and licence are what verification starts from.
  const [counts] = await sql<{ vehicles: number; docs: number; langs: number }[]>`
    SELECT
      (SELECT count(*) FROM vehicles WHERE driver_id = ${driver.id}::uuid)::int AS vehicles,
      (SELECT count(*) FROM driver_documents WHERE driver_id = ${driver.id}::uuid
        AND type IN ('IDENTITY', 'DRIVING_LICENSE'))::int AS docs,
      (SELECT count(*) FROM driver_languages WHERE driver_id = ${driver.id}::uuid)::int AS langs`;

  const missing: string[] = [];
  if ((counts?.vehicles ?? 0) === 0) missing.push("at least one vehicle");
  if ((counts?.docs ?? 0) < 2) missing.push("identity and driving licence documents");
  if ((counts?.langs ?? 0) === 0) missing.push("at least one spoken language");
  if (missing.length) return { ok: false, message: `Still needed: ${missing.join(", ")}.` };

  await db.update(driverProfiles)
    .set({ status: "SUBMITTED", submittedAt: new Date() })
    .where(eq(driverProfiles.id, driver.id));
  await writeAudit({
    actorUserId: user.id, actorRole: "DRIVER", action: "driver.application_submitted",
    objectType: "driver_profile", objectId: driver.id,
  });
  revalidatePath("/driver");
  return { ok: true, message: "Submitted for review." };
}

// --------------------------------------------------------------- vehicle ---
const VehicleSchema = z.object({
  make: z.string().min(1).max(40),
  model: z.string().min(1).max(40),
  year: z.coerce.number().int().min(1990).max(2100),
  color: z.string().max(30).optional(),
  plate: z.string().min(2).max(20),
  class: z.enum(["ECONOMY", "COMFORT", "MINIVAN", "SUV_4X4", "MINIBUS", "PREMIUM"]),
  seats: z.coerce.number().int().min(1).max(60),
  luggage: z.coerce.number().int().min(0).max(60),
});

export async function saveVehicleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, driver } = await myDriver();
  if (!driver) return { ok: false, message: "Create your profile first." };

  const parsed = VehicleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }

  const flags = (name: string) => formData.get(name) === "on";
  const amenities = {
    air_conditioning: flags("air_conditioning"), wifi: flags("wifi"),
    pets_allowed: flags("pets_allowed"), child_seat: flags("child_seat"),
    smoke_free: flags("smoke_free"),
  };
  const capabilities = {
    four_wheel_drive: flags("four_wheel_drive"), winter_tyres: flags("winter_tyres"),
    wheelchair_access: flags("wheelchair_access"),
  };

  try {
    const [created] = await db.insert(vehicles).values({
      driverId: driver.id, ...parsed.data,
      color: parsed.data.color ?? null,
      amenities, capabilities, status: "SUBMITTED",
    }).returning({ id: vehicles.id });

    await writeAudit({
      actorUserId: user.id, actorRole: "DRIVER", action: "driver.vehicle_added",
      objectType: "vehicle", objectId: created!.id, after: parsed.data,
    });
  } catch (err) {
    if (String(err).includes("vehicles_plate_uq")) {
      return { ok: false, message: "That number plate is already registered on the platform." };
    }
    throw err;
  }

  revalidatePath("/driver/vehicle");
  return { ok: true, message: "Vehicle submitted for review." };
}

// -------------------------------------------------------------- document ---
export async function uploadDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, driver } = await myDriver();
  if (!driver) return { ok: false, message: "Create your profile first." };

  const type = String(formData.get("type") ?? "");
  const file = formData.get("file");
  const expiresOn = String(formData.get("expiresOn") ?? "");
  const number = String(formData.get("number") ?? "");
  const vehicleId = String(formData.get("vehicleId") ?? "");

  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file to upload." };
  if (!["IDENTITY", "DRIVING_LICENSE", "VEHICLE_REGISTRATION", "INSURANCE", "INSPECTION"].includes(type)) {
    return { ok: false, message: "Unknown document type." };
  }
  // Insurance and licence expiry drive automatic booking pauses, so they are
  // mandatory data, not optional metadata.
  if (["DRIVING_LICENSE", "INSURANCE"].includes(type) && !expiresOn) {
    return { ok: false, message: "An expiry date is required for this document." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    assertUploadAllowed(file.type, buffer.byteLength);
    const stored = await getStorage().put("restricted-kyc", buffer, file.type);

    await sql`
      INSERT INTO driver_documents
        (driver_id, vehicle_id, type, storage_key, number_hash, mime_type, size_bytes,
         checksum, expires_on, is_mandatory, state)
      VALUES (${driver.id}::uuid, ${vehicleId || null}::uuid, ${type}::doc_type, ${stored.key},
              ${number ? hashDocumentNumber(number) : null}, ${stored.mimeType}, ${stored.sizeBytes},
              ${stored.checksum}, ${expiresOn || null}::date, true, 'PENDING')`;

    // storageKey is deliberately excluded from the audit payload.
    await writeAudit({
      actorUserId: user.id, actorRole: "DRIVER", action: "driver.document_uploaded",
      objectType: "driver_document", objectId: driver.id,
      after: { type, expiresOn: expiresOn || null, sizeBytes: stored.sizeBytes },
    });
  } catch (err) {
    if (err instanceof UploadRejectedError) return { ok: false, message: err.message };
    throw err;
  }

  revalidatePath("/driver/documents");
  return { ok: true, message: "Uploaded. Operations will review it." };
}

// --------------------------------------------------------- vehicle media ---
/**
 * Vehicle photos go to the PUBLIC media bucket, separate from the restricted
 * KYC prefix, and start life as PENDING. Nothing a driver uploads appears to
 * travellers until a moderator approves it.
 */
export async function uploadVehiclePhotoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, driver } = await myDriver();
  if (!driver) return { ok: false, message: "Create your profile first." };

  const vehicleId = String(formData.get("vehicleId") ?? "");
  const viewType = String(formData.get("viewType") ?? "exterior");
  const altText = String(formData.get("altText") ?? "").slice(0, 160);
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);

  if (!vehicleId) return { ok: false, message: "Choose which vehicle these photos are of." };
  if (files.length === 0) return { ok: false, message: "Choose at least one photo." };
  if (files.length > 8) return { ok: false, message: "Upload up to 8 photos at a time." };

  const owned = await sql`
    SELECT 1 FROM vehicles WHERE id = ${vehicleId}::uuid AND driver_id = ${driver.id}::uuid`;
  if (owned.length === 0) return { ok: false, message: "Vehicle not found." };

  const [existing] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM vehicle_media WHERE vehicle_id = ${vehicleId}::uuid`;
  if ((existing?.n ?? 0) + files.length > 12) {
    return { ok: false, message: "A vehicle can have at most 12 photos." };
  }

  let position = existing?.n ?? 0;
  try {
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      assertUploadAllowed(file.type, buffer.byteLength);
      if (file.type === "application/pdf") {
        return { ok: false, message: "Photos must be images, not PDFs." };
      }
      const stored = await getStorage().put("public-media", buffer, file.type);
      await sql`
        INSERT INTO vehicle_media (vehicle_id, storage_key, position, view_type, alt_text, checksum, moderation_state)
        VALUES (${vehicleId}::uuid, ${stored.key}, ${position}, ${viewType},
                ${altText || null}, ${stored.checksum}, 'PENDING')`;
      position++;
    }
  } catch (err) {
    if (err instanceof UploadRejectedError) return { ok: false, message: err.message };
    throw err;
  }

  await writeAudit({
    actorUserId: user.id, actorRole: "DRIVER", action: "driver.vehicle_photos_uploaded",
    objectType: "vehicle", objectId: vehicleId, after: { count: files.length, viewType },
  });
  revalidatePath("/driver/vehicle");
  return { ok: true, message: `${files.length} photo(s) uploaded. A moderator will review them.` };
}

export async function deleteVehiclePhotoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, driver } = await myDriver();
  if (!driver) return { ok: false, message: "Create your profile first." };
  const mediaId = String(formData.get("mediaId") ?? "");

  const rows = await sql<{ storage_key: string }[]>`
    DELETE FROM vehicle_media vm
    USING vehicles v
    WHERE vm.id = ${mediaId}::uuid AND v.id = vm.vehicle_id AND v.driver_id = ${driver.id}::uuid
    RETURNING vm.storage_key`;
  if (rows.length === 0) return { ok: false, message: "Photo not found." };

  await getStorage().remove(rows[0]!.storage_key).catch(() => {});
  await writeAudit({
    actorUserId: user.id, actorRole: "DRIVER", action: "driver.vehicle_photo_removed",
    objectType: "vehicle_media", objectId: mediaId,
  });
  revalidatePath("/driver/vehicle");
  return { ok: true, message: "Photo removed." };
}

// --------------------------------------------------------------- pricing ---
const PriceSchema = z.object({
  vehicleId: z.string().uuid(),
  ratePerKm: z.string(),
  ratePerMinute: z.string().default("0"),
  perStopFee: z.string().default("0"),
  overnightFee: z.string().default("0"),
  minimumFare: z.string().default("0"),
  seasonFactorPct: z.coerce.number().min(80).max(200).default(100),
});

/**
 * A price edit NEVER mutates an existing plan. It supersedes the current one
 * and creates a new version, so quotes already issued keep their inputs.
 */
export async function savePricePlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, driver } = await myDriver();
  if (!driver) return { ok: false, message: "Create your profile first." };

  const parsed = PriceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const v = parsed.data;

  const [vehicle] = await db.select().from(vehicles)
    .where(and(eq(vehicles.id, v.vehicleId), eq(vehicles.driverId, driver.id)));
  if (!vehicle) return { ok: false, message: "Vehicle not found." };

  const [band] = await db.select().from(priceBands).where(eq(priceBands.class, vehicle.class));
  if (!band) return { ok: false, message: "No price band is configured for this vehicle class." };

  let money;
  try {
    money = {
      ratePerKmMinor: parseMajor(v.ratePerKm),
      ratePerMinuteMinor: parseMajor(v.ratePerMinute),
      perStopFeeMinor: parseMajor(v.perStopFee),
      overnightFeeMinor: parseMajor(v.overnightFee),
      minimumFareMinor: parseMajor(v.minimumFare),
    };
  } catch {
    return { ok: false, message: "Enter amounts as plain numbers, for example 1.20" };
  }

  const seasonFactorBps = Math.round(v.seasonFactorPct * 100);
  const errors = validatePlanAgainstBand({ ...money, seasonFactorBps }, band);
  if (errors.length) return { ok: false, errors };

  const [current] = await sql<{ version: number }[]>`
    SELECT coalesce(max(version), 0) AS version FROM price_plans WHERE vehicle_id = ${v.vehicleId}::uuid`;
  const nextVersion = (current?.version ?? 0) + 1;

  await db.transaction(async (tx) => {
    await tx.update(pricePlans)
      .set({ status: "SUPERSEDED", effectiveTo: new Date() })
      .where(and(eq(pricePlans.vehicleId, v.vehicleId), eq(pricePlans.status, "ACTIVE")));

    await tx.insert(pricePlans).values({
      driverId: driver.id, vehicleId: v.vehicleId, version: nextVersion,
      ...money, seasonFactorBps, status: "ACTIVE", effectiveFrom: new Date(),
    });
  });

  await writeAudit({
    actorUserId: user.id, actorRole: "DRIVER", action: "driver.price_plan_versioned",
    objectType: "price_plan", objectId: v.vehicleId,
    after: { version: nextVersion, ratePerKm: v.ratePerKm, seasonFactorPct: v.seasonFactorPct },
  });
  revalidatePath("/driver/pricing");
  return { ok: true, message: `Price plan version ${nextVersion} is now active.` };
}

// ---------------------------------------------------------- availability ---
/**
 * One tap on the working-days calendar. A day is "off" when a driver-made
 * block covers it; toggling off-state deletes the driver's own blocks that
 * day (never booking or rest blocks), toggling on-state adds a full-day
 * TIME_OFF block in Georgian time.
 */
export async function toggleWorkDayAction(formData: FormData): Promise<void> {
  const { driver } = await myDriver();
  if (!driver) return;

  const day = String(formData.get("day") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  // Georgia is UTC+4 year-round.
  const startsAt = new Date(`${day}T00:00:00+04:00`);
  const endsAt = new Date(startsAt.getTime() + 86_400_000);
  if (startsAt.getTime() < Date.now() - 86_400_000) return;

  const own = await sql<{ id: string }[]>`
    SELECT id FROM availability_blocks
    WHERE driver_id = ${driver.id}::uuid
      AND kind IN ('BUSY', 'TIME_OFF')
      AND period && tstzrange(${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz, '[)')`;

  if (own.length > 0) {
    await sql`DELETE FROM availability_blocks
      WHERE driver_id = ${driver.id}::uuid AND id = ANY(${own.map((b) => b.id)}::uuid[])`;
  } else {
    try {
      await createBlock({ driverId: driver.id, startsAt, endsAt, kind: "TIME_OFF", reasonCategory: "day_off" });
    } catch {
      /* a booking arrived meanwhile — the calendar will show it */
    }
  }
  revalidatePath("/driver/availability");
}

export async function addAvailabilityBlockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, driver } = await myDriver();
  if (!driver) return { ok: false, message: "Create your profile first." };

  const startsAt = new Date(String(formData.get("startsAt")));
  const endsAt = new Date(String(formData.get("endsAt")));
  const kind = String(formData.get("kind") ?? "TIME_OFF");

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { ok: false, message: "Enter a valid start and end time." };
  }
  if (endsAt <= startsAt) return { ok: false, message: "The end time must be after the start time." };
  if (!["BUSY", "TIME_OFF"].includes(kind)) {
    return { ok: false, message: "Drivers can only add busy or time-off blocks." };
  }

  try {
    await createBlock({ driverId: driver.id, startsAt, endsAt, kind: kind as never });
  } catch (err) {
    if (err instanceof AvailabilityConflictError) {
      return { ok: false, message: "That period overlaps something already on your calendar." };
    }
    throw err;
  }

  await writeAudit({
    actorUserId: user.id, actorRole: "DRIVER", action: "driver.availability_added",
    objectType: "availability_block", objectId: driver.id,
    after: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), kind },
  });
  revalidatePath("/driver/availability");
  return { ok: true, message: "Added to your calendar." };
}

export async function removeAvailabilityBlockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, driver } = await myDriver();
  if (!driver) return { ok: false, message: "Create your profile first." };

  const removed = await deleteBlock(driver.id, String(formData.get("blockId")));
  if (!removed) {
    // BOOKING blocks are excluded by the query: a calendar edit must never
    // cancel confirmed work.
    return { ok: false, message: "That block cannot be removed. Confirmed bookings are managed by support." };
  }
  await writeAudit({
    actorUserId: user.id, actorRole: "DRIVER", action: "driver.availability_removed",
    objectType: "availability_block", objectId: String(formData.get("blockId")),
  });
  revalidatePath("/driver/availability");
  return { ok: true, message: "Removed." };
}

// -------------------------------------------------------------- contract ---
const SIGN_ERROR_KEY: Record<SignError, MessageKey> = {
  NO_CONTRACT: "contract.errNoContract",
  NOT_APPROVED: "contract.errNotApproved",
  ALREADY_SIGNED: "contract.errAlreadySigned",
  NAME_MISMATCH: "contract.errNameMismatch",
  NOT_CONFIRMED: "contract.errNotConfirmed",
  STALE: "contract.errStale",
};

/**
 * Sign the driver agreement.
 *
 * Everything that decides whether this is allowed — the driver being approved,
 * a published version existing, the company details being complete, the text
 * on screen still being the text on offer — is re-checked on the server in
 * src/lib/contract.ts. This action only carries the request and turns the
 * outcome into a sentence in the driver's own language.
 */
export async function signContractAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, driver } = await myDriver();
  const locale = (isLocale(user.locale) ? user.locale : "ka") as Locale;
  const t = getTranslator(locale);
  if (!driver) return { ok: false, message: t("contract.errNotApproved") };

  const h = await headers();
  const result = await signContract({
    driverId: driver.id,
    userId: user.id,
    locale,
    typedName: String(formData.get("signedName") ?? ""),
    confirmed: formData.get("confirmed") === "on",
    bodyHash: String(formData.get("bodyHash") ?? ""),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  });

  if (!result.ok) return { ok: false, message: t(SIGN_ERROR_KEY[result.error]) };

  revalidatePath("/driver");
  revalidatePath("/driver/contract");
  return { ok: true, message: t("contract.signedJustNow") };
}

// ---------------------------------------------------------- impersonation ---
/**
 * The exit button on the impersonation banner. Audited BEFORE the cookie is
 * cleared so the closing entry still carries the impersonation marker, then
 * back to the console.
 */
export async function exitImpersonationAction(): Promise<void> {
  const user = await getSessionUser();
  if (user?.impersonator) {
    await writeAudit({
      actorUserId: user.impersonator.id, action: "admin.impersonation_ended",
      objectType: "user", objectId: user.id,
      reason: "staff closed the driver view",
    });
  }
  (await cookies()).delete(IMPERSONATION_COOKIE);
  redirect("/admin");
}

async function uniqueHandle(name: string): Promise<string> {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "driver";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const rows = await sql`SELECT 1 FROM driver_profiles WHERE handle = ${candidate}`;
    if (rows.length === 0) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export { requirePermission };

/**
 * Recurring days off. One statement of "I never work Sundays" replaces a
 * block filed every week forever — the complaint that showed up in GoTrip's
 * own support queue as a ticket titled "closed days".
 */
export async function saveAvailabilityPatternAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { driver } = await myDriver();
  if (!driver) return { ok: false, message: "Create your profile first." };

  const weekdays = formData.getAll("weekday").map((v) => Number(String(v)));
  if (weekdays.length === 7) {
    return { ok: false, message: "That would block every day. Leave at least one working day." };
  }

  const blocked = await savePattern(driver.id, weekdays);
  revalidatePath("/driver/availability");
  return {
    ok: true,
    message: weekdays.length === 0
      ? "Weekly pattern cleared."
      : `Saved. ${blocked} day(s) blocked over the next ${PATTERN_HORIZON_DAYS} days.`,
  };
}

/** Block or free a whole span in one action, instead of a block per day. */
export async function setRangeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { driver } = await myDriver();
  if (!driver) return { ok: false, message: "Create your profile first." };

  const mode = String(formData.get("mode") ?? "");
  const fromRaw = String(formData.get("rangeFrom") ?? "");
  const toRaw = String(formData.get("rangeTo") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
    return { ok: false, message: "Choose both dates." };
  }

  // Georgian local days, and the end date is inclusive — a driver picking the
  // 3rd to the 5th means three days off, not two.
  const from = new Date(`${fromRaw}T00:00:00+04:00`);
  const to = new Date(new Date(`${toRaw}T00:00:00+04:00`).getTime() + 86_400_000);
  if (to <= from) return { ok: false, message: "The last day is before the first." };
  if (to.getTime() - from.getTime() > 366 * 86_400_000) {
    return { ok: false, message: "Choose a span of a year or less." };
  }

  if (mode === "free") {
    const freed = await freeRange(driver.id, from, to);
    revalidatePath("/driver/availability");
    return { ok: true, message: `${freed} day(s) freed.` };
  }

  const { blocked, skipped } = await blockRange(driver.id, from, to, "TIME_OFF");
  revalidatePath("/driver/availability");
  return {
    ok: true,
    message: skipped > 0
      ? `${blocked} day(s) blocked. ${skipped} left alone — already booked or blocked.`
      : `${blocked} day(s) blocked.`,
  };
}

/** One tap for the most common answer of all: not today. */
export async function toggleTodayAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { driver } = await myDriver();
  if (!driver) return { ok: false, message: "Create your profile first." };

  const wantFree = String(formData.get("mode") ?? "") === "free";
  const todayKey = new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);
  const from = new Date(`${todayKey}T00:00:00+04:00`);
  const to = new Date(from.getTime() + 86_400_000);

  if (wantFree) {
    const freed = await freeRange(driver.id, from, to);
    revalidatePath("/driver/availability");
    return { ok: true, message: freed > 0 ? "Today is open again." : "Today was already open." };
  }

  const { blocked, skipped } = await blockRange(driver.id, from, to, "TIME_OFF");
  revalidatePath("/driver/availability");
  return {
    ok: true,
    message: blocked > 0
      ? "Today is blocked."
      : skipped > 0
        ? "Today already has a booking or a block."
        : "Nothing to change.",
  };
}
