import { requirePermission } from "@/lib/auth/session";
import { adminT } from "@/lib/i18n/admin";
import { sql } from "@db/client";
import { config } from "@/lib/config";
import { toMajorString } from "@/lib/money";
import { Alert, Card, PageHeader, Table } from "@/components/ui";
import { BandForm } from "./forms";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function PricingBandsPage() {
  const actor = await requirePermission("admin.pricing.approve");
  const t = adminT(actor.locale);

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
      <PageHeader title={t("page.pricing")} description={t("page.pricingSub")} />

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

      {can(actor.roles, "admin.pricing.bands.write") ? (
        <section>
          <h2 className="mb-1 font-semibold text-ink-900">Edit bands</h2>
          <p className="mb-4 text-sm text-ink-600">
            A band change reprices every future quote in that class. Bookings already made keep their own
            frozen price, and drivers whose current rate falls outside the new band keep quoting their old
            one until they edit it — you will be told how many.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {bands.map((b) => (
              <BandForm key={b.class} band={{
                class: b.class,
                minRate: toMajorString(b.min_rate_per_km_minor),
                maxRate: toMajorString(b.max_rate_per_km_minor),
                floor: toMajorString(b.min_fare_floor_minor),
                ceiling: toMajorString(b.max_fare_ceiling_minor),
                overnight: toMajorString(b.max_overnight_minor),
                maxSeasonPct: Math.round(b.max_season_factor_bps / 100),
              }} />
            ))}
          </div>
        </section>
      ) : (
        <p className="text-xs text-ink-500">
          Your role can read the bands but not change them. Band edits need the pricing permission.
        </p>
      )}
    </div>
  );
}

interface BandRow {
  class: string; currency: string; min_rate_per_km_minor: bigint; max_rate_per_km_minor: bigint;
  min_fare_floor_minor: bigint; max_fare_ceiling_minor: bigint; max_overnight_minor: bigint;
  max_season_factor_bps: number; active: boolean;
}
