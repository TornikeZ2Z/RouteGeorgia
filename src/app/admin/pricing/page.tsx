import { requirePermission } from "@/lib/auth/session";
import { sql } from "@db/client";
import { config } from "@/lib/config";
import { toMajorString } from "@/lib/money";
import { Alert, Card, PageHeader, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PricingBandsPage() {
  await requirePermission("admin.pricing.approve");

  const bands = await sql<BandRow[]>`
    SELECT class::text AS class, currency, min_rate_per_km_minor, max_rate_per_km_minor,
           min_fare_floor_minor, max_fare_ceiling_minor, max_overnight_minor,
           max_season_factor_bps, active
    FROM price_bands ORDER BY class`;

  const [stats] = await sql<{ plans: number; drivers: number }[]>`
    SELECT (SELECT count(*) FROM price_plans WHERE status = 'ACTIVE')::int AS plans,
           (SELECT count(DISTINCT driver_id) FROM price_plans WHERE status = 'ACTIVE')::int AS drivers`;

  return (
    <div className="space-y-6">
      <PageHeader title="Price bands and policy" description="Guardrails that constrain what drivers may charge." />

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-ink-500">Commission</p>
          <p className="mt-1 text-2xl font-semibold">{(config.policy.commissionRateBps / 100).toFixed(2)}%</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Rounding step</p>
          <p className="mt-1 text-2xl font-semibold">{toMajorString(BigInt(config.policy.roundingStepMinor))}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Active price plans</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{stats?.plans ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Drivers with pricing</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{stats?.drivers ?? 0}</p>
        </Card>
      </div>

      <Alert tone="info" title="Commission is frozen at booking time">
        Changing the rate here affects new bookings only. Every booking stores the commission version that
        applied when it was made, so historic statements never change retroactively.
      </Alert>

      <Table head={["Class", "Rate/km min", "Rate/km max", "Fare floor", "Fare ceiling", "Max overnight", "Max season", "Active"]}>
        {bands.map((b) => (
          <tr key={b.class}>
            <td className="px-4 py-2.5">{b.class.replaceAll("_", " ").toLowerCase()}</td>
            <td className="px-4 py-2.5 tabular-nums">{toMajorString(b.min_rate_per_km_minor)}</td>
            <td className="px-4 py-2.5 tabular-nums">{toMajorString(b.max_rate_per_km_minor)}</td>
            <td className="px-4 py-2.5 tabular-nums">{toMajorString(b.min_fare_floor_minor)}</td>
            <td className="px-4 py-2.5 tabular-nums">{toMajorString(b.max_fare_ceiling_minor)}</td>
            <td className="px-4 py-2.5 tabular-nums">{toMajorString(b.max_overnight_minor)}</td>
            <td className="px-4 py-2.5 tabular-nums">{(b.max_season_factor_bps / 100).toFixed(0)}%</td>
            <td className="px-4 py-2.5">{b.active ? "yes" : "no"}</td>
          </tr>
        ))}
      </Table>

      <p className="text-xs text-ink-500">
        Editing bands from the UI is intentionally not built yet: a band change silently reprices the whole
        marketplace, so it belongs behind four-eyes approval. Change them in the database during the pilot.
      </p>
    </div>
  );
}

interface BandRow {
  class: string; currency: string; min_rate_per_km_minor: bigint; max_rate_per_km_minor: bigint;
  min_fare_floor_minor: bigint; max_fare_ceiling_minor: bigint; max_overnight_minor: bigint;
  max_season_factor_bps: number; active: boolean;
}
