import { requirePermission } from "@/lib/auth/session";
import { sql } from "@db/client";
import { Alert, Badge, Card, PageHeader, Table } from "@/components/ui";
import { StaffForm, RevokeButton } from "./forms";

export const dynamic = "force-dynamic";

const STAFF_ROLES = [
  "SUPPORT_AGENT", "OPERATIONS_MANAGER", "FINANCE_ADMIN", "CONTENT_ADMIN", "SUPER_ADMIN",
] as const;

const DESCRIPTION: Record<string, string> = {
  SUPPORT_AGENT: "Read bookings and drivers, reply to travellers. Cannot decide or touch money.",
  OPERATIONS_MANAGER: "Verify drivers, publish them, reassign and cancel bookings.",
  FINANCE_ADMIN: "Refunds, settlements, credit limits, the ledger.",
  CONTENT_ADMIN: "Locations, routes and published content. No access to driver documents.",
  SUPER_ADMIN: "Everything, including the audit log and granting access.",
};

export default async function Staff() {
  const actor = await requirePermission("admin.rbac.write");

  const rows = await sql<{ id: string; email: string; roles: string[]; last_auth_at: Date | null; status: string }[]>`
    SELECT u.id, u.email, u.status::text AS status, u.last_auth_at,
           array_agg(r.role::text) AS roles
    FROM users u JOIN user_roles r ON r.user_id = u.id
    WHERE r.role::text = ANY(${[...STAFF_ROLES]}::text[])
    GROUP BY u.id ORDER BY u.email`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff and access"
        description="Who can sign in to operations, and what they may do."
      />

      <Alert tone="warning" title="This is the permission that grants every other permission">
        Give the narrowest role that lets someone do their job. A support agent who only needs to answer
        travellers should not be able to approve drivers or issue refunds.
      </Alert>

      <Table head={["Email", "Roles", "Last signed in", "Status", ""]}>
        {rows.map((u) => (
          <tr key={u.id}>
            <td className="px-4 py-2.5 font-medium">
              {u.email}
              {u.id === actor.id && <span className="ml-2 text-xs text-ink-500">(you)</span>}
            </td>
            <td className="px-4 py-2.5">
              <span className="flex flex-wrap gap-1">
                {u.roles.map((r) => (
                  <Badge key={r} tone={r === "SUPER_ADMIN" ? "danger" : "neutral"}>
                    {r.replaceAll("_", " ").toLowerCase()}
                  </Badge>
                ))}
              </span>
            </td>
            <td className="px-4 py-2.5 text-xs">
              {u.last_auth_at ? new Date(u.last_auth_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "never"}
            </td>
            <td className="px-4 py-2.5">
              <Badge tone={u.status === "ACTIVE" ? "success" : "danger"}>{u.status.toLowerCase()}</Badge>
            </td>
            <td className="px-4 py-2.5 text-right">
              {u.id !== actor.id && <RevokeButton userId={u.id} email={u.email} />}
            </td>
          </tr>
        ))}
      </Table>

      <Card className="p-5">
        <h2 className="font-semibold text-ink-900">Grant access</h2>
        <p className="mt-1 text-sm text-ink-600">
          If the email already has an account, its staff roles are replaced with what you choose here.
          Otherwise a new account is created and a one-time password shown once.
        </p>
        <div className="mt-4">
          <StaffForm roles={STAFF_ROLES.map((r) => ({ value: r, description: DESCRIPTION[r] ?? "" }))} />
        </div>
      </Card>
    </div>
  );
}
