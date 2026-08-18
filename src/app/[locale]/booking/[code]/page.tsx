import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@db/client";
import { isLocale, getTranslator, type Locale, type MessageKey } from "@/lib/i18n";
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

const STATUS_COPY: Record<string, { tone: "neutral" | "info" | "success" | "warning" | "danger"; label: MessageKey; note: MessageKey }> = {
  PENDING_PAYMENT:     { tone: "warning", label: "booking.stPending", note: "booking.stPendingN" },
  CONFIRMED:           { tone: "success", label: "booking.stConfirmed", note: "booking.stConfirmedN" },
  DRIVER_ACKNOWLEDGED: { tone: "success", label: "booking.stAck", note: "booking.stAckN" },
  READY:               { tone: "success", label: "booking.stReady", note: "booking.stReadyN" },
  DRIVER_ARRIVED:      { tone: "info",    label: "booking.stArrived", note: "booking.stArrivedN" },
  IN_PROGRESS:         { tone: "info",    label: "booking.stProgress", note: "booking.stProgressN" },
  COMPLETED:           { tone: "success", label: "booking.stCompleted", note: "booking.stCompletedN" },
  CANCELLED:           { tone: "danger",  label: "booking.stCancelled", note: "booking.stCancelledN" },
  REASSIGNING:         { tone: "warning", label: "booking.stReassigning", note: "booking.stReassigningN" },
};

export default async function BookingPage({ params, searchParams }: Props) {
  const { locale, code } = await params;
  if (!isLocale(locale)) notFound();
  const { t: token, payment } = await searchParams;
  const t = getTranslator(locale as Locale);

  if (!token) {
    return (
      <EmptyState title={t("booking.linkIncompleteT")}>
        {t("booking.linkIncompleteB")}
      </EmptyState>
    );
  }

  const bookingId = await verifyManageToken(code, token);
  if (!bookingId) {
    return (
      <EmptyState title={t("booking.linkInvalidT")}>
        {t("booking.linkInvalidB", { code })}
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
      SELECT label, position, day_index FROM booking_legs WHERE booking_id = ${bookingId}::uuid ORDER BY position`,
    sql<{ id: string; sender: string; body: string; created_at: Date }[]>`
      SELECT id, sender::text, body, created_at FROM messages
      WHERE booking_id = ${bookingId}::uuid ORDER BY created_at`,
    sql<{ free_cutoff_hours: number; late_fee_bps: number }[]>`
      SELECT free_cutoff_hours, late_fee_bps FROM cancellation_policies WHERE version = ${config.policy.version}`,
  ]);

  const statusEntry = STATUS_COPY[booking.status];
  const statusLabel = statusEntry ? t(statusEntry.label) : booking.status.replaceAll("_", " ").toLowerCase();
  const statusNote = statusEntry ? t(statusEntry.note) : "";
  const statusTone = statusEntry?.tone ?? ("neutral" as const);
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
        <Alert tone="danger" title={t("booking.payFailedT")}>
          {t("booking.payFailedB")}
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-500">{t("booking.reference")}</p>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-ink-900">{booking.code}</h1>
        </div>
        <Badge tone={statusTone}>{statusLabel}</Badge>
      </div>

      {statusNote && <Alert tone={statusTone === "danger" ? "danger" : "info"}>{statusNote}</Alert>}
      {booking.cancellation_reason && (
        <Alert tone="neutral" title={t("booking.cancelReason")}>{booking.cancellation_reason}</Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="p-4 sm:p-6">
            <h2 className="font-semibold text-ink-900">{t("booking.tripT")}</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {legs.map((leg) => {
                const isReturn = leg.position > 0 && leg.label === legs[0]?.label;
                return (
                  <li key={leg.position} className="flex gap-2 text-ink-700">
                    <span aria-hidden className="text-ink-400">
                      {leg.position === 0 ? "●" : leg.position === legs.length - 1 ? "◆" : "○"}
                    </span>
                    {leg.label}
                    {isReturn && <span className="text-xs text-ink-500">({t("search.returnLeg")})</span>}
                  </li>
                );
              })}
            </ol>
            <dl className="mt-4 grid gap-2 border-t border-ink-100 pt-3 text-sm sm:grid-cols-2">
              <div><dt className="text-ink-500">{t("booking.departure")}</dt>
                <dd className="font-medium">{startsAt.toLocaleString(locale, { dateStyle: "full", timeStyle: "short" })}</dd></div>
              <div><dt className="text-ink-500">{t("booking.drivingTime")}</dt>
                <dd>{Math.floor(booking.drive_minutes / 60)} h {booking.drive_minutes % 60} min {t("booking.excludesStops")}</dd></div>
              <div><dt className="text-ink-500">{t("booking.pickup")}</dt><dd>{booking.pickup_address}</dd></div>
              <div><dt className="text-ink-500">{t("booking.dropoff")}</dt><dd>{booking.dropoff_address}</dd></div>
              {booking.flight_number && (
                <div><dt className="text-ink-500">{t("booking.flight")}</dt><dd>{booking.flight_number}</dd></div>
              )}
              <div><dt className="text-ink-500">{t("booking.party")}</dt>
                <dd>{t("booking.partyPassengers", { count: booking.passengers })}
                  {booking.children > 0 && `, ${t("booking.partyChildren", { count: booking.children })}`}
                  {booking.child_seats > 0 && `, ${t("booking.partySeats", { count: booking.child_seats })}`}
                  {booking.pets && `, ${t("booking.partyPet")}`}</dd></div>
            </dl>
            {booking.notes && (
              <p className="mt-3 border-t border-ink-100 pt-3 text-sm text-ink-600">
                <span className="text-ink-500">{t("booking.yourNotes")} </span>{booking.notes}
              </p>
            )}
          </Card>

          {active && <MessageThread bookingId={bookingId} code={code} token={token} locale={locale} messages={messages} />}
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold text-ink-900">{t("booking.driverT")}</h2>
            <p className="mt-2 text-sm font-medium text-ink-900">{booking.driver_name}</p>
            <p className="text-sm text-ink-600">
              {booking.make} {booking.model} ({booking.year})
              {booking.color && `, ${booking.color}`}
            </p>
            {contactVisible ? (
              <p className="mt-2 font-mono text-sm text-ink-800">{booking.plate}</p>
            ) : (
              <p className="mt-2 text-xs text-ink-500">
                {t("booking.plateLater")}
              </p>
            )}
            <Link href={`/${locale}/drivers/${booking.handle}`} className="mt-3 inline-block text-sm text-brand-700 underline">
              {t("card.viewProfile")}
            </Link>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold text-ink-900">{t("booking.paymentT")}</h2>
            <p className="mt-2 text-xl font-semibold text-ink-900">
              {formatMoney(gross, booking.currency, locale)}
            </p>
            <p className="text-sm text-ink-600">
              {booking.payment_mode === "CASH" ? t("booking.cashDue") : t("booking.paidOnline")}
            </p>
          </Card>

          {active && (
            <Card className="p-4">
              <h2 className="font-semibold text-ink-900">{t("booking.cancelT")}</h2>
              <p className="mt-2 text-sm text-ink-600">
                {outcome.freeOfCharge
                  ? t("booking.cancelFree")
                  : t("booking.cancelFee", { fee: formatMoney(outcome.feeMinor, booking.currency, locale) })}
              </p>
              <div className="mt-3">
                <CancelBooking code={code} token={token} locale={locale} />
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
