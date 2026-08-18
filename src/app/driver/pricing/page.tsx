import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { toMajorString } from "@/lib/money";
import { Alert, Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { ActionForm } from "@/components/form-state";
import { savePricePlanAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const user = await requireUser();
  const [driver] = await sql<{ id: string }[]>`SELECT id FROM driver_profiles WHERE user_id = ${user.id}::uuid`;
  if (!driver) return <EmptyState title="Create your profile first" />;

  const [vehicles, plans, bands] = await Promise.all([
    sql<{ id: string; make: string; model: string; class: string }[]>`
      SELECT id, make, model, class::text AS class FROM vehicles WHERE driver_id = ${driver.id}::uuid`,
    sql<PlanRow[]>`
      SELECT p.id, p.version, p.status::text AS status, p.rate_per_km_minor, p.minimum_fare_minor,
             p.season_factor_bps, p.effective_from, v.make, v.model
      FROM price_plans p JOIN vehicles v ON v.id = p.vehicle_id
      WHERE p.driver_id = ${driver.id}::uuid ORDER BY p.created_at DESC LIMIT 20`,
    sql<BandRow[]>`
      SELECT class::text AS class, min_rate_per_km_minor, max_rate_per_km_minor,
             min_fare_floor_minor, max_fare_ceiling_minor, max_overnight_minor, max_season_factor_bps
      FROM price_bands WHERE active`,
  ]);

  if (vehicles.length === 0) return <EmptyState title="Add a vehicle before setting prices" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your prices"
        description="You set your own rates inside the platform bands for your vehicle class."
      />

      <Alert tone="info" title="How your price is calculated">
        Your per-km rate is applied to the loaded distance. On routes where you must return empty, a share
        of that return distance is added — the share is set per route by operations, so you do not have to
        inflate your rate to cover it. Long mountain routes recover most of the return leg; city transfers
        recover almost none.
      </Alert>

      <Card className="p-4 sm:p-6">
        <h2 className="mb-1 font-semibold text-ink-900">Set a new price version</h2>
        <p className="mb-4 text-sm text-ink-600">
          Saving creates a new version. Quotes already given to travellers keep their original price.
        </p>

        <ActionForm action={savePricePlanAction} submitLabel="Save new version">
          <Field label="Vehicle" htmlFor="vehicleId" required>
            <Select id="vehicleId" name="vehicleId" required>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.make} {v.model} ({v.class.toLowerCase()})</option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rate per km (GEL)" htmlFor="ratePerKm" required>
              <Input id="ratePerKm" name="ratePerKm" inputMode="decimal" placeholder="1.20" required />
            </Field>
            <Field label="Rate per minute (GEL)" htmlFor="ratePerMinute" hint="Optional. Helps on slow mountain roads.">
              <Input id="ratePerMinute" name="ratePerMinute" inputMode="decimal" defaultValue="0" />
            </Field>
            <Field label="Extra stop fee (GEL)" htmlFor="perStopFee">
              <Input id="perStopFee" name="perStopFee" inputMode="decimal" defaultValue="0" />
            </Field>
            <Field label="Overnight fee (GEL)" htmlFor="overnightFee" hint="Your accommodation and meals on multi-day trips.">
              <Input id="overnightFee" name="overnightFee" inputMode="decimal" defaultValue="0" />
            </Field>
            <Field label="Minimum fare (GEL)" htmlFor="minimumFare">
              <Input id="minimumFare" name="minimumFare" inputMode="decimal" defaultValue="0" />
            </Field>
            <Field label="Season factor (%)" htmlFor="seasonFactorPct" hint="100 = no change. Shown to travellers in the breakdown.">
              <Input id="seasonFactorPct" name="seasonFactorPct" type="number" min={80} max={200} defaultValue={100} />
            </Field>
          </div>
        </ActionForm>
      </Card>

      <section>
        <h2 className="mb-2 font-semibold text-ink-900">Platform bands</h2>
        <Table head={["Class", "Rate per km", "Minimum fare", "Max fare", "Max season"]}>
          {bands.map((b) => (
            <tr key={b.class}>
              <td className="px-4 py-2.5">{b.class.replaceAll("_", " ").toLowerCase()}</td>
              <td className="px-4 py-2.5 tabular-nums">
                {toMajorString(b.min_rate_per_km_minor)} – {toMajorString(b.max_rate_per_km_minor)}
              </td>
              <td className="px-4 py-2.5 tabular-nums">{toMajorString(b.min_fare_floor_minor)}</td>
              <td className="px-4 py-2.5 tabular-nums">{toMajorString(b.max_fare_ceiling_minor)}</td>
              <td className="px-4 py-2.5 tabular-nums">{(b.max_season_factor_bps / 100).toFixed(0)}%</td>
            </tr>
          ))}
        </Table>
      </section>

      {plans.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold text-ink-900">Version history</h2>
          <Table head={["Vehicle", "Version", "Rate/km", "Minimum", "Season", "From", "Status"]}>
            {plans.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2.5">{p.make} {p.model}</td>
                <td className="px-4 py-2.5 tabular-nums">v{p.version}</td>
                <td className="px-4 py-2.5 tabular-nums">{toMajorString(p.rate_per_km_minor)}</td>
                <td className="px-4 py-2.5 tabular-nums">{toMajorString(p.minimum_fare_minor)}</td>
                <td className="px-4 py-2.5 tabular-nums">{(p.season_factor_bps / 100).toFixed(0)}%</td>
                <td className="px-4 py-2.5">{new Date(p.effective_from).toLocaleDateString()}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={p.status === "ACTIVE" ? "success" : "neutral"}>{p.status}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        </section>
      )}
    </div>
  );
}

interface PlanRow {
  id: string; version: number; status: string; rate_per_km_minor: bigint;
  minimum_fare_minor: bigint; season_factor_bps: number; effective_from: Date;
  make: string; model: string;
}
interface BandRow {
  class: string; min_rate_per_km_minor: bigint; max_rate_per_km_minor: bigint;
  min_fare_floor_minor: bigint; max_fare_ceiling_minor: bigint;
  max_overnight_minor: bigint; max_season_factor_bps: number;
}
