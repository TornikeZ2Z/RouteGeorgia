import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "@db/client";
import { post } from "@/lib/ledger";
import { serviceWindow } from "@/lib/offers";
import * as notify from "@/lib/notifications";
import { writeAudit } from "@/lib/audit";
import { config } from "@/lib/config";
import type { Locale } from "@/lib/i18n";
import type { Minor } from "@/lib/money";

/**
 * Staff operations on a live booking.
 *
 * Everything here is something a traveller has already paid for or is
 * relying on, so each function is transactional, writes an audit entry with a
 * reason, and leaves the original record intact. Nothing is edited in place
 * that a dispute might later need to reconstruct.
 */

export interface ReplacementOption {
  driverId: string;
  vehicleId: string;
  driverName: string;
  handle: string;
  vehicle: string;
  seats: number;
  luggage: number;
  ratingAverage: number | null;
  ratingCount: number;
  languages: string[];
  fourWheelDrive: boolean;
}

/**
 * Drivers who could actually take this trip: approved, published, free for
 * the whole service window, documents valid on the travel date, and with a
 * vehicle at least as capable as the one booked.
 */
export async function replacementOptions(bookingId: string): Promise<ReplacementOption[]> {
  const [booking] = await sql<{
    driver_id: string; service_start_at: Date; drive_minutes: number;
    passengers: number; luggage: number; four_wheel_drive: boolean;
  }[]>`
    SELECT b.driver_id, b.service_start_at, b.drive_minutes, b.passengers, b.luggage,
           coalesce((v.capabilities->>'four_wheel_drive')::boolean, false) AS four_wheel_drive
    FROM bookings b JOIN vehicles v ON v.id = b.vehicle_id
    WHERE b.id = ${bookingId}::uuid`;
  if (!booking) return [];

  const window = serviceWindow(new Date(booking.service_start_at), booking.drive_minutes);

  const rows = await sql<{
    driver_id: string; vehicle_id: string; public_name: string; handle: string;
    make: string; model: string; year: number; seats: number; luggage: number;
    rating_sum: number; rating_count: number; languages: string[] | null; four_wheel_drive: boolean;
  }[]>`
    SELECT d.id AS driver_id, v.id AS vehicle_id, d.public_name, d.handle,
           v.make, v.model, v.year, v.seats, v.luggage,
           d.rating_sum, d.rating_count,
           array_remove(array_agg(dl.language), NULL) AS languages,
           coalesce((v.capabilities->>'four_wheel_drive')::boolean, false) AS four_wheel_drive
    FROM driver_profiles d
    JOIN vehicles v ON v.driver_id = d.id AND v.published AND v.status = 'APPROVED'
    JOIN price_plans p ON p.vehicle_id = v.id AND p.status = 'ACTIVE'
    LEFT JOIN driver_languages dl ON dl.driver_id = d.id
    WHERE d.published AND d.status = 'APPROVED'
      AND d.id <> ${booking.driver_id}::uuid
      AND v.seats   >= ${booking.passengers}
      AND v.luggage >= ${booking.luggage}
      AND (${booking.four_wheel_drive} = false
           OR (v.capabilities->>'four_wheel_drive')::boolean IS TRUE)
      AND NOT EXISTS (
        SELECT 1 FROM availability_blocks ab
        WHERE ab.driver_id = d.id
          AND ab.period && tstzrange(${window.startsAt.toISOString()}::timestamptz,
                                     ${window.endsAt.toISOString()}::timestamptz, '[)'))
      AND NOT EXISTS (
        SELECT 1 FROM driver_documents dd
        WHERE dd.driver_id = d.id AND dd.is_mandatory
          AND (dd.state <> 'APPROVED'
               OR (dd.expires_on IS NOT NULL
                   AND dd.expires_on < ${booking.service_start_at}::date)))
    GROUP BY d.id, v.id
    ORDER BY d.rating_count = 0, (d.rating_sum::numeric / NULLIF(d.rating_count, 0)) DESC NULLS LAST
    LIMIT 25`;

  return rows.map((r) => ({
    driverId: r.driver_id, vehicleId: r.vehicle_id, driverName: r.public_name, handle: r.handle,
    vehicle: `${r.make} ${r.model} (${r.year})`, seats: r.seats, luggage: r.luggage,
    ratingAverage: r.rating_count > 0 ? r.rating_sum / r.rating_count : null,
    ratingCount: r.rating_count, languages: r.languages ?? [], fourWheelDrive: r.four_wheel_drive,
  }));
}

/**
 * Move a booking to a different driver.
 *
 * The price does not change: the traveller agreed a figure and a replacement
 * is our problem, not theirs. If the new driver's own rate is higher, the
 * difference is absorbed by the platform and visible in the audit reason.
 */
export async function reassignBooking(input: {
  bookingId: string; driverId: string; vehicleId: string;
  reason: string; actorUserId: string;
}): Promise<void> {
  await sql.begin(async (tx) => {
    const [booking] = await tx<{
      id: string; code: string; status: string; driver_id: string;
      service_start_at: Date; drive_minutes: number; customer_email: string;
      contact_locale: string; gross_minor: string; currency: string; payment_mode: string;
    }[]>`
      SELECT id, code, status::text AS status, driver_id, service_start_at, drive_minutes,
             customer_email, contact_locale, gross_minor, currency, payment_mode::text AS payment_mode
      FROM bookings WHERE id = ${input.bookingId}::uuid FOR UPDATE`;
    if (!booking) throw new Error("Booking not found.");
    if (["CANCELLED", "COMPLETED", "CLOSED"].includes(booking.status)) {
      throw new Error("A finished booking cannot be reassigned.");
    }

    const window = serviceWindow(new Date(booking.service_start_at), booking.drive_minutes);

    // Free the previous driver, then claim the new one. The exclusion
    // constraint refuses if the replacement was taken in the meantime.
    await tx`DELETE FROM availability_blocks WHERE booking_id = ${input.bookingId}::uuid`;
    await tx`
      INSERT INTO availability_blocks (driver_id, period, kind, booking_id, reason_category)
      VALUES (${input.driverId}::uuid,
              tstzrange(${window.startsAt.toISOString()}::timestamptz,
                        ${window.endsAt.toISOString()}::timestamptz, '[)'),
              'BOOKING', ${input.bookingId}::uuid, 'reassigned booking')`;

    await tx`
      INSERT INTO booking_revisions (booking_id, before, after, reason, actor_id)
      VALUES (${input.bookingId}::uuid,
              ${JSON.stringify({ driverId: booking.driver_id })}::text::jsonb,
              ${JSON.stringify({ driverId: input.driverId, vehicleId: input.vehicleId })}::text::jsonb,
              ${input.reason}, ${input.actorUserId}::uuid)`;

    await tx`
      UPDATE bookings
      SET driver_id = ${input.driverId}::uuid, vehicle_id = ${input.vehicleId}::uuid,
          status = 'CONFIRMED', acknowledged_at = NULL, updated_at = now()
      WHERE id = ${input.bookingId}::uuid`;

    await tx`
      INSERT INTO booking_status_history (booking_id, from_status, to_status, actor_id, actor_role, reason)
      VALUES (${input.bookingId}::uuid, ${booking.status}::booking_status, 'CONFIRMED',
              ${input.actorUserId}::uuid, 'OPERATIONS_MANAGER', ${`reassigned: ${input.reason}`})`;

    // The original driver's cancellation count is not touched here: staff may
    // reassign for reasons that are nobody's fault, such as a vehicle fault.
    const [replacement] = await tx<{ public_name: string; email: string; locale: string | null }[]>`
      SELECT d.public_name, u.email, u.locale FROM driver_profiles d
      JOIN users u ON u.id = d.user_id WHERE d.id = ${input.driverId}::uuid`;

    await notify.queue(tx, {
      kind: "booking.driver_reassigned.customer",
      to: booking.customer_email,
      locale: booking.contact_locale,
      subject: `Your driver for booking ${booking.code} has changed`,
      body: [
        `We have arranged a different driver for your trip.`,
        ``,
        `New driver: ${replacement?.public_name ?? "to be confirmed"}`,
        `Your price is unchanged at ${(Number(booking.gross_minor) / 100).toFixed(2)} ${booking.currency}.`,
        ``,
        `Reason: ${input.reason}`,
      ].join("\n"),
      bookingId: input.bookingId,
      dedupe: `${input.bookingId}:${input.driverId}`,
    });

    if (replacement) {
      await notify.queue(tx, {
        kind: "booking.confirmed.driver",
        to: replacement.email,
        locale: replacement.locale ?? "ka",
        subject: `New booking ${booking.code} assigned to you`,
        body: `Operations has assigned you booking ${booking.code}. Please confirm it in the app.`,
        bookingId: input.bookingId,
        dedupe: `${input.bookingId}:reassign:${input.driverId}`,
      });
    }
  });

  await writeAudit({
    actorUserId: input.actorUserId, action: "booking.reassigned",
    objectType: "booking", objectId: input.bookingId,
    after: { driverId: input.driverId }, reason: input.reason,
  });
}

/**
 * Refund a traveller, in full or in part.
 *
 * Posts the reversal to the ledger and records a refund payment. The money
 * side and the booking side move together or not at all.
 */
export async function refundBooking(input: {
  bookingId: string; amountMinor: Minor; reason: string; actorUserId: string;
}): Promise<void> {
  if (input.amountMinor <= 0n) throw new Error("A refund must be greater than zero.");

  await sql.begin(async (tx) => {
    const [booking] = await tx<{
      id: string; code: string; driver_id: string; gross_minor: string;
      commission_minor: string; driver_net_minor: string; currency: string;
      payment_mode: string; customer_email: string; contact_locale: string;
    }[]>`
      SELECT id, code, driver_id, gross_minor, commission_minor, driver_net_minor,
             currency, payment_mode::text AS payment_mode, customer_email, contact_locale
      FROM bookings WHERE id = ${input.bookingId}::uuid FOR UPDATE`;
    if (!booking) throw new Error("Booking not found.");

    const [already] = await tx<{ refunded: string }[]>`
      SELECT coalesce(sum(amount_minor), 0)::text AS refunded FROM payments
      WHERE booking_id = ${input.bookingId}::uuid AND kind = 'REFUND' AND state = 'SUCCEEDED'`;
    const refundedSoFar = BigInt(already?.refunded ?? "0");
    const gross = BigInt(booking.gross_minor);

    if (refundedSoFar + input.amountMinor > gross) {
      throw new Error(
        `That would refund more than the fare. Already refunded ` +
        `${(Number(refundedSoFar) / 100).toFixed(2)} of ${(Number(gross) / 100).toFixed(2)}.`,
      );
    }

    const [payment] = await tx<{ id: string }[]>`
      INSERT INTO payments (booking_id, kind, state, provider, amount_minor, currency, idempotency_key)
      VALUES (${input.bookingId}::uuid, 'REFUND', 'SUCCEEDED', 'manual',
              ${input.amountMinor.toString()}::bigint, ${booking.currency},
              ${`refund:${input.bookingId}:${randomUUID()}`})
      RETURNING id`;

    // Allocate the refund proportionally: the driver gives back their share
    // and we give back ours, so a partial refund does not quietly come
    // entirely out of one side.
    const commissionShare = (input.amountMinor * BigInt(booking.commission_minor)) / gross;
    const driverShare = input.amountMinor - commissionShare;

    if (booking.payment_mode === "CARD") {
      await post(tx, [
        { account: "DRIVER_PAYABLE", driverId: booking.driver_id, side: "DEBIT",
          amountMinor: driverShare, memo: `Refund ${booking.code} — driver share` },
        { account: "PLATFORM_REVENUE", side: "DEBIT",
          amountMinor: commissionShare, memo: `Refund ${booking.code} — commission returned` },
        { account: "CARD_CLEARING", side: "CREDIT",
          amountMinor: input.amountMinor, memo: `Refund ${booking.code} to traveller` },
      ], { bookingId: input.bookingId, paymentId: payment!.id, currency: booking.currency });
    } else {
      // Cash: the driver already holds the traveller's money, so the platform
      // pays the refund and reduces what the driver owes us by their share.
      await post(tx, [
        { account: "DRIVER_RECEIVABLE", driverId: booking.driver_id, side: "CREDIT",
          amountMinor: commissionShare, memo: `Refund ${booking.code} — commission written back` },
        { account: "PLATFORM_REVENUE", side: "DEBIT",
          amountMinor: commissionShare, memo: `Refund ${booking.code} — commission reversed` },
      ], { bookingId: input.bookingId, paymentId: payment!.id, currency: booking.currency });
    }

    await notify.queue(tx, {
      kind: "booking.cancelled.customer",
      to: booking.customer_email,
      locale: booking.contact_locale,
      subject: `Refund issued for booking ${booking.code}`,
      body: [
        `We have issued a refund of ${(Number(input.amountMinor) / 100).toFixed(2)} ${booking.currency}` +
        ` for booking ${booking.code}.`,
        ``,
        `Reason: ${input.reason}`,
        ``,
        booking.payment_mode === "CARD"
          ? `It returns to the card you paid with. Banks usually take 5–10 working days.`
          : `Our team will contact you to arrange the transfer.`,
      ].join("\n"),
      bookingId: input.bookingId,
      dedupe: `refund:${payment!.id}`,
    });
  });

  await writeAudit({
    actorUserId: input.actorUserId, action: "booking.refunded",
    objectType: "booking", objectId: input.bookingId,
    after: { amountMinor: input.amountMinor.toString() }, reason: input.reason,
  });
}

/**
 * Record commission a driver has settled in cash.
 *
 * Reduces what they owe and unblocks new cash work once they are back inside
 * their credit limit. This is the counterpart to the receivable raised when a
 * cash trip completes.
 */
export async function recordCashSettlement(input: {
  driverId: string; amountMinor: Minor; reference: string; actorUserId: string;
}): Promise<void> {
  if (input.amountMinor <= 0n) throw new Error("A settlement must be greater than zero.");

  await sql.begin(async (tx) => {
    await post(tx, [
      { account: "PLATFORM_CASH", side: "DEBIT", amountMinor: input.amountMinor,
        memo: `Commission settled — ${input.reference}` },
      { account: "DRIVER_RECEIVABLE", driverId: input.driverId, side: "CREDIT",
        amountMinor: input.amountMinor, memo: `Commission settled — ${input.reference}` },
    ]);
  });

  await writeAudit({
    actorUserId: input.actorUserId, action: "driver.commission_settled",
    objectType: "driver_profile", objectId: input.driverId,
    after: { amountMinor: input.amountMinor.toString() }, reason: input.reference,
  });
}

/** Full chronological history of a booking, for the support timeline. */
export interface TimelineEntry {
  at: Date;
  kind: "status" | "revision" | "payment" | "message" | "notification" | "audit";
  title: string;
  detail: string | null;
  actor: string | null;
}

export async function bookingTimeline(bookingId: string): Promise<TimelineEntry[]> {
  const [statuses, revisions, payments, messages, notifications, audits] = await Promise.all([
    sql<{ at: Date; from_status: string | null; to_status: string; reason: string | null; email: string | null }[]>`
      SELECT h.created_at AS at, h.from_status::text, h.to_status::text, h.reason, u.email
      FROM booking_status_history h LEFT JOIN users u ON u.id = h.actor_id
      WHERE h.booking_id = ${bookingId}::uuid`,
    sql<{ at: Date; reason: string; email: string | null; before: unknown; after: unknown }[]>`
      SELECT r.created_at AS at, r.reason, u.email, r.before, r.after
      FROM booking_revisions r LEFT JOIN users u ON u.id = r.actor_id
      WHERE r.booking_id = ${bookingId}::uuid`,
    sql<{ at: Date; kind: string; state: string; amount_minor: string; currency: string; provider: string }[]>`
      SELECT created_at AS at, kind::text, state::text, amount_minor::text, currency, provider
      FROM payments WHERE booking_id = ${bookingId}::uuid`,
    sql<{ at: Date; sender: string; body: string }[]>`
      SELECT created_at AS at, sender::text, body FROM messages WHERE booking_id = ${bookingId}::uuid`,
    sql<{ at: Date; kind: string; channel: string; to_address: string; state: string }[]>`
      SELECT created_at AS at, kind, channel::text, to_address, state::text
      FROM notifications WHERE booking_id = ${bookingId}::uuid`,
    sql<{ at: Date; action: string; reason: string | null; email: string | null }[]>`
      SELECT a.at, a.action, a.reason, u.email
      FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE a.object_type = 'booking' AND a.object_id = ${bookingId}`,
  ]);

  const entries: TimelineEntry[] = [
    ...statuses.map((r) => ({
      at: r.at, kind: "status" as const,
      title: `${r.from_status ?? "created"} → ${r.to_status}`.toLowerCase().replaceAll("_", " "),
      detail: r.reason, actor: r.email,
    })),
    ...revisions.map((r) => ({
      at: r.at, kind: "revision" as const, title: "Details revised",
      detail: `${r.reason} — ${JSON.stringify(r.after)}`, actor: r.email,
    })),
    ...payments.map((r) => ({
      at: r.at, kind: "payment" as const,
      title: `${r.kind.toLowerCase()} ${r.state.toLowerCase()}`,
      detail: `${(Number(r.amount_minor) / 100).toFixed(2)} ${r.currency} via ${r.provider}`,
      actor: null,
    })),
    ...messages.map((r) => ({
      at: r.at, kind: "message" as const,
      title: `Message from ${r.sender.toLowerCase()}`,
      detail: r.body.slice(0, 240), actor: null,
    })),
    ...notifications.map((r) => ({
      at: r.at, kind: "notification" as const,
      title: `${r.channel.toLowerCase()} ${r.state.toLowerCase()}`,
      detail: `${r.kind} → ${r.to_address}`, actor: null,
    })),
    ...audits.map((r) => ({
      at: r.at, kind: "audit" as const, title: r.action, detail: r.reason, actor: r.email,
    })),
  ];

  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export { config as operationsConfig };
