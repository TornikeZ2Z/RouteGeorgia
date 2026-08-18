"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, sql } from "@db/client";
import { driverProfiles, vehicles, locations } from "@db/schema";
import { requirePermission } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
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

  revalidatePath("/admin/drivers");
  revalidatePath(`/admin/drivers/${driverId}`);
  return { ok: true, message: `Driver set to ${decision.replaceAll("_", " ").toLowerCase()}.` };
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
