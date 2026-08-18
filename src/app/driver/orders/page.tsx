import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { formatMoney } from "@/lib/money";
import { driverBalance } from "@/lib/ledger";
import { config } from "@/lib/config";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { OrderActions } from "./order-actions";

export const dynamic = "force-dynamic";

const LIVE = ["CONFIRMED", "DRIVER_ACKNOWLEDGED", "READY", "DRIVER_ARRIVED", "IN_PROGRESS"];

export default async function DriverOrders() {
  const user = await requireUser();
  const [driver] = await sql<{ id: string }[]>`SELECT id FROM driver_profiles WHERE user_id = ${user.id}::uuid`;
  if (!driver) return <EmptyState title="Create your driver profile first" />;

  const [orders, balance] = await Promise.all([
    sql<Row[]>`
      SELECT b.id, b.code, b.status::text AS status, b.payment_mode::text AS payment_mode,
             b.service_start_at, b.gross_minor, b.driver_net_minor, b.commission_minor, b.currency,
             b.pickup_address, b.dropoff_address, b.flight_number, b.pickup_sign_name,
             b.passengers, b.children, b.luggage, b.child_seats, b.pets, b.notes,
             b.drive_minutes, b.customer_name, b.customer_phone, b.acknowledged_at,
             b.cash_confirmed_at, b.created_at,
             (SELECT string_agg(l.label, ' → ' ORDER BY l.position)
                FROM booking_legs l WHERE l.booking_id = b.id) AS route,
             (SELECT count(*) FROM messages m WHERE m.booking_id = b.id) AS message_count
      FROM bookings b
      WHERE b.driver_id = ${driver.id}::uuid
        AND b.status <> 'DRAFT'
      ORDER BY
        CASE WHEN b.status = 'CONFIRMED' THEN 0 ELSE 1 END,
        b.service_start_at
      LIMIT 60`,
    driverBalance(driver.id),
  ]);

  const needsAck = orders.filter((o) => o.status === "CONFIRMED");
  const live = orders.filter((o) => LIVE.includes(o.status) && o.status !== "CONFIRMED");
  const past = orders.filter((o) => !LIVE.includes(o.status));

  return (
    <div className="space-y-6">
      <PageHeader title="Your orders" description="Confirm new bookings quickly — travellers are told when you do." />

      {balance.cashBlocked && (
        <Alert tone="danger" title="Cash bookings paused">
          {balance.blockedReason}. You owe {formatMoney(balance.owedToPlatformMinor, "GEL")} in commission.
          Card-paid work is unaffected. Settle your balance to start receiving cash trips again.
        </Alert>
      )}

      {needsAck.length > 0 && (
        <Alert tone="warning" title={`${needsAck.length} order(s) need your confirmation`}>
          Please confirm within {config.policy.driverAckSlaMinutes} minutes, or operations will look for
          another driver.
        </Alert>
      )}

      {orders.length === 0 && <EmptyState title="No orders yet">
        Make sure your profile is published, your prices are set, and your calendar is open.
      </EmptyState>}

      {[["Needs confirmation", needsAck], ["Upcoming", live], ["Past", past]].map(([title, list]) => {
        const rows = list as Row[];
        if (rows.length === 0) return null;
        return (
          <section key={title as string}>
            <h2 className="mb-3 font-semibold text-ink-900">{title as string}</h2>
            <ul className="space-y-4">
              {rows.map((o) => (
                <li key={o.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-medium text-ink-900">{o.code}</span>
                          <Badge tone={o.status === "CONFIRMED" ? "warning" : o.status === "COMPLETED" ? "success" : o.status === "CANCELLED" ? "danger" : "info"}>
                            {o.status.replaceAll("_", " ").toLowerCase()}
                          </Badge>
                          <Badge tone={o.payment_mode === "CASH" ? "warning" : "neutral"}>
                            {o.payment_mode === "CASH" ? "collect cash" : "paid online"}
                          </Badge>
                        </div>
                        <p className="mt-1 font-medium text-ink-900">{o.route}</p>
                        <p className="text-sm text-ink-600">
                          {new Date(o.service_start_at).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })}
                          {" · "}{Math.floor(o.drive_minutes / 60)} h {o.drive_minutes % 60} min
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-lg font-semibold text-ink-900">
                          {formatMoney(BigInt(o.driver_net_minor), o.currency)}
                        </p>
                        <p className="text-xs text-ink-500">
                          your earnings · fare {formatMoney(BigInt(o.gross_minor), o.currency)}
                        </p>
                      </div>
                    </div>

                    {/* Full detail only once the driver has committed to the trip. */}
                    {o.status !== "CONFIRMED" && !["CANCELLED"].includes(o.status) && (
                      <dl className="mt-3 grid gap-2 border-t border-ink-100 pt-3 text-sm sm:grid-cols-2">
                        <div><dt className="text-ink-500">Pickup</dt><dd>{o.pickup_address}</dd></div>
                        <div><dt className="text-ink-500">Drop-off</dt><dd>{o.dropoff_address}</dd></div>
                        <div><dt className="text-ink-500">Traveller</dt>
                          <dd>{o.customer_name} · {o.customer_phone}</dd></div>
                        <div><dt className="text-ink-500">Party</dt>
                          <dd>{o.passengers} passenger(s){o.children > 0 && `, ${o.children} child(ren)`}
                            {o.child_seats > 0 && `, ${o.child_seats} child seat(s)`}{o.pets && ", pet"}</dd></div>
                        {o.flight_number && <div><dt className="text-ink-500">Flight</dt><dd>{o.flight_number}</dd></div>}
                        {o.pickup_sign_name && <div><dt className="text-ink-500">Sign</dt><dd>{o.pickup_sign_name}</dd></div>}
                        {o.notes && <div className="sm:col-span-2"><dt className="text-ink-500">Notes</dt><dd>{o.notes}</dd></div>}
                      </dl>
                    )}

                    <div className="mt-3 border-t border-ink-100 pt-3">
                      <OrderActions
                        bookingId={o.id}
                        status={o.status}
                        paymentMode={o.payment_mode}
                        cashConfirmed={Boolean(o.cash_confirmed_at)}
                      />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

interface Row {
  id: string; code: string; status: string; payment_mode: string; service_start_at: Date;
  gross_minor: string; driver_net_minor: string; commission_minor: string; currency: string;
  pickup_address: string; dropoff_address: string; flight_number: string | null;
  pickup_sign_name: string | null; passengers: number; children: number; luggage: number;
  child_seats: number; pets: boolean; notes: string | null; drive_minutes: number;
  customer_name: string | null; customer_phone: string | null; acknowledged_at: Date | null;
  cash_confirmed_at: Date | null; created_at: Date; route: string | null; message_count: number;
}
