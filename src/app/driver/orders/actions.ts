"use server";

import { revalidatePath } from "next/cache";
import { translateMessage } from "@/lib/translate";
import { isLocale, type Locale } from "@/lib/i18n";
import { z } from "zod";
import { sql } from "@db/client";
import { requireUser } from "@/lib/auth/session";
import { completeBooking, cancelBooking } from "@/lib/booking";
import { dispatchPending } from "@/lib/notifications";
import { writeAudit } from "@/lib/audit";
import type { ActionState } from "@/app/driver/actions";

/**
 * Driver order actions.
 *
 * Every one resolves the booking through the signed-in driver's own profile,
 * so a driver can never act on somebody else's trip by guessing an id.
 */
async function ownBooking(bookingId: string) {
  const user = await requireUser();
  const [row] = await sql<{ id: string; status: string; driver_id: string; payment_mode: string; code: string }[]>`
    SELECT b.id, b.status::text AS status, b.driver_id, b.payment_mode::text AS payment_mode, b.code
    FROM bookings b
    JOIN driver_profiles d ON d.id = b.driver_id
    WHERE b.id = ${bookingId}::uuid AND d.user_id = ${user.id}::uuid`;
  return { user, booking: row ?? null };
}

const Id = z.object({ bookingId: z.string().uuid() });

export async function acknowledgeOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = Id.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Unknown booking." };
  const { user, booking } = await ownBooking(parsed.data.bookingId);
  if (!booking) return { ok: false, message: "Booking not found." };
  if (booking.status !== "CONFIRMED") return { ok: false, message: "This order no longer needs confirming." };

  await sql.begin(async (tx) => {
    await tx`
      UPDATE bookings SET status='DRIVER_ACKNOWLEDGED', acknowledged_at=now(), updated_at=now()
      WHERE id=${booking.id}::uuid`;
    await tx`
      INSERT INTO booking_status_history (booking_id, from_status, to_status, actor_id, actor_role, reason)
      VALUES (${booking.id}::uuid, 'CONFIRMED', 'DRIVER_ACKNOWLEDGED', ${user.id}::uuid, 'DRIVER', 'driver confirmed the order')`;
    // Acknowledgement reliability feeds the ranking score.
    await tx`
      UPDATE driver_profiles
      SET ack_total = ack_total + 1, ack_on_time = ack_on_time + 1
      WHERE id = ${booking.driver_id}::uuid`;
  });

  await writeAudit({ actorUserId: user.id, actorRole: "DRIVER", action: "booking.acknowledged",
    objectType: "booking", objectId: booking.id });
  revalidatePath("/driver/orders");
  return { ok: true, message: "Confirmed. The traveller has been told." };
}

const Milestone = z.object({
  bookingId: z.string().uuid(),
  milestone: z.enum(["READY", "DRIVER_ARRIVED", "IN_PROGRESS", "COMPLETED"]),
});

/** Allowed forward transitions. A driver cannot skip or reverse a step. */
const NEXT: Record<string, string[]> = {
  DRIVER_ACKNOWLEDGED: ["READY", "DRIVER_ARRIVED"],
  READY: ["DRIVER_ARRIVED"],
  DRIVER_ARRIVED: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
};

export async function milestoneAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = Milestone.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Unknown action." };
  const { user, booking } = await ownBooking(parsed.data.bookingId);
  if (!booking) return { ok: false, message: "Booking not found." };

  const allowed = NEXT[booking.status] ?? [];
  if (!allowed.includes(parsed.data.milestone)) {
    return { ok: false, message: `You cannot go from ${booking.status.toLowerCase().replaceAll("_", " ")} to that step.` };
  }

  if (parsed.data.milestone === "COMPLETED") {
    // Completion posts the ledger entries and issues the review invitation.
    await completeBooking(booking.id, user.id);
    await dispatchPending().catch(() => {});
    revalidatePath("/driver/orders");
    return {
      ok: true,
      message: booking.payment_mode === "CASH"
        ? "Trip completed. The commission has been added to your balance."
        : "Trip completed. Your earnings will appear in your next statement.",
    };
  }

  await sql.begin(async (tx) => {
    await tx`UPDATE bookings SET status=${parsed.data.milestone}::booking_status, updated_at=now()
             WHERE id=${booking.id}::uuid`;
    await tx`
      INSERT INTO booking_status_history (booking_id, from_status, to_status, actor_id, actor_role, reason)
      VALUES (${booking.id}::uuid, ${booking.status}::booking_status,
              ${parsed.data.milestone}::booking_status, ${user.id}::uuid, 'DRIVER', 'driver milestone')`;
  });

  revalidatePath("/driver/orders");
  return { ok: true, message: "Updated." };
}

export async function declineOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = Id.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Unknown booking." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 5) return { ok: false, message: "Please give a reason so we can find a replacement." };

  const { user, booking } = await ownBooking(parsed.data.bookingId);
  if (!booking) return { ok: false, message: "Booking not found." };

  // A driver cancellation is never free of consequence: it is counted, and
  // operations owns finding the traveller an equivalent replacement.
  await cancelBooking(booking.id, "DRIVER", reason, user.id);
  await dispatchPending().catch(() => {});
  revalidatePath("/driver/orders");
  return { ok: true, message: "Declined. Operations has been alerted to find a replacement." };
}

export async function confirmCashAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = Id.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Unknown booking." };
  const { user, booking } = await ownBooking(parsed.data.bookingId);
  if (!booking) return { ok: false, message: "Booking not found." };

  await sql`UPDATE bookings SET cash_confirmed_at = now() WHERE id = ${booking.id}::uuid`;
  await writeAudit({ actorUserId: user.id, actorRole: "DRIVER", action: "booking.cash_confirmed",
    objectType: "booking", objectId: booking.id });
  revalidatePath("/driver/orders");
  return { ok: true, message: "Thank you. Recorded against your balance." };
}

export async function sendDriverMessageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = Id.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Unknown booking." };
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, message: "Write a message first." };

  const { user, booking } = await ownBooking(parsed.data.bookingId);
  if (!booking) return { ok: false, message: "Booking not found." };

  await sql`
    INSERT INTO messages (booking_id, sender, sender_user_id, body)
    VALUES (${booking.id}::uuid, 'DRIVER', ${user.id}::uuid, ${body})`;

  // Replying is unambiguous evidence the driver read what was waiting.
  await sql`
    UPDATE messages SET read_at = now()
    WHERE booking_id = ${booking.id}::uuid AND sender <> 'DRIVER' AND read_at IS NULL`;

  revalidatePath("/driver/orders");
  return { ok: true, message: "Sent." };
}

/**
 * Translate one message into the driver's own language, on demand.
 *
 * Scoped to the driver's own bookings: a message id is not a capability, so
 * ownership is re-checked here rather than trusted from the client.
 */
export async function translateMessageAction(
  messageId: string,
): Promise<{ ok: boolean; body?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return { ok: false };

  const user = await requireUser();
  const [row] = await sql<{ id: string; body: string }[]>`
    SELECT m.id, m.body
    FROM messages m
    JOIN bookings b ON b.id = m.booking_id
    JOIN driver_profiles d ON d.id = b.driver_id
    WHERE m.id = ${messageId}::uuid AND d.user_id = ${user.id}::uuid`;
  if (!row) return { ok: false };

  const target = (isLocale(user.locale) ? user.locale : "ka") as Locale;
  const result = await translateMessage(row.id, row.body, target);
  return result.translated ? { ok: true, body: result.body } : { ok: false };
}
