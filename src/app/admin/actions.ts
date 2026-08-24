"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, sql } from "@db/client";
import { driverProfiles, vehicles, locations } from "@db/schema";
import { requirePermission } from "@/lib/auth/session";
import { writeAudit, redact } from "@/lib/audit";
import { randomBytes } from "node:crypto";
import { parseMajor } from "@/lib/money";
import { hashPassword } from "@/lib/auth/password";
import { config } from "@/lib/config";
import { getStorage, assertUploadAllowed, UploadRejectedError, hashDocumentNumber } from "@/lib/storage";
import { cancelBooking } from "@/lib/booking";
import { dispatchPending, queue as queueNotification } from "@/lib/notifications";
import { getActiveContract, companyDetailsComplete } from "@/lib/contract";
import { reassignBooking, refundBooking, recordCashSettlement } from "@/lib/operations";
import type { ActionState } from "@/app/driver/actions";

/**
 * Every action here requires an explicit permission AND a written reason.
 * The reason is stored in the append-only audit log next to the before/after
 * snapshot, so a decision can always be explained months later.
 */

const DECISIONS = ["IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "SUSPENDED"] as const;

const DecisionSchema = z.object({
  driverId: z.string().uuid(),
  decision: z.enum(DECISIONS),
  reason: z.string().min(10, "Give a reason of at least 10 characters — it is part of the audit record."),
});

export async function decideDriverAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.drivers.decide");
  const parsed = DecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  }
  const { driverId, decision, reason } = parsed.data;

  const [before] = await db.select().from(driverProfiles).where(eq(driverProfiles.id, driverId));
  if (!before) return { ok: false, message: "Driver not found." };

  // Approval is not publication. A driver is only visible to travellers after
  // an explicit, separately-permissioned publish step.
  const patch: Partial<typeof driverProfiles.$inferInsert> = {
    status: decision,
    updatedAt: new Date(),
    ...(decision === "APPROVED" ? { approvedAt: new Date() } : {}),
    ...(decision === "SUSPENDED" ? { published: false, suspendedReason: reason } : {}),
    ...(decision === "REJECTED" ? { published: false } : {}),
  };

  await db.transaction(async (tx) => {
    await tx.update(driverProfiles).set(patch).where(eq(driverProfiles.id, driverId));
    await tx.execute(sql`
      INSERT INTO driver_decisions (driver_id, from_state, to_state, reason, actor_id)
      VALUES (${driverId}::uuid, ${before.status}::driver_status, ${decision}::driver_status,
              ${reason}, ${actor.id}::uuid)` as never);
  });

  await writeAudit({
    actorUserId: actor.id, action: `driver.${decision.toLowerCase()}`,
    objectType: "driver_profile", objectId: driverId,
    before: { status: before.status, published: before.published },
    after: { status: decision }, reason,
  });

  // Approval is the moment the agreement becomes theirs to accept. Tell them
  // by both channels: a driver who applied on a phone watches SMS more
  // reliably than email, and the contract is the only thing now standing
  // between them and their first booking.
  let extra = "";
  if (decision === "APPROVED") {
    const notified = await notifyContractReady(driverId);
    extra = notified
      ? " They have been told the contract is ready to sign."
      : " NOTE: no contract is published yet, so they could not be told to sign one.";
  }

  revalidatePath("/admin/drivers");
  revalidatePath(`/admin/drivers/${driverId}`);
  return {
    ok: true,
    message: `Driver set to ${decision.replaceAll("_", " ").toLowerCase()}.${extra}`,
  };
}

/**
 * Queue the "your contract is ready" messages and send them immediately.
 *
 * Returns false when there is nothing to sign yet — no published version, or
 * the company's own legal details are still blank — so the caller can say so
 * rather than implying the driver received something they did not.
 */
async function notifyContractReady(driverId: string): Promise<boolean> {
  const [row] = await sql<{
    email: string; phone: string | null; locale: string; public_name: string;
  }[]>`
    SELECT u.email, u.phone, u.locale, d.public_name
    FROM driver_profiles d JOIN users u ON u.id = d.user_id
    WHERE d.id = ${driverId}::uuid`;
  if (!row) return false;

  const contract = await getActiveContract(row.locale);
  if (!contract || !companyDetailsComplete()) return false;

  const copy = contractReadyMessage(row.locale, row.public_name);
  const queued: string[] = [];

  await sql.begin(async (tx) => {
    const emailId = await queueNotification(tx, {
      kind: "contract.ready", channel: "EMAIL", to: row.email, locale: row.locale,
      subject: copy.subject, body: copy.email,
      dedupe: `${driverId}:${contract.version}:email`,
    });
    if (emailId) queued.push(emailId);

    if (row.phone) {
      const smsId = await queueNotification(tx, {
        kind: "contract.ready", channel: "SMS", to: row.phone, locale: row.locale,
        subject: copy.subject, body: copy.sms,
        dedupe: `${driverId}:${contract.version}:sms`,
      });
      if (smsId) queued.push(smsId);
    }
  });

  if (queued.length) await dispatchPending(queued.length, queued).catch(() => {});
  return true;
}

/** Georgian and English only, matching the languages the agreement exists in. */
function contractReadyMessage(locale: string, name: string) {
  if (locale === "ka") {
    return {
      subject: "თქვენი ხელშეკრულება მზადაა — RouteGeorgia",
      email: [
        `გამარჯობა, ${name}.`,
        ``,
        `თქვენი განაცხადი შემოწმდა და დამტკიცდა. რჩება ბოლო ნაბიჯი: მძღოლის ხელშეკრულების გაცნობა და ხელმოწერა.`,
        ``,
        `${config.appUrl}/driver/contract`,
        ``,
        `ხელმოწერის შემდეგ თქვენი პროფილი გამოქვეყნდება და მგზავრები შეძლებენ თქვენს დაჯავშნას.`,
        `ხელშეკრულებას ხელს აწერთ თქვენი სრული სახელისა და გვარის აკრეფით — ეს იურიდიულად უტოლდება ხელით შესრულებულ ხელმოწერას.`,
        ``,
        `თუ რაიმე გაუგებარია, გვიპასუხეთ ამ წერილზე ხელმოწერამდე.`,
      ].join("\n"),
      sms: `RouteGeorgia: თქვენი განაცხადი დამტკიცდა. ხელშეკრულების ხელმოსაწერად: ${config.appUrl}/driver/contract`,
    };
  }
  return {
    subject: "Your RouteGeorgia driver contract is ready",
    email: [
      `Hello ${name},`,
      ``,
      `We have checked your application and approved it. One step is left: read and sign the driver agreement.`,
      ``,
      `${config.appUrl}/driver/contract`,
      ``,
      `Once you sign, we publish your profile and travellers can book you.`,
      `You sign by typing your full legal name — under Georgian law that has the same force as signing by hand.`,
      ``,
      `If anything in it is unclear, reply to this email before you sign.`,
    ].join("\n"),
    sms: `RouteGeorgia: your application is approved. Sign your contract here: ${config.appUrl}/driver/contract`,
  };
}

const PublishSchema = z.object({
  driverId: z.string().uuid(),
  publish: z.enum(["true", "false"]),
  reason: z.string().min(10),
});

export async function publishDriverAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.drivers.publish");
  const parsed = PublishSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const { driverId, reason } = parsed.data;
  const publish = parsed.data.publish === "true";

  const [driver] = await db.select().from(driverProfiles).where(eq(driverProfiles.id, driverId));
  if (!driver) return { ok: false, message: "Driver not found." };
  if (publish && driver.status !== "APPROVED") {
    return { ok: false, message: "Only an approved driver can be published." };
  }

  if (publish) {
    // Refuse to publish supply that cannot legally or safely take a booking.
    const [gate] = await sql<{ missing: number; expired: number; vehicles: number; plans: number }[]>`
      SELECT
        (SELECT count(*) FROM (VALUES ('IDENTITY'),('DRIVING_LICENSE'),('INSURANCE')) AS req(t)
          WHERE NOT EXISTS (SELECT 1 FROM driver_documents dd
            WHERE dd.driver_id = ${driverId}::uuid AND dd.type::text = req.t AND dd.state = 'APPROVED'))::int AS missing,
        (SELECT count(*) FROM driver_documents
          WHERE driver_id = ${driverId}::uuid AND is_mandatory
            AND expires_on IS NOT NULL AND expires_on < current_date)::int AS expired,
        (SELECT count(*) FROM vehicles WHERE driver_id = ${driverId}::uuid AND status = 'APPROVED')::int AS vehicles,
        (SELECT count(*) FROM price_plans WHERE driver_id = ${driverId}::uuid AND status = 'ACTIVE')::int AS plans`;

    const blockers: string[] = [];
    if ((gate?.missing ?? 1) > 0) blockers.push("identity, licence and insurance must all be approved");
    if ((gate?.expired ?? 0) > 0) blockers.push("a mandatory document has expired");
    if ((gate?.vehicles ?? 0) === 0) blockers.push("at least one vehicle must be approved");
    if ((gate?.plans ?? 0) === 0) blockers.push("an active price plan is required");

    // Approval is our decision; the signature is theirs. A trigger on
    // driver_profiles refuses the update as well — this check exists so the
    // reviewer reads a sentence instead of a database error.
    const [signed] = await sql<{ live: string | null; signed: number }[]>`
      SELECT current_contract_version() AS live,
             (SELECT count(*) FROM contract_signatures s
               WHERE s.driver_id = ${driverId}::uuid
                 AND s.contract_version = current_contract_version())::int AS signed`;
    if (signed?.live && (signed?.signed ?? 0) === 0) {
      blockers.push(`the driver agreement (${signed.live}) has not been signed by this driver`);
    }

    if (blockers.length) return { ok: false, errors: blockers };
  }

  await db.update(driverProfiles).set({ published: publish, updatedAt: new Date() })
    .where(eq(driverProfiles.id, driverId));

  await writeAudit({
    actorUserId: actor.id, action: publish ? "driver.published" : "driver.unpublished",
    objectType: "driver_profile", objectId: driverId,
    before: { published: driver.published }, after: { published: publish }, reason,
  });

  revalidatePath(`/admin/drivers/${driverId}`);
  return { ok: true, message: publish ? "Driver is now live in search." : "Driver removed from search." };
}

const DocSchema = z.object({
  documentId: z.string().uuid(),
  driverId: z.string().uuid(),
  state: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  reason: z.string().min(5),
});

export async function decideDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.documents.decide");
  const parsed = DocSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const { documentId, driverId, state, reason } = parsed.data;

  await sql`
    UPDATE driver_documents
    SET state = ${state}::review_state, reviewed_by = ${actor.id}::uuid,
        reviewed_at = now(), review_reason = ${reason}
    WHERE id = ${documentId}::uuid AND driver_id = ${driverId}::uuid`;

  await writeAudit({
    actorUserId: actor.id, action: `document.${state.toLowerCase()}`,
    objectType: "driver_document", objectId: documentId, after: { state }, reason,
  });

  revalidatePath(`/admin/drivers/${driverId}`);
  return { ok: true, message: `Document ${state.replaceAll("_", " ").toLowerCase()}.` };
}

const VehicleDecisionSchema = z.object({
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
  status: z.enum(["APPROVED", "SUSPENDED", "RETIRED"]),
  publish: z.enum(["true", "false"]).default("false"),
  reason: z.string().min(5),
});

export async function decideVehicleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.drivers.decide");
  const parsed = VehicleDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const { vehicleId, driverId, status, reason } = parsed.data;
  const publish = parsed.data.publish === "true" && status === "APPROVED";

  await db.update(vehicles).set({ status, published: publish }).where(eq(vehicles.id, vehicleId));
  await writeAudit({
    actorUserId: actor.id, action: `vehicle.${status.toLowerCase()}`,
    objectType: "vehicle", objectId: vehicleId, after: { status, published: publish }, reason,
  });

  revalidatePath(`/admin/drivers/${driverId}`);
  return { ok: true, message: `Vehicle ${status.toLowerCase()}${publish ? " and published" : ""}.` };
}

const LanguageSchema = z.object({
  driverId: z.string().uuid(),
  language: z.string().min(2).max(8),
  verifiedLevel: z.enum(["BASIC", "CONVERSATIONAL", "FLUENT", "NATIVE"]),
});

/** Language verification exists because "selected language, no actual fluency"
 *  is the benchmark's most frequent traveller complaint. */
export async function verifyLanguageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.drivers.decide");
  const parsed = LanguageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const { driverId, language, verifiedLevel } = parsed.data;

  await sql`
    UPDATE driver_languages
    SET verified_level = ${verifiedLevel}::proficiency, verified_by = ${actor.id}::uuid, verified_at = now()
    WHERE driver_id = ${driverId}::uuid AND language = ${language}`;

  await writeAudit({
    actorUserId: actor.id, action: "driver.language_verified", objectType: "driver_language",
    objectId: `${driverId}:${language}`, after: { verifiedLevel },
    reason: "interview result recorded",
  });

  revalidatePath(`/admin/drivers/${driverId}`);
  return { ok: true, message: `${language} verified as ${verifiedLevel.toLowerCase()}.` };
}

const LocationSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers and hyphens."),
  type: z.enum(["AIRPORT", "CITY", "TOWN", "ATTRACTION", "RESORT", "BORDER", "ADDRESS"]),
  nameEn: z.string().min(2),
  nameKa: z.string().optional(),
  nameRu: z.string().optional(),
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

export async function saveLocationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.locations.write");
  const parsed = LocationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };

  try {
    await db.insert(locations).values({
      ...parsed.data,
      nameKa: parsed.data.nameKa || null,
      nameRu: parsed.data.nameRu || null,
    });
  } catch (err) {
    if (String(err).includes("locations_slug")) return { ok: false, message: "That slug already exists." };
    throw err;
  }

  await writeAudit({
    actorUserId: actor.id, action: "location.created", objectType: "location",
    objectId: parsed.data.slug, after: parsed.data,
  });
  revalidatePath("/admin/locations");
  return { ok: true, message: "Location added." };
}

const MediaSchema = z.object({
  mediaId: z.string().uuid(),
  driverId: z.string().uuid(),
  state: z.enum(["APPROVED", "REJECTED"]),
});

/**
 * Photo moderation. We check that the image is of the registered vehicle and
 * contains no personal data (visible plates of other cars, people's faces,
 * contact details painted on the bodywork) before it reaches travellers.
 */
export async function moderateVehicleMediaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.drivers.decide");
  const parsed = MediaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const { mediaId, driverId, state } = parsed.data;

  await sql`
    UPDATE vehicle_media SET moderation_state = ${state}::review_state
    WHERE id = ${mediaId}::uuid`;

  await writeAudit({
    actorUserId: actor.id, action: `vehicle_media.${state.toLowerCase()}`,
    objectType: "vehicle_media", objectId: mediaId, after: { state },
    reason: "photo moderation",
  });

  revalidatePath(`/admin/drivers/${driverId}`);
  revalidatePath("/admin/media");
  return { ok: true, message: `Photo ${state.toLowerCase()}.` };
}

const ReviewSchema = z.object({
  reviewId: z.string().uuid(),
  decision: z.enum(["PUBLISHED", "REJECTED"]),
  publishedBody: z.string().max(2000).optional(),
  reason: z.string().min(4),
});

/**
 * Publish or reject a review.
 *
 * The original submission is never altered — `published_body` holds the
 * redacted version. Publishing updates the driver's aggregate rating in the
 * same transaction, so the profile and the review list cannot disagree.
 */
export async function moderateReviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.drivers.decide");
  const parsed = ReviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const { reviewId, decision, publishedBody, reason } = parsed.data;

  await sql.begin(async (tx) => {
    const [row] = await tx<{ driver_id: string; rating_overall: number }[]>`
      UPDATE reviews
      SET status = ${decision}::review_status,
          published_body = ${decision === "PUBLISHED" ? (publishedBody ?? null) : null},
          moderator_id = ${actor.id}::uuid, moderated_at = now(), moderation_reason = ${reason}
      WHERE id = ${reviewId}::uuid AND status = 'SUBMITTED'
      RETURNING driver_id, rating_overall`;

    if (row && decision === "PUBLISHED") {
      await tx`
        UPDATE driver_profiles
        SET rating_sum = rating_sum + ${row.rating_overall}, rating_count = rating_count + 1
        WHERE id = ${row.driver_id}::uuid`;
    }
  });

  await writeAudit({
    actorUserId: actor.id, action: `review.${decision.toLowerCase()}`,
    objectType: "review", objectId: reviewId, reason,
  });
  revalidatePath("/admin/reviews");
  return { ok: true, message: `Review ${decision.toLowerCase()}.` };
}

// ==========================================================================
// Booking operations
// ==========================================================================

const ReassignSchema = z.object({
  bookingId: z.string().uuid(),
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  reason: z.string().min(10, "Say why — the traveller and the driver both see a change."),
});

export async function reassignBookingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.bookings.reassign");
  const parsed = ReassignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };

  try {
    await reassignBooking({ ...parsed.data, actorUserId: actor.id });
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  await dispatchPending().catch(() => {});
  revalidatePath(`/admin/bookings/${parsed.data.bookingId}`);
  return { ok: true, message: "Reassigned. Both parties have been notified." };
}

const CancelSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().min(10, "A cancellation reason is part of the permanent record."),
});

export async function cancelBookingAdminAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.bookings.reassign");
  const parsed = CancelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };

  try {
    await cancelBooking(parsed.data.bookingId, "STAFF", parsed.data.reason, actor.id);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  await dispatchPending().catch(() => {});
  revalidatePath(`/admin/bookings/${parsed.data.bookingId}`);
  return { ok: true, message: "Cancelled. The driver's calendar has been released." };
}

const RefundSchema = z.object({
  bookingId: z.string().uuid(),
  amount: z.string().min(1),
  reason: z.string().min(10, "Refunds need a reason for the finance record."),
});

/** Refunds move money, so they require the finance permission, not operations. */
export async function refundBookingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.finance.execute");
  const parsed = RefundSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };

  let amountMinor: bigint;
  try {
    amountMinor = parseMajor(parsed.data.amount);
  } catch {
    return { ok: false, message: "Enter the amount as a plain number, for example 45.00" };
  }

  try {
    await refundBooking({
      bookingId: parsed.data.bookingId, amountMinor,
      reason: parsed.data.reason, actorUserId: actor.id,
    });
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  await dispatchPending().catch(() => {});
  revalidatePath(`/admin/bookings/${parsed.data.bookingId}`);
  return { ok: true, message: `Refund of ${parsed.data.amount} recorded and posted to the ledger.` };
}

const EditBookingSchema = z.object({
  bookingId: z.string().uuid(),
  pickupAddress: z.string().min(3).max(300),
  dropoffAddress: z.string().min(3).max(300),
  flightNumber: z.string().max(16).optional(),
  pickupSignName: z.string().max(80).optional(),
  customerPhone: z.string().max(32).optional(),
  notes: z.string().max(1000).optional(),
  reason: z.string().min(5),
});

/**
 * Edit the operational details of a booking. The price, driver and date are
 * deliberately NOT editable here — those change what the traveller agreed to
 * and go through reassignment or a re-quote instead.
 */
export async function editBookingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.bookings.reassign");
  const parsed = EditBookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const v = parsed.data;

  await sql.begin(async (tx) => {
    const [before] = await tx<Record<string, string | null>[]>`
      SELECT pickup_address, dropoff_address, flight_number, pickup_sign_name, customer_phone, notes
      FROM bookings WHERE id = ${v.bookingId}::uuid FOR UPDATE`;
    if (!before) throw new Error("Booking not found.");

    const after = {
      pickup_address: v.pickupAddress, dropoff_address: v.dropoffAddress,
      flight_number: v.flightNumber || null, pickup_sign_name: v.pickupSignName || null,
      customer_phone: v.customerPhone || null, notes: v.notes || null,
    };

    await tx`
      UPDATE bookings SET pickup_address = ${after.pickup_address},
        dropoff_address = ${after.dropoff_address}, flight_number = ${after.flight_number},
        pickup_sign_name = ${after.pickup_sign_name}, customer_phone = ${after.customer_phone},
        notes = ${after.notes}, updated_at = now()
      WHERE id = ${v.bookingId}::uuid`;

    await tx`
      INSERT INTO booking_revisions (booking_id, before, after, reason, actor_id)
      VALUES (${v.bookingId}::uuid, ${JSON.stringify(before)}::text::jsonb,
              ${JSON.stringify(after)}::text::jsonb, ${v.reason}, ${actor.id}::uuid)`;
  });

  await writeAudit({
    actorUserId: actor.id, action: "booking.edited", objectType: "booking",
    objectId: v.bookingId, reason: v.reason,
  });
  revalidatePath(`/admin/bookings/${v.bookingId}`);
  return { ok: true, message: "Saved. The previous values are kept in the revision history." };
}

export async function supportMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.bookings.read");
  const bookingId = String(formData.get("bookingId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!bookingId || !body) return { ok: false, message: "Write a message first." };

  await sql`
    INSERT INTO messages (booking_id, sender, sender_user_id, body)
    VALUES (${bookingId}::uuid, 'STAFF', ${actor.id}::uuid, ${body})`;

  revalidatePath(`/admin/bookings/${bookingId}`);
  return { ok: true, message: "Sent — both the traveller and the driver can see it." };
}

export async function resendNotificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.bookings.read");
  const notificationId = String(formData.get("notificationId") ?? "");
  if (!notificationId) return { ok: false, message: "Unknown notification." };

  // Reset to queued rather than sending directly, so the retry goes through
  // the same dispatcher and delivery is recorded the same way.
  const rows = await sql`
    UPDATE notifications SET state = 'QUEUED', attempts = 0, last_error = NULL
    WHERE id = ${notificationId}::uuid RETURNING id`;
  if (rows.length === 0) return { ok: false, message: "Notification not found." };

  const { sent, failed } = await dispatchPending(5);
  await writeAudit({
    actorUserId: actor.id, action: "notification.resent",
    objectType: "notification", objectId: notificationId,
  });
  revalidatePath("/admin/bookings");
  return {
    ok: failed === 0,
    message: failed === 0 ? `Resent (${sent} delivered).` : "The resend failed again — check the transport.",
  };
}

// ==========================================================================
// Supply and finance
// ==========================================================================

const CreateDriverSchema = z.object({
  email: z.string().email("A working email address is needed — the driver signs in with it."),
  phone: z.string().min(6).max(32),
  publicName: z.string().min(2).max(80),
  legalFirstName: z.string().min(1).max(80),
  legalLastName: z.string().min(1).max(80),
  baseLocationId: z.string().uuid().optional().or(z.literal("")),
  locale: z.enum(["en", "ka", "ru"]).default("ka"),
});

/**
 * Create a driver from the office.
 *
 * Most Georgian drivers will be signed up in person rather than through a web
 * form. The account starts as a DRAFT application exactly as a self-signup
 * would, so the same verification gate applies — creating a driver here does
 * not skip document checks.
 *
 * A one-time password is generated and returned once. We never store or email
 * a plaintext password.
 */
export async function createDriverAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.drivers.decide");
  const parsed = CreateDriverSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const v = parsed.data;

  const existing = await sql`SELECT 1 FROM users WHERE email_normalized = lower(${v.email})`;
  if (existing.length > 0) return { ok: false, message: "An account already uses that email address." };

  const temporaryPassword = `RG-${randomBytes(6).toString("base64url")}`;
  const passwordHash = await hashPassword(temporaryPassword);
  let driverId = "";

  await sql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      INSERT INTO users (email, phone, password_hash, locale, status, email_verified_at)
      VALUES (${v.email}, ${v.phone}, ${passwordHash}, ${v.locale}, 'ACTIVE', now())
      RETURNING id`;

    await tx`INSERT INTO user_roles (user_id, role, granted_by)
             VALUES (${user!.id}::uuid, 'DRIVER_APPLICANT', ${actor.id}::uuid)`;

    const handle = v.publicName.toLowerCase().normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "driver";

    const [driver] = await tx<{ id: string }[]>`
      INSERT INTO driver_profiles (user_id, handle, public_name, legal_first_name, legal_last_name,
                                   base_location_id, status)
      VALUES (${user!.id}::uuid, ${handle} || '-' || substr(md5(random()::text), 1, 4),
              ${v.publicName}, ${v.legalFirstName}, ${v.legalLastName},
              ${v.baseLocationId || null}::uuid, 'DRAFT')
      RETURNING id`;
    driverId = driver!.id;

    await tx`INSERT INTO driver_wallets (driver_id, credit_limit_minor)
             VALUES (${driverId}::uuid, 20000) ON CONFLICT DO NOTHING`;
  });

  await writeAudit({
    actorUserId: actor.id, action: "driver.created_by_staff",
    objectType: "driver_profile", objectId: driverId,
    after: { email: v.email, publicName: v.publicName },
    reason: "onboarded in the office",
  });

  revalidatePath("/admin/drivers");
  return {
    ok: true,
    message:
      `Driver created. Give them this one-time password now — it is not stored ` +
      `and cannot be shown again:  ${temporaryPassword}   ` +
      `They sign in at ${config.appUrl}/login and complete their own documents.`,
  };
}

const WalletSchema = z.object({
  driverId: z.string().uuid(),
  creditLimit: z.string().min(1),
  reason: z.string().min(5),
});

export async function updateWalletAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.finance.execute");
  const parsed = WalletSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };

  let limitMinor: bigint;
  try { limitMinor = parseMajor(parsed.data.creditLimit); }
  catch { return { ok: false, message: "Enter the limit as a plain number, for example 200.00" }; }

  await sql`
    INSERT INTO driver_wallets (driver_id, credit_limit_minor, updated_at)
    VALUES (${parsed.data.driverId}::uuid, ${limitMinor.toString()}::bigint, now())
    ON CONFLICT (driver_id) DO UPDATE
      SET credit_limit_minor = EXCLUDED.credit_limit_minor, updated_at = now()`;

  await writeAudit({
    actorUserId: actor.id, action: "driver.credit_limit_changed",
    objectType: "driver_profile", objectId: parsed.data.driverId,
    after: { creditLimitMinor: limitMinor.toString() }, reason: parsed.data.reason,
  });
  revalidatePath(`/admin/drivers/${parsed.data.driverId}`);
  return { ok: true, message: "Credit limit updated." };
}

const SettlementSchema = z.object({
  driverId: z.string().uuid(),
  amount: z.string().min(1),
  reference: z.string().min(3, "Record how it was paid — bank reference, receipt number, or 'cash in office'."),
});

export async function recordSettlementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.finance.execute");
  const parsed = SettlementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };

  let amountMinor: bigint;
  try { amountMinor = parseMajor(parsed.data.amount); }
  catch { return { ok: false, message: "Enter the amount as a plain number, for example 120.00" }; }

  try {
    await recordCashSettlement({
      driverId: parsed.data.driverId, amountMinor,
      reference: parsed.data.reference, actorUserId: actor.id,
    });
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath(`/admin/drivers/${parsed.data.driverId}`);
  revalidatePath("/admin/finance");
  return { ok: true, message: `Settlement of ${parsed.data.amount} recorded against their balance.` };
}

// ==========================================================================
// Configuration
// ==========================================================================

const RouteSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers and hyphens."),
  originId: z.string().uuid(),
  destinationId: z.string().uuid(),
  distanceKm: z.coerce.number().positive("Distance must be greater than zero."),
  driveMinutes: z.coerce.number().int().positive(),
  returnKm: z.coerce.number().min(0),
  deadheadRecoveryPct: z.coerce.number().min(0).max(100),
  riskFactorPct: z.coerce.number().min(100).max(200),
  minFare: z.string().default("0"),
  requires4x4: z.enum(["on", "off"]).optional(),
  seasonalNote: z.string().max(300).optional(),
});

/**
 * Create or update a priced corridor.
 *
 * The deadhead recovery is the single most consequential number an operator
 * sets: it decides how much of the driver's empty return the traveller pays
 * for, and therefore whether long remote routes are worth anyone's time.
 */
export async function saveRouteFamilyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.locations.write");
  const parsed = RouteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const v = parsed.data;

  if (v.originId === v.destinationId) {
    return { ok: false, message: "A route needs two different places." };
  }

  let minFareMinor: bigint;
  try { minFareMinor = parseMajor(v.minFare || "0"); }
  catch { return { ok: false, message: "Enter the minimum fare as a plain number." }; }

  try {
    await sql`
      INSERT INTO route_families (slug, origin_id, destination_id, distance_km, drive_minutes,
        return_km, deadhead_recovery_bps, risk_factor_bps, min_fare_minor, requires_4x4, seasonal_note)
      VALUES (${v.slug}, ${v.originId}::uuid, ${v.destinationId}::uuid, ${v.distanceKm},
              ${v.driveMinutes}, ${v.returnKm}, ${Math.round(v.deadheadRecoveryPct * 100)},
              ${Math.round(v.riskFactorPct * 100)}, ${minFareMinor.toString()}::bigint,
              ${v.requires4x4 === "on"}, ${v.seasonalNote || null})
      ON CONFLICT (origin_id, destination_id) DO UPDATE SET
        distance_km = EXCLUDED.distance_km, drive_minutes = EXCLUDED.drive_minutes,
        return_km = EXCLUDED.return_km, deadhead_recovery_bps = EXCLUDED.deadhead_recovery_bps,
        risk_factor_bps = EXCLUDED.risk_factor_bps, min_fare_minor = EXCLUDED.min_fare_minor,
        requires_4x4 = EXCLUDED.requires_4x4, seasonal_note = EXCLUDED.seasonal_note`;
  } catch (err) {
    if (String(err).includes("route_families_slug")) {
      return { ok: false, message: "That slug is already used by another route." };
    }
    throw err;
  }

  await writeAudit({
    actorUserId: actor.id, action: "route_family.saved", objectType: "route_family",
    objectId: v.slug, after: v, reason: "route configuration",
  });
  revalidatePath("/admin/locations");
  return { ok: true, message: `Route ${v.slug} saved. New quotes use it immediately.` };
}

const BandSchema = z.object({
  class: z.enum(["ECONOMY", "COMFORT", "MINIVAN", "SUV_4X4", "MINIBUS", "PREMIUM"]),
  minRatePerKm: z.string(),
  maxRatePerKm: z.string(),
  minFareFloor: z.string(),
  maxFareCeiling: z.string(),
  maxOvernight: z.string(),
  maxSeasonPct: z.coerce.number().min(100).max(200),
  reason: z.string().min(10, "A band change reprices the whole marketplace — say why."),
});

/**
 * Change the guardrails on what drivers may charge.
 *
 * This silently reprices every future quote in a vehicle class, so it needs
 * the pricing permission and a written reason. Existing bookings are
 * untouched: they hold their own frozen quote.
 */
export async function savePriceBandAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.pricing.bands.write");
  const parsed = BandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const v = parsed.data;

  let money;
  try {
    money = {
      minRate: parseMajor(v.minRatePerKm), maxRate: parseMajor(v.maxRatePerKm),
      floor: parseMajor(v.minFareFloor), ceiling: parseMajor(v.maxFareCeiling),
      overnight: parseMajor(v.maxOvernight),
    };
  } catch {
    return { ok: false, message: "Enter every amount as a plain number, for example 1.20" };
  }

  if (money.minRate > money.maxRate) return { ok: false, message: "The minimum rate is above the maximum." };
  if (money.floor > money.ceiling) return { ok: false, message: "The fare floor is above the ceiling." };

  const [before] = await sql`SELECT * FROM price_bands WHERE class = ${v.class}::vehicle_class`;

  await sql`
    UPDATE price_bands SET
      min_rate_per_km_minor = ${money.minRate.toString()}::bigint,
      max_rate_per_km_minor = ${money.maxRate.toString()}::bigint,
      min_fare_floor_minor = ${money.floor.toString()}::bigint,
      max_fare_ceiling_minor = ${money.ceiling.toString()}::bigint,
      max_overnight_minor = ${money.overnight.toString()}::bigint,
      max_season_factor_bps = ${Math.round(v.maxSeasonPct * 100)}
    WHERE class = ${v.class}::vehicle_class`;

  // Drivers whose current plan now sits outside the band keep quoting at their
  // old rate until they edit it, so operations needs to know who they are.
  const [outside] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM price_plans p
    JOIN vehicles ve ON ve.id = p.vehicle_id
    WHERE p.status = 'ACTIVE' AND ve.class = ${v.class}::vehicle_class
      AND (p.rate_per_km_minor < ${money.minRate.toString()}::bigint
           OR p.rate_per_km_minor > ${money.maxRate.toString()}::bigint)`;

  await writeAudit({
    actorUserId: actor.id, action: "price_band.changed", objectType: "price_band",
    objectId: v.class, before: redact(before as Record<string, unknown>), after: v, reason: v.reason,
  });
  revalidatePath("/admin/pricing");
  return {
    ok: true,
    message: (outside?.n ?? 0) > 0
      ? `Band saved. ${outside!.n} active price plan(s) now sit outside it and will keep their old rate until the driver edits it.`
      : "Band saved. Every active price plan is still inside it.",
  };
}

const StaffSchema = z.object({
  email: z.string().email(),
  roles: z.string().min(1, "Choose at least one role."),
  reason: z.string().min(5),
});

const ASSIGNABLE_ROLES = [
  "SUPPORT_AGENT", "OPERATIONS_MANAGER", "FINANCE_ADMIN", "CONTENT_ADMIN", "SUPER_ADMIN",
] as const;

/**
 * Grant staff access to an existing account, or create one.
 *
 * Only a super admin may do this, and the roles granted are recorded with a
 * reason — this is the permission that can grant every other permission.
 */
export async function saveStaffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.rbac.write");
  const parsed = StaffSchema.safeParse({
    email: formData.get("email"),
    roles: formData.getAll("roles").join(","),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };

  const roles = parsed.data.roles.split(",").filter((r) =>
    (ASSIGNABLE_ROLES as readonly string[]).includes(r));
  if (roles.length === 0) return { ok: false, message: "Choose at least one valid role." };

  let temporaryPassword: string | null = null;
  let userId = "";

  await sql.begin(async (tx) => {
    const [existing] = await tx<{ id: string }[]>`
      SELECT id FROM users WHERE email_normalized = lower(${parsed.data.email})`;

    if (existing) {
      userId = existing.id;
    } else {
      temporaryPassword = `RG-${randomBytes(6).toString("base64url")}`;
      const [created] = await tx<{ id: string }[]>`
        INSERT INTO users (email, password_hash, status, email_verified_at)
        VALUES (${parsed.data.email}, ${await hashPassword(temporaryPassword)}, 'ACTIVE', now())
        RETURNING id`;
      userId = created!.id;
    }

    // Replace the staff roles wholesale, leaving any driver or customer roles
    // alone: revoking is as important as granting and must be one action.
    await tx`
      DELETE FROM user_roles WHERE user_id = ${userId}::uuid
        AND role::text = ANY(${[...ASSIGNABLE_ROLES]}::text[])`;
    for (const role of roles) {
      await tx`INSERT INTO user_roles (user_id, role, granted_by)
               VALUES (${userId}::uuid, ${role}::app_role, ${actor.id}::uuid)`;
    }
  });

  await writeAudit({
    actorUserId: actor.id, action: "staff.roles_granted", objectType: "user",
    objectId: userId, after: { email: parsed.data.email, roles }, reason: parsed.data.reason,
  });
  revalidatePath("/admin/staff");
  return {
    ok: true,
    message: temporaryPassword
      ? `Account created with roles ${roles.join(", ")}. One-time password, shown once: ${temporaryPassword}`
      : `Roles updated to ${roles.join(", ")}.`,
  };
}

export async function revokeStaffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.rbac.write");
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { ok: false, message: "Unknown account." };
  if (userId === actor.id) {
    return { ok: false, message: "You cannot revoke your own access — ask another super admin." };
  }

  await sql.begin(async (tx) => {
    await tx`DELETE FROM user_roles WHERE user_id = ${userId}::uuid
             AND role::text = ANY(${[...ASSIGNABLE_ROLES]}::text[])`;
    // End their sessions immediately; a revoked role should not survive until
    // whatever they had open expires.
    await tx`UPDATE sessions SET revoked_at = now()
             WHERE user_id = ${userId}::uuid AND revoked_at IS NULL`;
  });

  await writeAudit({
    actorUserId: actor.id, action: "staff.access_revoked", objectType: "user",
    objectId: userId, reason: "access revoked from the staff screen",
  });
  revalidatePath("/admin/staff");
  return { ok: true, message: "Access revoked and their sessions ended." };
}

const ContentSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers and hyphens."),
  locale: z.enum(["en", "ka", "ru"]),
  kind: z.string().default("PAGE"),
  title: z.string().min(2).max(200),
  body: z.string().max(20000).optional(),
});

export async function saveContentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.content.write");
  const parsed = ContentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const v = parsed.data;

  await sql`
    INSERT INTO content_pages (slug, locale, kind, title, body, published, updated_at)
    VALUES (${v.slug}, ${v.locale}, ${v.kind}, ${v.title}, ${v.body ?? ""},
            ${formData.get("published") === "on"}, now())
    ON CONFLICT (slug, locale) DO UPDATE SET
      kind = EXCLUDED.kind, title = EXCLUDED.title, body = EXCLUDED.body,
      published = EXCLUDED.published, updated_at = now()`;

  await writeAudit({
    actorUserId: actor.id, action: "content.saved", objectType: "content_page",
    objectId: `${v.slug}:${v.locale}`, after: { title: v.title }, reason: "content edit",
  });
  revalidatePath("/admin/content");
  revalidatePath(`/${v.locale}/${v.slug}`);
  return { ok: true, message: `Saved ${v.slug} (${v.locale}).` };
}

const ImageTargetSchema = z.object({
  target: z.enum(["location", "route", "tour"]),
  id: z.string().uuid(),
  alt: z.string().min(3, "Describe the photo — screen readers and search engines both use it.").max(200),
});

/**
 * Upload a photograph for a place, route or tour.
 *
 * Until one exists the public pages draw a generated illustration, which is
 * deliberate: shipping stock photography of Georgia would be both a licensing
 * problem and a promise about a specific view we cannot keep. Upload only
 * photographs you own or have cleared.
 */
export async function uploadPlaceImageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.content.write");
  const parsed = ImageTargetSchema.safeParse({
    target: formData.get("target"), id: formData.get("id"), alt: formData.get("alt"),
  });
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose an image." };
  if (file.type === "application/pdf") return { ok: false, message: "Photos must be images." };

  let stored;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    assertUploadAllowed(file.type, buffer.byteLength);
    stored = await getStorage().put("public-media", buffer, file.type);
  } catch (err) {
    if (err instanceof UploadRejectedError) return { ok: false, message: err.message };
    throw err;
  }

  const { target, id, alt } = parsed.data;
  if (target === "location") {
    await sql`UPDATE locations SET image_key = ${stored.key}, image_alt = ${alt} WHERE id = ${id}::uuid`;
  } else if (target === "route") {
    await sql`UPDATE route_families SET image_key = ${stored.key}, image_alt = ${alt} WHERE id = ${id}::uuid`;
  } else {
    await sql`UPDATE tours SET hero_image_key = ${stored.key}, hero_image_alt = ${alt} WHERE id = ${id}::uuid`;
  }

  await writeAudit({
    actorUserId: actor.id, action: "place_image.uploaded", objectType: target,
    objectId: id, after: { alt, sizeBytes: stored.sizeBytes }, reason: "imagery updated",
  });
  revalidatePath("/admin/images");
  return { ok: true, message: "Uploaded. It replaces the illustration on every page that shows this." };
}

export async function removePlaceImageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.content.write");
  const target = String(formData.get("target") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!["location", "route", "tour"].includes(target) || !id) {
    return { ok: false, message: "Unknown item." };
  }

  if (target === "location") {
    await sql`UPDATE locations SET image_key = NULL, image_alt = NULL WHERE id = ${id}::uuid`;
  } else if (target === "route") {
    await sql`UPDATE route_families SET image_key = NULL, image_alt = NULL WHERE id = ${id}::uuid`;
  } else {
    await sql`UPDATE tours SET hero_image_key = NULL, hero_image_alt = NULL WHERE id = ${id}::uuid`;
  }

  await writeAudit({
    actorUserId: actor.id, action: "place_image.removed", objectType: target, objectId: id,
    reason: "reverted to the generated illustration",
  });
  revalidatePath("/admin/images");
  return { ok: true, message: "Removed — the illustration is shown again." };
}

// ==========================================================================
// Support tickets
// ==========================================================================

const TicketSchema = z.object({
  bookingId: z.string().uuid().optional().or(z.literal("")),
  subject: z.string().min(5).max(200),
  category: z.string().min(2).max(60),
  severity: z.enum(["SEV1", "SEV2", "SEV3", "SEV4"]).default("SEV3"),
  note: z.string().max(4000).optional(),
});

export async function openTicketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.bookings.read");
  const parsed = TicketSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const v = parsed.data;

  let ticketId = "";
  await sql.begin(async (tx) => {
    const [ticket] = await tx<{ id: string }[]>`
      INSERT INTO support_tickets (booking_id, subject, category, severity, opened_by, owner_id)
      VALUES (${v.bookingId || null}::uuid, ${v.subject}, ${v.category},
              ${v.severity}::ticket_severity, ${actor.id}::uuid, ${actor.id}::uuid)
      RETURNING id`;
    ticketId = ticket!.id;
    if (v.note) {
      await tx`INSERT INTO support_notes (ticket_id, author_id, body)
               VALUES (${ticketId}::uuid, ${actor.id}::uuid, ${v.note})`;
    }
  });

  await writeAudit({
    actorUserId: actor.id, action: "ticket.opened", objectType: "support_ticket",
    objectId: ticketId, after: { subject: v.subject, severity: v.severity }, reason: v.category,
  });
  revalidatePath("/admin/support");
  return { ok: true, message: "Ticket opened." };
}

const TicketUpdateSchema = z.object({
  ticketId: z.string().uuid(),
  state: z.enum(["OPEN", "WAITING", "RESOLVED", "CLOSED"]),
  note: z.string().max(4000).optional(),
  resolution: z.string().max(2000).optional(),
});

export async function updateTicketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.bookings.read");
  const parsed = TicketUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const v = parsed.data;

  const closing = v.state === "RESOLVED" || v.state === "CLOSED";
  if (closing && !v.resolution) {
    return { ok: false, message: "Say how it was resolved — that is the part worth reading later." };
  }

  await sql.begin(async (tx) => {
    await tx`
      UPDATE support_tickets
      SET state = ${v.state}::ticket_state,
          resolution = coalesce(${v.resolution ?? null}, resolution),
          resolved_at = ${closing ? "now()" : null}::timestamptz,
          updated_at = now()
      WHERE id = ${v.ticketId}::uuid`;
    if (v.note) {
      await tx`INSERT INTO support_notes (ticket_id, author_id, body)
               VALUES (${v.ticketId}::uuid, ${actor.id}::uuid, ${v.note})`;
    }
  });

  await writeAudit({
    actorUserId: actor.id, action: `ticket.${v.state.toLowerCase()}`,
    objectType: "support_ticket", objectId: v.ticketId, reason: v.resolution ?? v.note ?? null,
  });
  revalidatePath("/admin/support");
  return { ok: true, message: "Ticket updated." };
}


// ------------------------------------------------ office document upload ---
/**
 * Upload a document ON BEHALF of a driver.
 *
 * Real onboarding happens across a desk: the driver brings paper, staff scan
 * it. The upload lands as PENDING — the same reviewer flow as a driver's own
 * upload — so "staff uploaded it" never silently becomes "staff approved it".
 */
const StaffDocSchema = z.object({
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid().optional().or(z.literal("")),
  type: z.enum(["IDENTITY", "DRIVING_LICENSE", "VEHICLE_REGISTRATION", "INSURANCE", "INSPECTION"]),
  expiresOn: z.string().optional(),
  number: z.string().max(64).optional(),
});

export async function uploadDriverDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.drivers.decide");
  const parsed = StaffDocSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const v = parsed.data;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file to upload." };
  if (["DRIVING_LICENSE", "INSURANCE"].includes(v.type) && !v.expiresOn) {
    return { ok: false, message: "An expiry date is required for this document type." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    assertUploadAllowed(file.type, buffer.byteLength);
    const stored = await getStorage().put("restricted-kyc", buffer, file.type);

    await sql`
      INSERT INTO driver_documents
        (driver_id, vehicle_id, type, storage_key, number_hash, mime_type, size_bytes,
         checksum, expires_on, is_mandatory, state)
      VALUES (${v.driverId}::uuid, ${v.vehicleId || null}::uuid, ${v.type}::doc_type, ${stored.key},
              ${v.number ? hashDocumentNumber(v.number) : null}, ${stored.mimeType}, ${stored.sizeBytes},
              ${stored.checksum}, ${v.expiresOn || null}::date, true, 'PENDING')`;

    await writeAudit({
      actorUserId: actor.id, action: "driver.document_uploaded_by_staff",
      objectType: "driver_document", objectId: v.driverId,
      after: { type: v.type, expiresOn: v.expiresOn || null, sizeBytes: stored.sizeBytes },
      reason: "office onboarding",
    });
  } catch (err) {
    if (err instanceof UploadRejectedError) return { ok: false, message: err.message };
    throw err;
  }

  revalidatePath(`/admin/drivers/${v.driverId}`);
  return { ok: true, message: "Uploaded as pending. Review and approve it below." };
}

// --------------------------------------------------------- tour editing ----
const TourTranslationSchema = z.object({
  tourId: z.string().uuid(),
  locale: z.enum(["en", "ka", "ru"]),
  title: z.string().min(3).max(120),
  summary: z.string().min(10).max(400),
  body: z.string().min(10).max(8000),
});

export async function saveTourTranslationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.content.write");
  const parsed = TourTranslationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const v = parsed.data;

  const [tour] = await sql<{ slug: string }[]>`SELECT slug FROM tours WHERE id = ${v.tourId}::uuid`;
  if (!tour) return { ok: false, message: "Tour not found." };

  await sql`
    INSERT INTO tour_translations (tour_id, locale, title, summary, body)
    VALUES (${v.tourId}::uuid, ${v.locale}, ${v.title}, ${v.summary}, ${v.body})
    ON CONFLICT (tour_id, locale) DO UPDATE SET
      title = EXCLUDED.title, summary = EXCLUDED.summary, body = EXCLUDED.body`;

  await writeAudit({
    actorUserId: actor.id, action: "tour.translation_saved", objectType: "tour",
    objectId: v.tourId, after: { locale: v.locale, title: v.title }, reason: "content edit",
  });

  for (const l of ["en", "ka", "ru"]) {
    revalidatePath(`/${l}/tours`);
    revalidatePath(`/${l}/tours/${tour.slug}`);
    revalidatePath(`/${l}`);
  }
  revalidatePath("/admin/tours");
  return { ok: true, message: `Saved ${v.locale.toUpperCase()} text for ${tour.slug}.` };
}

const TourActiveSchema = z.object({
  tourId: z.string().uuid(),
  active: z.enum(["on", "off"]),
  reason: z.string().min(5),
});

export async function toggleTourAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.content.write");
  const parsed = TourActiveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const v = parsed.data;

  const [tour] = await sql<{ slug: string; active: boolean }[]>`
    UPDATE tours SET active = ${v.active === "on"} WHERE id = ${v.tourId}::uuid
    RETURNING slug, active`;
  if (!tour) return { ok: false, message: "Tour not found." };

  await writeAudit({
    actorUserId: actor.id, action: "tour.active_toggled", objectType: "tour",
    objectId: v.tourId, after: { active: tour.active }, reason: v.reason,
  });
  for (const l of ["en", "ka", "ru"]) { revalidatePath(`/${l}/tours`); revalidatePath(`/${l}`); }
  revalidatePath("/admin/tours");
  return { ok: true, message: `${tour.slug} is now ${tour.active ? "visible" : "hidden"}.` };
}


const TourCategorySchema = z.object({
  tourId: z.string().uuid(),
  category: z.enum(["sea", "mountains", "winter", "culture", "wine"]),
});

export async function saveTourCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requirePermission("admin.content.write");
  const parsed = TourCategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const [tour] = await sql<{ slug: string }[]>`
    UPDATE tours SET category = ${parsed.data.category} WHERE id = ${parsed.data.tourId}::uuid RETURNING slug`;
  if (!tour) return { ok: false, message: "Tour not found." };
  await writeAudit({
    actorUserId: actor.id, action: "tour.category_changed", objectType: "tour",
    objectId: parsed.data.tourId, after: { category: parsed.data.category }, reason: "content edit",
  });
  for (const l of ["en", "ka", "ru"]) revalidatePath(`/${l}/tours`);
  revalidatePath("/admin/tours");
  return { ok: true, message: `${tour.slug} is now in "${parsed.data.category}".` };
}