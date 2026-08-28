import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { Alert, Badge, Card, PageHeader, Table } from "@/components/ui";
import { listSchools } from "@/lib/schools";
import { getActiveContract } from "@/lib/contract";
import { NewSchoolForm } from "./forms";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const STATUS_TONE = {
  PROSPECT: "neutral", ACTIVE: "success", SUSPENDED: "warning", CLOSED: "neutral",
} as const;

export default async function SchoolsPage() {
  const actor = await requirePermission("admin.schools.read");
  const mayWrite = can(actor.roles, "admin.schools.write");

  const [schools, agreement] = await Promise.all([
    listSchools(),
    getActiveContract("ka", "SCHOOL"),
  ]);

  const dateFmt = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schools"
        description="Counterparties under the school excursion agreement, and the trips booked for them."
      />

      {!agreement && (
        <Alert tone="warning" title="No school agreement is published">
          Schools can be added, but no order can be confirmed until a version of the school
          agreement is published and signed.
        </Alert>
      )}

      <Card className="p-0">
        <Table head={["School", "ID code", "Agreement", "Orders", "Next trip", "Status"]}>
          {schools.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3">
                <Link href={`/admin/schools/${s.id}`} className="font-medium text-pine-800 hover:underline">
                  {s.name}
                </Link>
                <p className="text-xs text-ink-500">{s.director}</p>
              </td>
              <td className="px-4 py-3 tabular-nums text-ink-600">{s.idNumber}</td>
              <td className="px-4 py-3">
                {s.signed
                  ? <Badge tone="success">Signed</Badge>
                  : <Badge tone="warning">Not signed</Badge>}
              </td>
              <td className="px-4 py-3 tabular-nums">{s.orders}</td>
              <td className="px-4 py-3">{dateFmt(s.nextTrip)}</td>
              <td className="px-4 py-3">
                <Badge tone={STATUS_TONE[s.status]}>{s.status.toLowerCase()}</Badge>
              </td>
            </tr>
          ))}
          {schools.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-500">
                No schools yet. Add the first one below.
              </td>
            </tr>
          )}
        </Table>
      </Card>

      {mayWrite && <NewSchoolForm />}
    </div>
  );
}
