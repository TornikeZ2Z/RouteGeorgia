"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "@db/client";
import { verifyManageToken, cancelBooking } from "@/lib/booking";
import { dispatchPending } from "@/lib/notifications";

export type BookingActionState = { ok: boolean; message?: string };

const Base = z.object({ code: z.string().min(4), token: z.string().min(10) });

/** Every customer action re-verifies the magic link. The token is the authorisation. */
async function authorise(formData: FormData): Promise<string> {
  const parsed = Base.safeParse({ code: formData.get("code"), token: formData.get("token") });
  if (!parsed.success) throw new Error("This link is not valid.");
  const bookingId = await verifyManageToken(parsed.data.code, parsed.data.token);
  if (!bookingId) throw new Error("This link is not valid or has expired.");
  return bookingId;
}

export async function cancelBookingAction(_prev: BookingActionState, formData: FormData): Promise<BookingActionState> {
  let bookingId: string;
  try { bookingId = await authorise(formData); }
  catch (err) { return { ok: false, message: (err as Error).message }; }

  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { ok: false, message: "Please tell us briefly why you are cancelling." };

  try {
    await cancelBooking(bookingId, "CUSTOMER", reason);
    await dispatchPending().catch(() => {});
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }

  revalidatePath(`/`);
  return { ok: true, message: "Your booking has been cancelled. A confirmation is on its way." };
}

export async function sendMessageAction(_prev: BookingActionState, formData: FormData): Promise<BookingActionState> {
  let bookingId: string;
  try { bookingId = await authorise(formData); }
  catch (err) { return { ok: false, message: (err as Error).message }; }

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 1) return { ok: false, message: "Write a message first." };
  if (body.length > 2000) return { ok: false, message: "That message is too long." };

  // Warn, do not block. We protect the marketplace without reading private
  // conversations for anything other than this narrow pattern.
  const looksLikeContact = /(\+?\d[\d\s().-]{7,})|(\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b)/i.test(body);

  await sql`
    INSERT INTO messages (booking_id, sender, body, flagged, flag_reason)
    VALUES (${bookingId}::uuid, 'CUSTOMER', ${body}, ${looksLikeContact},
            ${looksLikeContact ? "contact details detected before trip" : null})`;

  revalidatePath(`/`);
  return {
    ok: true,
    message: looksLikeContact
      ? "Sent. Keep arrangements on the platform so support can help if anything changes."
      : "Sent.",
  };
}
