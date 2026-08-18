import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { sql } from "@db/client";
import { formatMoney } from "@/lib/money";
import { config } from "@/lib/config";
import { Alert, Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

const TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  PENDING_PAYMENT: "warning", CONFIRMED: "info", DRIVER_ACKNOWLEDGED: "success",
  READY: "success", DRIVER_ARRIVED: "info", IN_PROGRESS: "info",
  COMPLETED: "success", CANCELLED: "danger", REASSIGNING: "warning", DISPUTED: "danger",
};

/**
 * Booking command centre. Ordered by urgency, not by recency: what needs a
 * human today comes first.
 */
export default async function AdminBookings({
  searchParams,
}: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission("admin.bookings.read");
  const { status } = await searchParams;

  const [rows, risk] = await Promise.all([
    sql<Row[]>`
      SELECT b.id, b.code, b.status::text AS status, b.payment_mode::text AS payment_mode,
             b.service_start_at, b.gross_minor, b.currency, b.customer_name, b.customer_email,
             b.acknowledged_at, b.created_at, b.cancellation_reason,
             d.public_name AS driver_name, d.id AS driver_id,
             (SELECT string_agg(l.label, ' → ' ORDER BY l.position)
                FROM booking_legs l WHERE l.booking_id = b.id) AS route
      FROM bookings b
      JOIN driver_profiles d ON d.id = b.driver_id
      ${status ? sql`WHERE b.status = ${status}::booking_status` : sql``}
      ORDER BY b.service_start_at
      LIMIT 100`,
    sql<{ unacknowledged: number; next72h: number; failed_payments: number; cancelled_today: number }[]>`
      SELECT
        (SELECT count(*) FROM bookings
          WHERE status = 'CONFIRMED'
            AND created_at < now() - (${config.policy.driverAckSlaMinutes} || ' minutes')::interval)::int AS unacknowledged,
        (SELECT count(*) FROM bookings
          WHERE service_start_at BETWEEN now() AND now() + interval '72 hours'
            AND status NOT IN ('CANCELLED','COMPLETED','CLOSED'))::int AS next72h,
        (SELECT count(*) FROM payments WHERE state = 'FAILED')::int AS failed_payments,
        (SELECT count(*) FROM bookings WHERE cancelled_at > now() - interval '24 hours')::int AS cancelled_today`,
  ]);
  const r = risk[0];

  return (
    <div className="space-y-6">
      <PageHeader title="Bookings" description="Soonest departure first." />

      <div className="grid gap-4 sm:grid-cols-4">
        {[["Awaiting driver confirmation", r?.unacknowledged ?? 0],
          ["Departing within 72 hours", r?.next72h ?? 0],
          ["Failed payments", r?.failed_payments ?? 0],
          ["Cancelled in last 24h", r?.cancelled_today ?? 0]].map(([label, value]) => (
          <Card key={label as string} className="p-4">
            <p className="text-sm text-ink-500">{label as string}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value as number}</p>
          </Card>
        ))}
      </div>

      {(r?.unacknowledged ?? 0) > 0 && (
        <Alert tone="warning" title="Drivers have not confirmed">
          {r?.unacknowledged} booking(s) are past the {config.policy.driverAckSlaMinutes}-minute
          acknowledgement window. Contact the driver or start a reassignment before the traveller notices.
        </Alert>
      )}

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Filter by status">
        <Link href="/admin/bookings" className="rounded-lg border border-ink-200 bg-white px-3 py-1.5">All</Link>
        {Object.keys(TONE).map((s) => (
          <Link key={s} href={`/admin/bookings?status=${s}`}
                className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 hover:bg-ink-50">
            {s.replaceAll("_", " ").toLowerCase()}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState title="No bookings match" />
      ) : (
        <Table head={["Code", "Departure", "Route", "Driver", "Traveller", "Payment", "Status"]}>
          {rows.map((b) => (
            <tr key={b.id}>
              <td className="px-4 py-2.5 font-mono text-xs">
                <Link href={`/admin/bookings/${b.id}`} className="text-brand-700 underline">{b.code}</Link>
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap text-xs">
                {new Date(b.service_start_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
              </td>
              <td className="px-4 py-2.5 text-xs">{b.route}</td>
              <td className="px-4 py-2.5 text-xs">
                <Link href={`/admin/drivers/${b.driver_id}`} className="text-brand-700 underline">{b.driver_name}</Link>
              </td>
              <td className="px-4 py-2.5 text-xs">{b.customer_name ?? b.customer_email}</td>
              <td className="px-4 py-2.5 text-xs">
                {formatMoney(BigInt(b.gross_minor), b.currency)}
                <span className="ml-1 text-ink-400">{b.payment_mode.toLowerCase()}</span>
              </td>
              <td className="px-4 py-2.5">
                <Badge tone={TONE[b.status] ?? "neutral"}>{b.status.replaceAll("_", " ").toLowerCase()}</Badge>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

interface Row {
  id: string; code: string; status: string; payment_mode: string; service_start_at: Date;
  gross_minor: string; currency: string; customer_name: string | null; customer_email: string;
  acknowledged_at: Date | null; created_at: Date; cancellation_reason: string | null;
  driver_name: string; driver_id: string; route: string | null;
}
