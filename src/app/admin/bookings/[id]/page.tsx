import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { sql } from "@db/client";
import { formatMoney } from "@/lib/money";
import { formatDuration } from "@/lib/format";
import { bookingTimeline, replacementOptions } from "@/lib/operations";
import { config } from "@/lib/config";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import {
  ReassignPanel, CancelPanel, RefundPanel, EditBookingPanel, SupportMessagePanel, ResendButton,
} from "./panels";

export const dynamic = "force-dynamic";

const TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  PENDING_PAYMENT: "warning", CONFIRMED: "info", DRIVER_ACKNOWLEDGED: "success",
  READY: "success", DRIVER_ARRIVED: "info", IN_PROGRESS: "info",
  COMPLETED: "success", CANCELLED: "danger", REASSIGNING: "warning", DISPUTED: "danger",
};

/**
 * The screen support actually works from. Everything known about one trip,
 * with every action that can be taken on it, and a single chronological
 * record of what has already happened.
 */
export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("admin.bookings.read");
  const { id } = await params;

  const [booking] = await sql<Row[]>`
    SELECT b.*, b.status::text AS status, b.payment_mode::text AS payment_mode,
           d.public_name AS driver_name, d.handle, d.id AS driver_profile_id,
           du.email AS driver_email, du.phone AS driver_phone,
           v.make, v.model, v.year, v.plate, v.seats, v.luggage,
           (SELECT string_agg(l.label, ' → ' ORDER BY l.position)
              FROM booking_legs l WHERE l.booking_id = b.id) AS route,
           (SELECT coalesce(sum(amount_minor), 0) FROM payments p
              WHERE p.booking_id = b.id AND p.kind = 'REFUND' AND p.state = 'SUCCEEDED') AS refunded_minor
    FROM bookings b
    JOIN driver_profiles d ON d.id = b.driver_id
    JOIN users du ON du.id = d.user_id
    JOIN vehicles v ON v.id = b.vehicle_id
    WHERE b.id = ${id}::uuid`;
  if (!booking) notFound();

  const [timeline, messages, notifications, replacements] = await Promise.all([
    bookingTimeline(id),
    sql<{ id: string; sender: string; body: string; created_at: Date; flagged: boolean }[]>`
      SELECT id, sender::text, body, created_at, flagged FROM messages
      WHERE booking_id = ${id}::uuid ORDER BY created_at`,
    sql<{ id: string; kind: string; channel: string; to_address: string; state: string; created_at: Date }[]>`
      SELECT id, kind, channel::text, to_address, state::text, created_at
      FROM notifications WHERE booking_id = ${id}::uuid ORDER BY created_at DESC`,
    ["CANCELLED", "COMPLETED", "CLOSED"].includes(booking.status)
      ? Promise.resolve([]) : replacementOptions(id),
  ]);

  const mayAct = can(actor.roles, "admin.bookings.reassign");
  const mayRefund = can(actor.roles, "admin.finance.execute");
  const gross = BigInt(booking.gross_minor);
  const refunded = BigInt(booking.refunded_minor ?? "0");
  const live = !["CANCELLED", "COMPLETED", "CLOSED"].includes(booking.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={booking.code}
        description={booking.route ?? ""}
        actions={
          <>
            <Badge tone={TONE[booking.status] ?? "neutral"}>
              {booking.status.replaceAll("_", " ").toLowerCase()}
            </Badge>
            <Badge tone={booking.payment_mode === "CASH" ? "warning" : "neutral"}>
              {booking.payment_mode.toLowerCase()}
            </Badge>
            <Link href="/admin/bookings" className="text-sm text-brand-700 underline">All bookings</Link>
          </>
        }
      />

      {refunded > 0n && (
        <Alert tone="warning" title="Partly refunded">
          {formatMoney(refunded, booking.currency)} of {formatMoney(gross, booking.currency)} has been
          returned to the traveller.
        </Alert>
      )}

      {booking.cancellation_reason && (
        <Alert tone="danger" title={`Cancelled by ${booking.cancelled_by?.toLowerCase() ?? "unknown"}`}>
          {booking.cancellation_reason}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold text-ink-900">The trip</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-ink-500">Departure</dt>
                <dd className="font-medium">
                  {new Date(booking.service_start_at).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })}
                </dd></div>
              <div><dt className="text-ink-500">Driving time</dt>
                <dd>{formatDuration(booking.drive_minutes)} · {Math.round(booking.distance_km100 / 100)} km</dd></div>
              <div><dt className="text-ink-500">Pickup</dt><dd>{booking.pickup_address}</dd></div>
              <div><dt className="text-ink-500">Drop-off</dt><dd>{booking.dropoff_address}</dd></div>
              <div><dt className="text-ink-500">Traveller</dt>
                <dd>{booking.customer_name}<br />{booking.customer_email}<br />{booking.customer_phone}</dd></div>
              <div><dt className="text-ink-500">Party</dt>
                <dd>{booking.passengers} passenger(s)
                  {booking.children > 0 && `, ${booking.children} child(ren)`}
                  {booking.child_seats > 0 && `, ${booking.child_seats} child seat(s)`}
                  {booking.pets && ", with a pet"}</dd></div>
              {booking.flight_number && (
                <div><dt className="text-ink-500">Flight</dt><dd>{booking.flight_number}</dd></div>
              )}
              {booking.notes && (
                <div className="sm:col-span-2"><dt className="text-ink-500">Traveller notes</dt>
                  <dd>{booking.notes}</dd></div>
              )}
            </dl>
          </Card>

          {mayAct && live && <EditBookingPanel booking={{
            id: booking.id,
            pickupAddress: booking.pickup_address,
            dropoffAddress: booking.dropoff_address,
            flightNumber: booking.flight_number,
            pickupSignName: booking.pickup_sign_name,
            customerPhone: booking.customer_phone,
            notes: booking.notes,
          }} />}

          <SupportMessagePanel bookingId={booking.id} messages={messages} />

          <Card className="p-5">
            <h2 className="font-semibold text-ink-900">Timeline</h2>
            <p className="mt-1 text-sm text-ink-600">
              Status changes, money, messages, notifications and staff actions in one place.
            </p>
            <ol className="mt-4 space-y-3">
              {timeline.map((entry, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="w-32 shrink-0 text-xs tabular-nums text-ink-500">
                    {new Date(entry.at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    entry.kind === "payment" ? "bg-pine-600"
                    : entry.kind === "status" ? "bg-brand-600"
                    : entry.kind === "audit" ? "bg-gold-500" : "bg-ink-300"}`} />
                  <span className="min-w-0">
                    <span className="font-medium text-ink-800">{entry.title}</span>
                    {entry.detail && <span className="block text-ink-600">{entry.detail}</span>}
                    {entry.actor && <span className="block text-xs text-ink-400">{entry.actor}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold text-ink-900">Notifications</h2>
            {notifications.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">Nothing sent for this booking.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {notifications.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-2">
                    <span>
                      <span className="font-medium text-ink-800">{n.kind}</span>
                      <span className="block text-xs text-ink-500">
                        {n.channel.toLowerCase()} → {n.to_address} ·{" "}
                        {new Date(n.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={n.state === "SENT" ? "success" : n.state === "FAILED" ? "danger" : "info"}>
                        {n.state.toLowerCase()}
                      </Badge>
                      <ResendButton notificationId={n.id} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="font-semibold text-ink-900">Driver</h2>
            <p className="mt-2 font-medium text-ink-900">{booking.driver_name}</p>
            <p className="text-sm text-ink-600">
              {booking.make} {booking.model} ({booking.year})<br />
              <span className="font-mono">{booking.plate}</span>
            </p>
            <p className="mt-2 text-sm text-ink-600">{booking.driver_email}<br />{booking.driver_phone}</p>
            <Link href={`/admin/drivers/${booking.driver_profile_id}`}
                  className="mt-3 inline-block text-sm text-brand-700 underline">
              Open driver record
            </Link>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold text-ink-900">Money</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Fare</dt>
                <dd className="font-medium tabular-nums">{formatMoney(gross, booking.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Commission</dt>
                <dd className="tabular-nums">{formatMoney(BigInt(booking.commission_minor), booking.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Driver keeps</dt>
                <dd className="tabular-nums">{formatMoney(BigInt(booking.driver_net_minor), booking.currency)}</dd></div>
              {refunded > 0n && (
                <div className="flex justify-between border-t border-ink-100 pt-1.5">
                  <dt className="text-ink-500">Refunded</dt>
                  <dd className="tabular-nums text-[--color-danger]">−{formatMoney(refunded, booking.currency)}</dd>
                </div>
              )}
            </dl>
            <p className="mt-3 text-xs text-ink-500">
              Commission was frozen at {(booking.commission_rate_bps / 100).toFixed(2)}% when this was booked.
            </p>
          </Card>

          {mayRefund && refunded < gross && (
            <RefundPanel bookingId={booking.id} maxMinor={(gross - refunded).toString()}
                         currency={booking.currency} paymentMode={booking.payment_mode} />
          )}

          {mayAct && live && (
            <>
              <ReassignPanel bookingId={booking.id} options={replacements} />
              <CancelPanel bookingId={booking.id} />
            </>
          )}

          {!mayAct && (
            <Alert tone="info">
              Your role can read this booking but not change it. Reassignment and cancellation need an
              operations manager; refunds need finance.
            </Alert>
          )}
        </aside>
      </div>
    </div>
  );
}

interface Row {
  id: string; code: string; status: string; payment_mode: string; service_start_at: Date;
  gross_minor: string; commission_minor: string; driver_net_minor: string; currency: string;
  commission_rate_bps: number; customer_name: string | null; customer_email: string;
  customer_phone: string | null; pickup_address: string; dropoff_address: string;
  flight_number: string | null; pickup_sign_name: string | null; notes: string | null;
  passengers: number; children: number; child_seats: number; pets: boolean;
  drive_minutes: number; distance_km100: number; cancellation_reason: string | null;
  cancelled_by: string | null; refunded_minor: string | null;
  driver_name: string; handle: string; driver_profile_id: string;
  driver_email: string; driver_phone: string | null;
  make: string; model: string; year: number; plate: string; seats: number; luggage: number;
  route: string | null;
}

void config;
