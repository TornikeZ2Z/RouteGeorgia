import "server-only";
import { createHash } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { sql as rootSql } from "@db/client";
import { config } from "@/lib/config";
import { formatMoney } from "@/lib/money";
import type { Locale } from "@/lib/i18n";

/**
 * Transactional notifications, written through an outbox.
 *
 * The row is inserted in the SAME transaction as the change that caused it,
 * so a confirmed booking can never end up without a queued confirmation. A
 * separate dispatcher sends them and records the outcome; a send failure is
 * retried rather than lost, and `dedupe_key` makes retries idempotent.
 */
type Executor = Sql | TransactionSql;

export type NotificationKind =
  | "booking.confirmed.customer" | "booking.confirmed.driver"
  | "booking.cancelled.customer" | "booking.cancelled.driver"
  | "booking.acknowledged.customer" | "booking.driver_reassigned.customer"
  | "booking.reminder.customer" | "booking.completed.customer"
  | "review.invitation" | "message.received";

export interface QueueInput {
  kind: NotificationKind;
  channel?: "EMAIL" | "SMS";
  to: string;
  locale?: string;
  subject: string;
  body: string;
  bookingId?: string | null;
  /** Anything that makes this notification unique. Retries reuse it. */
  dedupe: string;
  payload?: Record<string, unknown>;
}

export async function queue(tx: Executor, input: QueueInput): Promise<void> {
  const dedupeKey = createHash("sha256")
    .update(`${input.kind}:${input.dedupe}`)
    .digest("hex");

  await tx`
    INSERT INTO notifications (kind, channel, to_address, locale, subject, body, payload, booking_id, dedupe_key)
    VALUES (${input.kind}, ${input.channel ?? "EMAIL"}::notify_channel, ${input.to},
            ${input.locale ?? "en"}, ${input.subject}, ${input.body},
            ${JSON.stringify(input.payload ?? {})}::text::jsonb,
            ${input.bookingId ?? null}::uuid, ${dedupeKey})
    ON CONFLICT (dedupe_key) DO NOTHING`;
}

// ------------------------------------------------------------- transport ---

export interface Transport {
  readonly name: string;
  send(message: { to: string; subject: string; body: string; channel: string }): Promise<{ ref: string }>;
}

/**
 * Development transport: writes to the console and to the notifications table.
 * Swap for a real provider (Postmark, SES, Resend) by implementing this
 * interface — nothing else in the app changes.
 */
const consoleTransport: Transport = {
  name: "console",
  async send(message) {
    console.info(
      `\n──── ${message.channel} to ${message.to} ────\n${message.subject}\n\n${message.body}\n────────\n`,
    );
    return { ref: `console-${Date.now()}` };
  },
};

export function getTransport(): Transport {
  return consoleTransport;
}

/**
 * Send queued notifications. Called after a booking action and by any
 * scheduled worker. Safe to run concurrently: rows are claimed with
 * SKIP LOCKED so two dispatchers never send the same message twice.
 */
export async function dispatchPending(limit = 25): Promise<{ sent: number; failed: number }> {
  const transport = getTransport();
  let sent = 0;
  let failed = 0;

  const claimed = await rootSql<{ id: string; channel: string; to_address: string; subject: string; body: string }[]>`
    UPDATE notifications SET state = 'SENDING', attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM notifications
      WHERE state IN ('QUEUED','FAILED') AND attempts < 5
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED)
    RETURNING id, channel::text, to_address, subject, body`;

  for (const row of claimed) {
    try {
      await transport.send({
        to: row.to_address, subject: row.subject ?? "", body: row.body, channel: row.channel,
      });
      await rootSql`UPDATE notifications SET state='SENT', sent_at=now(), last_error=NULL WHERE id=${row.id}::uuid`;
      sent++;
    } catch (err) {
      await rootSql`
        UPDATE notifications SET state='FAILED', last_error=${String(err).slice(0, 400)}
        WHERE id=${row.id}::uuid`;
      failed++;
    }
  }
  return { sent, failed };
}

// ------------------------------------------------------------- templates ---

interface BookingSummary {
  code: string;
  customerName: string | null;
  driverName: string;
  vehicle: string;
  serviceStartAt: Date;
  route: string;
  grossMinor: bigint;
  currency: string;
  paymentMode: "CASH" | "CARD";
  manageUrl?: string;
}

const when = (d: Date, locale: string) =>
  d.toLocaleString(locale === "ka" ? "ka-GE" : locale === "ru" ? "ru-RU" : "en-GB", {
    dateStyle: "full", timeStyle: "short", timeZone: "Asia/Tbilisi",
  });

export function customerConfirmation(b: BookingSummary, locale: Locale) {
  const price = formatMoney(b.grossMinor, b.currency, locale);
  return {
    subject: `Booking ${b.code} confirmed — ${b.route}`,
    body: [
      `Your driver is confirmed.`,
      ``,
      `Booking reference: ${b.code}`,
      `Route: ${b.route}`,
      `Pickup: ${when(b.serviceStartAt, locale)} (Georgia time)`,
      `Driver: ${b.driverName}`,
      `Vehicle: ${b.vehicle}`,
      `Price: ${price} for the whole vehicle`,
      b.paymentMode === "CASH"
        ? `Payment: cash to the driver at the end of the trip. Please have the exact amount if you can.`
        : `Payment: paid online. Nothing to pay the driver.`,
      ``,
      `Driving time excludes stops, traffic, border and weather delays.`,
      b.manageUrl ? `\nView or cancel your booking:\n${b.manageUrl}` : ``,
      ``,
      `Free cancellation. We ask for at least 24 hours' notice where possible.`,
    ].join("\n"),
  };
}

export function driverAssignment(b: BookingSummary, netMinor: bigint, locale: Locale) {
  return {
    subject: `New booking ${b.code} — ${b.route}`,
    body: [
      `You have a new booking. Please confirm it in the app.`,
      ``,
      `Reference: ${b.code}`,
      `Route: ${b.route}`,
      `Pickup: ${when(b.serviceStartAt, locale)}`,
      `Fare: ${formatMoney(b.grossMinor, b.currency, locale)}`,
      `Your earnings: ${formatMoney(netMinor, b.currency, locale)}`,
      b.paymentMode === "CASH"
        ? `Collect the fare in cash. Our commission will be added to your account balance.`
        : `The traveller has already paid online. Do not collect cash.`,
      ``,
      `${config.appUrl}/driver/orders`,
    ].join("\n"),
  };
}

export function cancellationNotice(b: BookingSummary, reason: string, locale: Locale) {
  return {
    subject: `Booking ${b.code} cancelled`,
    body: [
      `Booking ${b.code} (${b.route}, ${when(b.serviceStartAt, locale)}) has been cancelled.`,
      ``,
      `Reason: ${reason}`,
      ``,
      b.paymentMode === "CARD"
        ? `Any payment taken will be refunded to the original card. Banks usually take 5–10 working days.`
        : `Nothing was charged.`,
    ].join("\n"),
  };
}

export function reviewInvitation(b: BookingSummary, reviewUrl: string, locale: Locale) {
  return {
    subject: `How was your trip with ${b.driverName}?`,
    body: [
      `Thank you for travelling with us.`,
      ``,
      `Your trip on ${when(b.serviceStartAt, locale)} (${b.route}) is complete.`,
      `Please tell us how ${b.driverName} did — it takes under a minute and helps other travellers.`,
      ``,
      reviewUrl,
      ``,
      `This link works once and expires in 30 days.`,
    ].join("\n"),
  };
}
