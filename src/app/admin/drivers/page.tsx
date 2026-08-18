import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { sql } from "@db/client";
import { Badge, PageHeader, Table } from "@/components/ui";
import { CreateDriverForm } from "./forms";

export const dynamic = "force-dynamic";

const TONES: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral", SUBMITTED: "info", IN_REVIEW: "info", CHANGES_REQUESTED: "warning",
  APPROVED: "success", SUSPENDED: "danger", REJECTED: "danger",
};

export default async function DriversList({
  searchParams,
}: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission("admin.drivers.read");
  const { status } = await searchParams;

  const locations = await sql<{ id: string; name_en: string }[]>`
    SELECT id, name_en FROM locations ORDER BY name_en`;

  const rows = await sql<Row[]>`
    SELECT d.id, d.public_name, d.handle, d.status::text AS status, d.published,
           d.completed_trips, d.rating_sum, d.rating_count,
           (SELECT count(*) FROM vehicles v WHERE v.driver_id = d.id)::int AS vehicles
    FROM driver_profiles d
    ${status ? sql`WHERE d.status = ${status}::driver_status` : sql``}
    ORDER BY d.created_at DESC LIMIT 200`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Drivers"
        description={`${rows.length} record(s)`}
        actions={<CreateDriverForm locations={locations} />}
      />

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Filter by status">
        <Link href="/admin/drivers" className="rounded-lg border border-ink-200 bg-white px-3 py-1.5">All</Link>
        {Object.keys(TONES).map((s) => (
          <Link key={s} href={`/admin/drivers?status=${s}`}
                className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 hover:bg-ink-50">
            {s.replaceAll("_", " ").toLowerCase()}
          </Link>
        ))}
      </nav>

      <Table head={["Driver", "Status", "Live", "Vehicles", "Trips", "Rating", ""]}>
        {rows.map((d) => (
          <tr key={d.id}>
            <td className="px-4 py-2.5 font-medium">{d.public_name}</td>
            <td className="px-4 py-2.5"><Badge tone={TONES[d.status] ?? "neutral"}>{d.status}</Badge></td>
            <td className="px-4 py-2.5">{d.published ? <Badge tone="success">Live</Badge> : "—"}</td>
            <td className="px-4 py-2.5 tabular-nums">{d.vehicles}</td>
            <td className="px-4 py-2.5 tabular-nums">{d.completed_trips}</td>
            <td className="px-4 py-2.5 tabular-nums">
              {d.rating_count > 0 ? `${(d.rating_sum / d.rating_count).toFixed(1)} (${d.rating_count})` : "—"}
            </td>
            <td className="px-4 py-2.5 text-right">
              <Link href={`/admin/drivers/${d.id}`} className="text-brand-700 underline">Open</Link>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

interface Row {
  id: string; public_name: string; handle: string; status: string; published: boolean;
  completed_trips: number; rating_sum: number; rating_count: number; vehicles: number;
}
