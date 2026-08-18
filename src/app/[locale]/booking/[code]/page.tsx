import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@db/client";
import { isLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { verifyManageToken, cancellationOutcome } from "@/lib/booking";
import { config } from "@/lib/config";
import { Alert, Badge, Card, EmptyState } from "@/components/ui";
import { CancelBooking, MessageThread } from "./actions-ui";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, title: "Your booking" };

interface Props {
  params: Promise<{ locale: string; code: string }>;
  searchParams: Promise<{ t?: string; payment?: string }>;
}

const STATUS_COPY: Record<string, { tone: "neutral" | "info" | "success" | "warning" | "danger"; label: string; note: string }> = {
  PENDING_PAYMENT:     { tone: "warning", label: "Awaiting payment", note: "We are waiting for your card payment to complete." },
  CONFIRMED:           { tone: "success", label: "Confirmed", note: "Your driver has been notified and will confirm shortly." },
  DRIVER_ACKNOWLEDGED: { tone: "success", label: "Driver confirmed", note: "Your driver has accepted this trip." },
  READY:               { tone: "success", label: "Ready", note: "Everything is set for your pickup." },
  DRIVER_ARRIVED:      { tone: "info",    label: "Driver arrived", note: "Your driver is at the meeting point." },
  IN_PROGRESS:         { tone: "info",    label: "In progress", note: "Enjoy your trip." },
  COMPLETED:           { tone: "success", label: "Completed", note: "Thank you for travelling with us." },
  CANCELLED:           { tone: "danger",  label: "Cancelled", note: "This booking has been cancelled." },
  REASSIGNING:         { tone: "warning", label: "Finding a replacement", note: "We are arranging an equivalent driver for you." },
};

export default async function BookingPage({ params, searchParams }: Props) {
  const { locale, code } = await params;
  if (!isLocale(locale)) notFound();
  const { t: token, payment } = await searchParams;

  if (!token) {
    return (
      <EmptyState title="This link is incomplete">
        Use the link in your confirmation email to view this booking.
      </EmptyState>
    );
  }

  const bookingId = await verifyManageToken(code, token);
  if (!bookingId) {
    return (
      <EmptyState title="This link is not valid">
        It may have expired. Contact support with your booking reference {code}.
      </EmptyState>
    );
  }

  const [booking] = await sql<Row[]>`
    SELECT b.id, b.code, b.status::text AS status, b.payment_mode::text AS payment_mode,
           b.service_start_at, b.gross_minor, b.currency, b.customer_name, b.customer_phone,
           b.pickup_address, b.dropoff_address, b.flight_number, b.pickup_sign_name,
           b.passengers, b.children, b.luggage, b.child_seats, b.pets, b.notes,
           b.drive_minutes, b.acknowledged_at, b.cancellation_reason,
           d.public_name AS driver_name, d.handle,
           v.make, v.model, v.year, v.color, v.plate
    FROM bookings b
    JOIN driver_profiles d ON d.id = b.driver_id
    JOIN vehicles v ON v.id = b.vehicle_id
    WHERE b.id = ${bookingId}::uuid`;
  if (!booking) notFound();

  const [legs, messages, policy] = await Promise.all([
    sql<{ label: string; position: number }[]>`
      SELECT label, position FROM booking_legs WHERE booking_id = ${bookingId}::uuid ORDER BY position`,
    sql<{ id: string; sender: string; body: string; created_at: Date }[]>`
      SELECT id, sender::text, body, created_at FROM messages
      WHERE booking_id = ${bookingId}::uuid ORDER BY created_at`,
    sql<{ free_cutoff_hours: number; late_fee_bps: number }[]>`
      SELECT free_cutoff_hours, late_fee_bps FROM cancellation_policies WHERE version = ${config.policy.version}`,
  ]);

  const status = STATUS_COPY[booking.status] ?? { tone: "neutral" as const, label: booking.status, note: "" };
  const startsAt = new Date(booking.service_start_at);
  const gross = BigInt(booking.gross_minor);
  const outcome = cancellationOutcome(
    startsAt, gross,
    { freeCutoffHours: policy[0]?.free_cutoff_hours ?? 24, lateFeeBps: policy[0]?.late_fee_bps ?? 0 },
    booking.payment_mode === "CARD",
  );
  const active = !["CANCELLED", "COMPLETED", "CLOSED"].includes(booking.status);
  // Driver contact is only revealed once the trip is actually confirmed.
  const contactVisible = ["DRIVER_ACKNOWLEDGED", "READY", "DRIVER_ARRIVED", "IN_PROGRESS"].includes(booking.status);

  return (
    <div className="space-y-6">
      {payment === "failed" && (
        <Alert tone="danger" title="Your card was declined">
          Nothing has been charged and your driver is still held. Try another card, or switch to
          paying cash by contacting support.
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-500">Booking reference</p>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-ink-900">{booking.code}</h1>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      {status.note && <Alert tone={status.tone === "danger" ? "danger" : "info"}>{status.note}</Alert>}
      {booking.cancellation_reason && (
        <Alert tone="neutral" title="Cancellation reason">{booking.cancellation_reason}</Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="p-4 sm:p-6">
            <h2 className="font-semibold text-ink-900">Your trip</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {legs.map((leg) => (
                <li key={leg.position} className="flex gap-2 text-ink-700">
                  <span aria-hidden className="text-ink-400">
                    {leg.position === 0 ? "●" : leg.position === legs.length - 1 ? "◆" : "○"}
                  </span>
                  {leg.label}
                </li>
              ))}
            </ol>
            <dl className="mt-4 grid gap-2 border-t border-ink-100 pt-3 text-sm sm:grid-cols-2">
              <div><dt className="text-ink-500">Departure</dt>
                <dd className="font-medium">{startsAt.toLocaleString(locale, { dateStyle: "full", timeStyle: "short" })}</dd></div>
              <div><dt className="text-ink-500">Driving time</dt>
                <dd>{Math.floor(booking.drive_minutes / 60)} h {booking.drive_minutes % 60} min (excludes stops)</dd></div>
              <div><dt className="text-ink-500">Pickup</dt><dd>{booking.pickup_address}</dd></div>
              <div><dt className="text-ink-500">Drop-off</dt><dd>{booking.dropoff_address}</dd></div>
              {booking.flight_number && (
                <div><dt className="text-ink-500">Flight</dt><dd>{booking.flight_number}</dd></div>
              )}
              <div><dt className="text-ink-500">Party</dt>
                <dd>{booking.passengers} passenger(s){booking.children > 0 && `, ${booking.children} child(ren)`}
                  {booking.child_seats > 0 && `, ${booking.child_seats} child seat(s)`}
                  {booking.pets && ", with a pet"}</dd></div>
            </dl>
            {booking.notes && (
              <p className="mt-3 border-t border-ink-100 pt-3 text-sm text-ink-600">
                <span className="text-ink-500">Your notes: </span>{booking.notes}
              </p>
            )}
          </Card>

          {active && <MessageThread bookingId={bookingId} code={code} token={token} messages={messages} />}
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold text-ink-900">Your driver</h2>
            <p className="mt-2 text-sm font-medium text-ink-900">{booking.driver_name}</p>
            <p className="text-sm text-ink-600">
              {booking.make} {booking.model} ({booking.year})
              {booking.color && `, ${booking.color}`}
            </p>
            {contactVisible ? (
              <p className="mt-2 font-mono text-sm text-ink-800">{booking.plate}</p>
            ) : (
              <p className="mt-2 text-xs text-ink-500">
                The number plate is shown once your driver confirms the trip.
              </p>
            )}
            <Link href={`/${locale}/drivers/${booking.handle}`} className="mt-3 inline-block text-sm text-wine-700 underline">
              View profile
            </Link>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold text-ink-900">Payment</h2>
            <p className="mt-2 text-xl font-semibold text-ink-900">
              {formatMoney(gross, booking.currency, locale)}
            </p>
            <p className="text-sm text-ink-600">
              {booking.payment_mode === "CASH"
                ? "Cash to the driver at the end of the trip."
                : "Paid online by card."}
            </p>
          </Card>

          {active && (
            <Card className="p-4">
              <h2 className="font-semibold text-ink-900">Need to cancel?</h2>
              <p className="mt-2 text-sm text-ink-600">
                {outcome.freeOfCharge
                  ? "Free of charge. Cancelling early helps your driver find other work."
                  : `A fee of ${formatMoney(outcome.feeMinor, booking.currency, locale)} applies at this notice period.`}
              </p>
              <div className="mt-3">
                <CancelBooking code={code} token={token} />
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

interface Row {
  id: string; code: string; status: string; payment_mode: string; service_start_at: Date;
  gross_minor: string; currency: string; customer_name: string | null; customer_phone: string | null;
  pickup_address: string; dropoff_address: string; flight_number: string | null;
  pickup_sign_name: string | null; passengers: number; children: number; luggage: number;
  child_seats: number; pets: boolean; notes: string | null; drive_minutes: number;
  acknowledged_at: Date | null; cancellation_reason: string | null;
  driver_name: string; handle: string;
  make: string; model: string; year: number; color: string | null; plate: string;
}
