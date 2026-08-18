import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { sql } from "@db/client";
import { Alert, Badge, Card, PageHeader, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Command centre. Operational, not analytical: what needs a human today,
 * ordered by urgency.
 */
export default async function AdminHome() {
  await requirePermission("admin.access");

  const [[counts], queue, expiring] = await Promise.all([
    sql<CountRow[]>`
      SELECT
        (SELECT count(*) FROM driver_profiles WHERE status IN ('SUBMITTED','IN_REVIEW'))::int AS in_queue,
        (SELECT count(*) FROM driver_documents WHERE state = 'PENDING')::int AS docs_pending,
        (SELECT count(*) FROM driver_profiles WHERE published)::int AS published,
        (SELECT count(*) FROM vehicles WHERE status = 'SUBMITTED')::int AS vehicles_pending,
        (SELECT count(*) FROM route_families WHERE active)::int AS routes`,
    sql<QueueRow[]>`
      SELECT d.id, d.public_name, d.status::text AS status, d.submitted_at,
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
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Command centre" description="Supply and verification for the pilot." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Applications in queue" value={counts?.in_queue ?? 0} />
        <Stat label="Documents pending" value={counts?.docs_pending ?? 0} />
        <Stat label="Vehicles pending" value={counts?.vehicles_pending ?? 0} />
        <Stat label="Published drivers" value={counts?.published ?? 0} />
        <Stat label="Active route families" value={counts?.routes ?? 0} />
      </div>

      {(counts?.published ?? 0) < 30 && (
        <Alert tone="warning" title="Below pilot supply target">
          The launch exit criteria call for at least 30 publishable drivers across 5–10 route families.
          Currently {counts?.published ?? 0} published.
        </Alert>
      )}

      <section>
        <h2 className="mb-2 font-semibold text-ink-900">Verification queue</h2>
        {queue.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing waiting for review.</p>
        ) : (
          <Table head={["Driver", "Status", "Submitted", "Pending documents", ""]}>
            {queue.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2.5 font-medium">{d.public_name}</td>
                <td className="px-4 py-2.5"><Badge tone="info">{d.status}</Badge></td>
                <td className="px-4 py-2.5">{d.submitted_at ? new Date(d.submitted_at).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-2.5 tabular-nums">{d.pending_docs}</td>
                <td className="px-4 py-2.5 text-right">
                  <Link href={`/admin/drivers/${d.id}`} className="text-wine-700 underline">Review</Link>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-ink-900">Documents expiring within 30 days</h2>
        {expiring.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing expiring soon.</p>
        ) : (
          <Table head={["Driver", "Document", "Expires", ""]}>
            {expiring.map((e, i) => (
              <tr key={i}>
                <td className="px-4 py-2.5">{e.public_name}</td>
                <td className="px-4 py-2.5">{e.type.replaceAll("_", " ").toLowerCase()}</td>
                <td className="px-4 py-2.5 tabular-nums">{e.expires_on}</td>
                <td className="px-4 py-2.5 text-right">
                  <Link href={`/admin/drivers/${e.id}`} className="text-wine-700 underline">Open</Link>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}

interface CountRow { in_queue: number; docs_pending: number; published: number; vehicles_pending: number; routes: number }
interface QueueRow { id: string; public_name: string; status: string; submitted_at: Date | null; pending_docs: number }
interface ExpiringRow { id: string; public_name: string; type: string; expires_on: string }
