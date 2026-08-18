import { requirePermission } from "@/lib/auth/session";
import { sql } from "@db/client";
import { PageHeader, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await requirePermission("admin.audit.read");

  const rows = await sql<Row[]>`
    SELECT a.id, a.at, a.action, a.object_type, a.object_id, a.reason, a.correlation_id, u.email
    FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
    ORDER BY a.at DESC LIMIT 200`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        description="Append-only. The database rejects updates and deletes on this table."
      />
      <Table head={["When", "Actor", "Action", "Object", "Reason", "Correlation"]}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="px-4 py-2.5 whitespace-nowrap text-xs tabular-nums">
              {new Date(r.at).toLocaleString()}
            </td>
            <td className="px-4 py-2.5 text-xs">{r.email ?? "system"}</td>
            <td className="px-4 py-2.5 font-mono text-xs">{r.action}</td>
            <td className="px-4 py-2.5 text-xs">
              {r.object_type}
              {r.object_id && <span className="ml-1 text-ink-400">{r.object_id.slice(0, 8)}</span>}
            </td>
            <td className="px-4 py-2.5 text-xs text-ink-600">{r.reason ?? "—"}</td>
            <td className="px-4 py-2.5 font-mono text-xs text-ink-400">{r.correlation_id?.slice(0, 8) ?? "—"}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

interface Row {
  id: number; at: Date; action: string; object_type: string; object_id: string | null;
  reason: string | null; correlation_id: string | null; email: string | null;
}
