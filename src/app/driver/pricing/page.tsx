import { requireUser } from "@/lib/auth/session";
import { sql } from "@db/client";
import { toMajorString } from "@/lib/money";
import { getTranslator, isLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { Alert, Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { ActionForm } from "@/components/form-state";
import { savePricePlanAction } from "../actions";

export const dynamic = "force-dynamic";

const CLASS_KEY: Record<string, MessageKey> = {
  ECONOMY: "console.clsECONOMY", COMFORT: "console.clsCOMFORT", MINIVAN: "console.clsMINIVAN",
  SUV_4X4: "console.clsSUV_4X4", MINIBUS: "console.clsMINIBUS", PREMIUM: "console.clsPREMIUM",
};

export default async function PricingPage() {
  const user = await requireUser();
  const t = getTranslator(isLocale(user.locale) ? (user.locale as Locale) : "ka");
  const [driver] = await sql<{ id: string }[]>`SELECT id FROM driver_profiles WHERE user_id = ${user.id}::uuid`;
  if (!driver) return <EmptyState title={t("console.noProfileT")} />;

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

  const classLabel = (value: string) => (CLASS_KEY[value] ? t(CLASS_KEY[value]) : value.toLowerCase());

  if (vehicles.length === 0) return <EmptyState title={t("console.addVehicleT")} />;

  return (
    <div className="space-y-6">
      <PageHeader title={t("console.priceTitle")} description={t("console.priceDesc")} />

      <Alert tone="info" title={t("console.howPriceT")}>{t("console.howPriceB")}</Alert>

      <Card className="p-4 sm:p-6">
        <h2 className="mb-1 font-semibold text-ink-900">{t("console.newVerT")}</h2>
        <p className="mb-4 text-sm text-ink-600">{t("console.newVerB")}</p>

        <ActionForm action={savePricePlanAction} submitLabel={t("console.saveVerCta")}>
          <Field label={t("console.vehicleL")} htmlFor="vehicleId" required>
            <Select id="vehicleId" name="vehicleId" required>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.make} {v.model} ({classLabel(v.class)})</option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("console.rateKmL")} htmlFor="ratePerKm" required>
              <Input id="ratePerKm" name="ratePerKm" inputMode="decimal" placeholder="1.20" required />
            </Field>
            <Field label={t("console.rateMinL")} htmlFor="ratePerMinute" hint={t("console.rateMinHint")}>
              <Input id="ratePerMinute" name="ratePerMinute" inputMode="decimal" defaultValue="0" />
            </Field>
            <Field label={t("console.stopFeeL")} htmlFor="perStopFee">
              <Input id="perStopFee" name="perStopFee" inputMode="decimal" defaultValue="0" />
            </Field>
            <Field label={t("console.overnightL")} htmlFor="overnightFee" hint={t("console.overnightHint")}>
              <Input id="overnightFee" name="overnightFee" inputMode="decimal" defaultValue="0" />
            </Field>
            <Field label={t("console.minFareL")} htmlFor="minimumFare">
              <Input id="minimumFare" name="minimumFare" inputMode="decimal" defaultValue="0" />
            </Field>
            <Field label={t("console.seasonL")} htmlFor="seasonFactorPct" hint={t("console.seasonHint")}>
              <Input id="seasonFactorPct" name="seasonFactorPct" type="number" min={80} max={200} defaultValue={100} />
            </Field>
          </div>
        </ActionForm>
      </Card>

      <section>
        <h2 className="mb-2 font-semibold text-ink-900">{t("console.bandsT")}</h2>
        <Table head={[t("console.colClass"), t("console.colRateKm"), t("console.colMinFare"), t("console.colMaxFare"), t("console.colMaxSeason")]}>
          {bands.map((b) => (
            <tr key={b.class}>
              <td className="px-4 py-2.5">{classLabel(b.class)}</td>
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
          <h2 className="mb-2 font-semibold text-ink-900">{t("console.verHistT")}</h2>
          <Table head={[t("console.colVehicle"), t("console.colVersion"), t("console.colRateKm"), t("console.colMinFare"), t("console.seasonL"), t("console.colFrom"), t("console.colStatus")]}>
            {plans.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2.5">{p.make} {p.model}</td>
                <td className="px-4 py-2.5 tabular-nums">v{p.version}</td>
                <td className="px-4 py-2.5 tabular-nums">{toMajorString(p.rate_per_km_minor)}</td>
                <td className="px-4 py-2.5 tabular-nums">{toMajorString(p.minimum_fare_minor)}</td>
                <td className="px-4 py-2.5 tabular-nums">{(p.season_factor_bps / 100).toFixed(0)}%</td>
                <td className="px-4 py-2.5">{new Date(p.effective_from).toLocaleDateString()}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={p.status === "ACTIVE" ? "success" : "neutral"}>
                    {p.status === "ACTIVE" ? t("console.planActive") : t("console.planOld")}
                  </Badge>
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
