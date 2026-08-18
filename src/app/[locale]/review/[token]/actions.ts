"use server";

import { z } from "zod";
import { sql } from "@db/client";
import { hash } from "@/lib/booking";

export type ReviewState = { ok: boolean; message?: string };

const Schema = z.object({
  token: z.string().min(10),
  overall: z.coerce.number().int().min(1).max(5),
  safety: z.coerce.number().int().min(1).max(5).optional(),
  punctuality: z.coerce.number().int().min(1).max(5).optional(),
  cleanliness: z.coerce.number().int().min(1).max(5).optional(),
  communication: z.coerce.number().int().min(1).max(5).optional(),
  authorName: z.string().max(60).optional(),
  body: z.string().max(2000).optional(),
});

export async function submitReviewAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Please give an overall rating." };
  const v = parsed.data;

  try {
    await sql.begin(async (tx) => {
      // Consume the token first. Doing this inside the transaction makes a
      // double submission impossible even if the traveller clicks twice.
      const [claimed] = await tx<{ booking_id: string }[]>`
        UPDATE review_tokens SET consumed_at = now()
        WHERE token_hash = ${hash(v.token)} AND consumed_at IS NULL AND expires_at > now()
        RETURNING booking_id`;
      if (!claimed) throw new Error("This review link has already been used or has expired.");

      const [booking] = await tx<{ driver_id: string; status: string; contact_locale: string }[]>`
        SELECT driver_id, status::text AS status, contact_locale FROM bookings WHERE id = ${claimed.booking_id}::uuid`;
      if (!booking || !["COMPLETED", "CLOSED"].includes(booking.status)) {
        throw new Error("Only a completed trip can be reviewed.");
      }

      await tx`
        INSERT INTO reviews (booking_id, driver_id, rating_overall, rating_safety, rating_punctuality,
                             rating_cleanliness, rating_communication, author_name, body, source_locale)
        VALUES (${claimed.booking_id}::uuid, ${booking.driver_id}::uuid, ${v.overall},
                ${v.safety ?? null}, ${v.punctuality ?? null}, ${v.cleanliness ?? null},
                ${v.communication ?? null}, ${v.authorName ?? null}, ${v.body ?? null},
                ${booking.contact_locale})`;
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "That did not work." };
  }

  return { ok: true };
}
