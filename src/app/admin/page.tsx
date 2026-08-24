import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { sql } from "@db/client";
import { config } from "@/lib/config";
import { Alert, Badge, Card, PageHeader, Table } from "@/components/ui";
import { adminT, driverStatusLabel } from "@/lib/i18n/admin";

export const dynamic = "force-dynamic";

/**
 * Command centre. Operational, not analytical: what needs a human today,
 * ordered by urgency. Every number on it is a queue with an owner, not a
 * vanity metric.
 */
export default async function AdminHome() {
  const user = await requirePermission("admin.access");
  const t = adminT(user.locale);

  const [[counts], queue, expiring, tickets] = await Promise.all([
    sql<CountRow[]>`
      SELECT
        (SELECT count(*) FROM driver_profiles WHERE status IN ('SUBMITTED','IN_REVIEW'))::int AS in_queue,
        (SELECT count(*) FROM driver_documents WHERE state = 'PENDING')::int AS docs_pending,
        (SELECT count(*) FROM vehicles WHERE status = 'SUBMITTED')::int AS vehicles_pending,
        (SELECT count(*) FROM driver_profiles WHERE published)::int AS published,
        (SELECT count(*) FROM driver_profiles d
          WHERE d.status = 'APPROVED' AND NOT d.published
            AND current_contract_version() IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM contract_signatures s
                             WHERE s.driver_id = d.id
                               AND s.contract_version = current_contract_version()))::int AS unsigned,
        (SELECT count(*) FROM support_tickets WHERE state IN ('OPEN','WAITING'))::int AS tickets,
        (SELECT count(*) FROM bookings
          WHERE status = 'CONFIRMED'
            AND created_at < now() - (${config.policy.driverAckSlaMinutes} || ' minutes')::interval)::int AS unacked,
        (SELECT count(*) FROM bookings
          WHERE service_start_at BETWEEN now() AND now() + interval '72 hours'
            AND status NOT IN ('CANCELLED','COMPLETED','CLOSED'))::int AS next72h`,
    sql<QueueRow[]>`
      SELECT d.id, d.public_name, d.status::text AS status, d.submitted_at, d.applied_via,
             (SELECT count(*) FROM driver_documents dd WHERE dd.driver_id = d.id AND dd.state = 'PENDING')::int AS pending_docs
      FROM driver_profiles d
      WHERE d.status IN ('SUBMITTED','IN_REVIEW','CHANGES_REQUESTED')
      ORDER BY d.submitted_at NULLS LAST LIMIT 20`,
    sql<ExpiringRow[]>`
      SELECT d.id, d.public_name, dd.type::text AS type, dd.expires_on
      FROM driver_documents dd JOIN driver_profiles d ON d.id = dd.driver_id
      WHERE dd.is_mandatory AND dd.state = 'APPROVED'
        AND dd.expires_on IS NOT NULL AND dd.expires_on < current_date + 30
      ORDER BY dd.expires_on LIMIT 20`,
    sql<TicketRow[]>`
      SELECT id, subject, severity::text AS severity, created_at
      FROM support_tickets WHERE state IN ('OPEN','WAITING')
      ORDER BY CASE severity WHEN 'SEV1' THEN 0 WHEN 'SEV2' THEN 1 WHEN 'SEV3' THEN 2 ELSE 3 END,
               created_at DESC
      LIMIT 8`,
  ]);

  const stats: [string, number, string][] = [
    [t("dash.statQueue"), counts?.in_queue ?? 0, "/admin/drivers?status=SUBMITTED"],
    [t("dash.statDocs"), counts?.docs_pending ?? 0, "/admin/drivers"],
    [t("dash.statVehicles"), counts?.vehicles_pending ?? 0, "/admin/drivers"],
    [t("dash.statUnsigned"), counts?.unsigned ?? 0, "/admin/drivers?status=APPROVED"],
    [t("dash.statUnacked"), counts?.unacked ?? 0, "/admin/bookings?status=CONFIRMED"],
    [t("dash.stat72h"), counts?.next72h ?? 0, "/admin/bookings"],
    [t("dash.statTickets"), counts?.tickets ?? 0, "/admin/support"],
    [t("dash.statPublished"), counts?.published ?? 0, "/admin/drivers"],
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("dash.title")} description={t("dash.subtitle")} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, value, href]) => (
          <Link key={label} href={href} className="group">
            <Card className="p-4 transition-colors group-hover:border-ink-400">
              <p className="text-sm text-ink-500">{label}</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${value > 0 && href.includes("status=") ? "text-ink-900" : "text-ink-700"}`}>
                {value}
              </p>
            </Card>
          </Link>
        ))}
      </div>

      {(counts?.published ?? 0) < 30 && (
        <Alert tone="warning">
          {t("dash.supplyWarning")} {counts?.published ?? 0}.
        </Alert>
      )}

      <section>
        <h2 className="mb-2 font-semibold text-ink-900">{t("dash.queueTitle")}</h2>
        {queue.length === 0 ? (
          <p className="text-sm text-ink-500">{t("dash.queueEmpty")}</p>
        ) : (
          <Table head={[t("drivers.colDriver"), t("drivers.colStatus"), t("dash.statDocs"), ""]}>
            {queue.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2.5 font-medium">
                  {d.public_name}
                  {d.applied_via === "public_form" && (
                    <span className="ml-2 rounded bg-steel-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-steel-700">web</span>
                  )}
                </td>
                <td className="px-4 py-2.5"><Badge tone="info">{driverStatusLabel(d.status, user.locale)}</Badge></td>
                <td className="px-4 py-2.5 tabular-nums">{d.pending_docs}</td>
                <td className="px-4 py-2.5 text-right">
                  <Link href={`/admin/drivers/${d.id}`} className="text-ink-900 underline">{t("dash.review")}</Link>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold text-ink-900">{t("dash.ticketsTitle")}</h2>
          {tickets.length === 0 ? (
            <p className="text-sm text-ink-500">{t("dash.ticketsEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link href="/admin/support" className="block rounded-xl border border-ink-200 bg-white px-4 py-3 hover:border-ink-400">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium text-ink-900">{ticket.subject}</p>
                      <Badge tone={ticket.severity === "SEV1" ? "danger" : ticket.severity === "SEV2" ? "warning" : "neutral"}>
                        {ticket.severity}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-500">{new Date(ticket.created_at).toLocaleString()}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-ink-900">{t("dash.expiringTitle")}</h2>
          {expiring.length === 0 ? (
            <p className="text-sm text-ink-500">{t("dash.expiringEmpty")}</p>
          ) : (
            <Table head={[t("drivers.colDriver"), t("driver.documentsTitle"), "", ""]}>
              {expiring.map((e, i) => (
                <tr key={i}>
                  <td className="px-4 py-2.5">{e.public_name}</td>
                  <td className="px-4 py-2.5">{e.type.replaceAll("_", " ").toLowerCase()}</td>
                  <td className="px-4 py-2.5 tabular-nums">{e.expires_on}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/admin/drivers/${e.id}`} className="text-ink-900 underline">{t("dash.open")}</Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      </div>
    </div>
  );
}

interface CountRow {
  in_queue: number; docs_pending: number; vehicles_pending: number; published: number;
  unsigned: number; tickets: number; unacked: number; next72h: number;
}
interface QueueRow { id: string; public_name: string; status: string; submitted_at: Date | null; applied_via: string; pending_docs: number }
interface ExpiringRow { id: string; public_name: string; type: string; expires_on: string }
interface TicketRow { id: string; subject: string; severity: string; created_at: Date }
