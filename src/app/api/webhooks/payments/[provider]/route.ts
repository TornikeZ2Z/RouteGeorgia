import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@db/client";
import { getPaymentProvider, WebhookSignatureError } from "@/lib/payments";
import { confirmCardPayment } from "@/lib/booking";
import { dispatchPending } from "@/lib/notifications";

/**
 * Payment provider callback.
 *
 * Every event is signature-verified, stored raw, and deduplicated by the
 * provider's event id. Processing is idempotent: the same success delivered
 * five times produces one payment record, one confirmation and one driver
 * notification. tests/booking.test.ts asserts exactly that.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature");

  let event;
  try {
    event = getPaymentProvider().verifyAndParse(rawBody, signature);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      // Never reveal why: a probing attacker learns nothing from a 400.
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    throw err;
  }

  // Deduplicate. A conflict means we have seen this event already.
  const inserted = await sql<{ id: number }[]>`
    INSERT INTO webhook_events (provider, event_id, event_type, payload)
    VALUES (${provider}, ${event.id}, ${event.type}, ${JSON.stringify(event.raw)}::text::jsonb)
    ON CONFLICT (provider, event_id) DO NOTHING
    RETURNING id`;
  if (inserted.length === 0) {
    return NextResponse.json({ ok: true, deduplicated: true });
  }
  const webhookRowId = inserted[0]!.id;

  try {
    const [payment] = await sql<{ id: string; booking_id: string; state: string }[]>`
      SELECT id, booking_id, state::text AS state FROM payments
      WHERE provider = ${provider} AND provider_ref = ${event.providerRef}`;

    if (payment) {
      if (event.type === "payment.succeeded" && payment.state !== "SUCCEEDED") {
        await sql`
          UPDATE payments SET state='SUCCEEDED', kind='CAPTURE', settled_at=now(), raw=${JSON.stringify(event.raw)}::text::jsonb
          WHERE id=${payment.id}::uuid`;
        await confirmCardPayment(payment.booking_id, payment.id);
      } else if (event.type === "payment.failed" && payment.state === "PENDING") {
        await sql`
          UPDATE payments SET state='FAILED', failure_code=${String(event.raw.failureCode ?? "declined")}
          WHERE id=${payment.id}::uuid`;
        // The booking stays PENDING_PAYMENT so the traveller can retry with
        // another card rather than losing the driver hold entirely.
        await sql`
          INSERT INTO booking_status_history (booking_id, from_status, to_status, reason)
          VALUES (${payment.booking_id}::uuid, 'PENDING_PAYMENT', 'PENDING_PAYMENT', 'card declined')`;
      }
    }

    await sql`UPDATE webhook_events SET processed_at = now() WHERE id = ${webhookRowId}`;
    await dispatchPending().catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    await sql`
      UPDATE webhook_events SET process_error = ${String(err).slice(0, 500)} WHERE id = ${webhookRowId}`;
    // 500 asks the provider to retry; the dedupe key keeps that safe.
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
