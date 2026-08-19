import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  DRAFT: "neutral", SUBMITTED: "info", IN_REVIEW: "info",
  CHANGES_REQUESTED: "warning", APPROVED: "success",
  SUSPENDED: "danger", REJECTED: "danger",
} as const;

export default async function DriverHome() {
  const user = await requireUser();

  const [driver] = await sql<DriverRow[]>`
    SELECT id, handle, public_name, status::text AS status, published
    FROM driver_profiles WHERE user_id = ${user.id}::uuid`;

  if (!driver) {
    return (
      <EmptyState title="You do not have a driver profile yet">
        <Link className="text-ink-900 underline" href="/driver/application">Start your application</Link>
      </EmptyState>
    );
  }

  const [docs, vehicles, blocks] = await Promise.all([
    sql<{ type: string; state: string; expires_on: string | null }[]>`
      SELECT type::text, state::text, expires_on FROM driver_documents
      WHERE driver_id = ${driver.id}::uuid ORDER BY type`,
    sql<{ id: string; make: string; model: string; status: string; published: boolean }[]>`
      SELECT id, make, model, status::text, published FROM vehicles WHERE driver_id = ${driver.id}::uuid`,
    sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM availability_blocks
      WHERE driver_id = ${driver.id}::uuid AND upper(period) > now()`,
  ]);

  const expiringSoon = docs.filter(
    (d) => d.expires_on && new Date(d.expires_on).getTime() < Date.now() + 30 * 86_400_000,
  );
  const pending = docs.filter((d) => d.state !== "APPROVED");

  return (
    <div className="space-y-6">
      <PageHeader
        title={driver.public_name}
        description={`Profile status: ${driver.status.replaceAll("_", " ").toLowerCase()}`}
        actions={<Badge tone={STATUS_TONE[driver.status as keyof typeof STATUS_TONE]}>{driver.status}</Badge>}
      />

      {driver.status === "CHANGES_REQUESTED" && (
        <Alert tone="warning" title="Changes requested">
          Operations asked for updates before your profile can be published. Check Documents and Profile.
        </Alert>
      )}

      {expiringSoon.length > 0 && (
        <Alert tone="warning" title="Documents expiring soon">
          {expiringSoon.map((d) => `${d.type.replaceAll("_", " ")} (expires ${d.expires_on})`).join(", ")}.
          New bookings pause automatically once a mandatory document expires.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-ink-500">Vehicles</p>
          <p className="mt-1 text-2xl font-semibold">{vehicles.length}</p>
          <p className="mt-1 text-xs text-ink-500">{vehicles.filter((v) => v.published).length} published</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Documents awaiting review</p>
          <p className="mt-1 text-2xl font-semibold">{pending.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Upcoming calendar blocks</p>
          <p className="mt-1 text-2xl font-semibold">{blocks[0]?.n ?? 0}</p>
        </Card>
      </div>

      {driver.published && (
        <Alert tone="success" title="Your profile is live">
          Travellers can find you in search results.{" "}
          <Link className="underline" href={`/en/drivers/${driver.handle}`}>View public profile</Link>
        </Alert>
      )}
    </div>
  );
}

interface DriverRow { id: string; handle: string; public_name: string; status: string; published: boolean }
