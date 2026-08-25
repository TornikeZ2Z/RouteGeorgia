"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { writeAudit } from "@/lib/audit";
import { assertUploadAllowed, getStorage, UploadRejectedError } from "@/lib/storage";
import { queue, dispatchPending } from "@/lib/notifications";
import { config } from "@/lib/config";

export interface ActionState {
  ok: boolean;
  message?: string;
}

const CATEGORIES = ["BOOKING", "PAYMENT", "VEHICLE", "DOCUMENTS", "ACCOUNT", "OTHER"] as const;
/** The driver's three words map onto the operational severity scale. */
const SEVERITY: Record<string, string> = { HIGH: "SEV1", NORMAL: "SEV3", LOW: "SEV4" };

async function myDriver() {
  const user = await requireUser();
  const [driver] = await sql<{ id: string; public_name: string }[]>`
    SELECT id, public_name FROM driver_profiles WHERE user_id = ${user.id}::uuid`;
  return { user, driver };
}

/**
 * A driver opens a ticket.
 *
 * Until now their only route to us was outside the product entirely. The
 * ticket lands in the same operations queue staff already work, with the
 * driver recorded as the opener so a reply can find its way back.
 */
export async function openTicketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, driver } = await myDriver();
  if (!driver) return { ok: false, message: "Create your profile first." };

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const category = String(formData.get("category") ?? "OTHER");
  const priority = String(formData.get("priority") ?? "NORMAL");
  const bookingCode = String(formData.get("bookingCode") ?? "").trim();

  if (subject.length < 3) return { ok: false, message: "Give the problem a short title." };
  if (body.length < 10) return { ok: false, message: "Describe what happened, so we can act on it." };
  if (!(CATEGORIES as readonly string[]).includes(category)) return { ok: false, message: "Unknown category." };

  // A booking reference is optional, but a wrong one is worth saying out loud
  // rather than silently filing the ticket against nothing.
  let bookingId: string | null = null;
  if (bookingCode) {
    const [booking] = await sql<{ id: string }[]>`
      SELECT id FROM bookings
      WHERE upper(code) = upper(${bookingCode}) AND driver_id = ${driver.id}::uuid`;
    if (!booking) return { ok: false, message: "No booking of yours has that code." };
    bookingId = booking.id;
  }

  const [ticket] = await sql<{ id: string }[]>`
    INSERT INTO support_tickets (booking_id, driver_id, subject, category, severity, state, opened_by)
    VALUES (${bookingId}::uuid, ${driver.id}::uuid, ${subject}, ${category},
            ${SEVERITY[priority] ?? "SEV3"}::ticket_severity, 'OPEN', ${user.id}::uuid)
    RETURNING id`;

  // The driver's own words, visible to them — unlike a staff note, which is
  // internal until someone deliberately shares it.
  await sql`
    INSERT INTO support_notes (ticket_id, author_id, body, visible_to_driver)
    VALUES (${ticket!.id}::uuid, ${user.id}::uuid, ${body}, true)`;

  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files.slice(0, 4)) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      assertUploadAllowed(file.type, buffer.byteLength);
      const stored = await getStorage().put("restricted-kyc", buffer, file.type);
      await sql`
        INSERT INTO support_attachments (ticket_id, storage_key, content_type, byte_size, uploaded_by)
        VALUES (${ticket!.id}::uuid, ${stored.key}, ${stored.mimeType}, ${stored.sizeBytes}, ${user.id}::uuid)`;
    } catch (err) {
      // A rejected photo must not lose the ticket the driver just wrote.
      if (!(err instanceof UploadRejectedError)) throw err;
      await sql`
        INSERT INTO support_notes (ticket_id, author_id, body, visible_to_driver)
        VALUES (${ticket!.id}::uuid, ${user.id}::uuid,
                ${`An attachment was rejected: ${err.message}`}, true)`;
    }
  }

  await writeAudit({
    actorUserId: user.id,
    actorRole: "DRIVER",
    action: "support.ticket_opened",
    objectType: "support_ticket",
    objectId: ticket!.id,
    after: { subject, category, priority, bookingId },
    reason: "opened by the driver from their console",
  });

  if (config.contact.email) {
    const id = await queue(sql, {
      kind: "support.driver_ticket",
      channel: "EMAIL",
      to: config.contact.email,
      locale: "ka",
      subject: `[${priority}] Driver ticket — ${subject}`,
      body: [
        `Driver:  ${driver.public_name}`,
        `Category: ${category}`,
        bookingCode ? `Booking: ${bookingCode}` : null,
        "",
        body,
      ].filter(Boolean).join("\n"),
      dedupe: `support-ticket-${ticket!.id}`,
    });
    if (id) await dispatchPending(1, [id]);
  }

  revalidatePath("/driver/support");
  return { ok: true, message: "Sent. We will answer here." };
}

/** Add another message to a ticket the driver already opened. */
export async function replyToTicketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, driver } = await myDriver();
  if (!driver) return { ok: false, message: "Create your profile first." };

  const ticketId = String(formData.get("ticketId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return { ok: false, message: "Unknown ticket." };
  if (!body) return { ok: false, message: "Write a message first." };

  // Ownership re-checked here: a ticket id from the client is not a capability.
  const [ticket] = await sql<{ id: string; state: string }[]>`
    SELECT id, state::text AS state FROM support_tickets
    WHERE id = ${ticketId}::uuid AND driver_id = ${driver.id}::uuid`;
  if (!ticket) return { ok: false, message: "Unknown ticket." };
  if (ticket.state === "CLOSED") return { ok: false, message: "This ticket is closed. Open a new one." };

  await sql`
    INSERT INTO support_notes (ticket_id, author_id, body, visible_to_driver)
    VALUES (${ticket.id}::uuid, ${user.id}::uuid, ${body}, true)`;

  // A driver replying reopens the clock on a ticket we had parked.
  await sql`
    UPDATE support_tickets SET state = 'OPEN', updated_at = now()
    WHERE id = ${ticket.id}::uuid AND state = 'WAITING'`;

  revalidatePath("/driver/support");
  return { ok: true, message: "Sent." };
}
