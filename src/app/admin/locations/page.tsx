import { requirePermission } from "@/lib/auth/session";
import { adminT } from "@/lib/i18n/admin";
import { sql } from "@db/client";
import { Card, Field, Input, PageHeader, Select, Table } from "@/components/ui";
import { ActionForm } from "@/components/form-state";
import { saveLocationAction } from "../actions";
import { RouteFamilyForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const staffUser = await requirePermission("admin.locations.write");
  const t = adminT(staffUser.locale);

  const [locs, routes] = await Promise.all([
    sql<LocRow[]>`
      SELECT id, slug, type::text AS type, name_en, name_ka, name_ru, lat, lon, in_service_area
      FROM locations ORDER BY name_en`,
    sql<RouteRow[]>`
      SELECT rf.slug, o.name_en AS origin, d.name_en AS destination, rf.distance_km,
             rf.drive_minutes, rf.return_km, rf.deadhead_recovery_bps, rf.risk_factor_bps,
             rf.requires_4x4, rf.active
      FROM route_families rf
      JOIN locations o ON o.id = rf.origin_id
      JOIN locations d ON d.id = rf.destination_id
      ORDER BY rf.distance_km`,
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("page.locations")} />

      <section>
        <h2 className="mb-1 font-semibold text-ink-900">Route families</h2>
        <p className="mb-2 text-sm text-ink-600">
          The return-leg recovery is the operator's main pricing lever. A city transfer recovers almost
          nothing because the driver finds work nearby; a remote mountain route recovers most of the
          empty return because nobody will hire them for the trip back.
        </p>
        <Table head={["Route", "Distance", "Drive", "Return leg", "Recovery", "Risk", "4x4", "Active"]}>
          {routes.map((r) => (
            <tr key={r.slug}>
              <td className="px-4 py-2.5">{r.origin} → {r.destination}</td>
              <td className="px-4 py-2.5 tabular-nums">{Number(r.distance_km).toFixed(0)} km</td>
              <td className="px-4 py-2.5 tabular-nums">{r.drive_minutes} min</td>
              <td className="px-4 py-2.5 tabular-nums">{Number(r.return_km).toFixed(0)} km</td>
              <td className="px-4 py-2.5 tabular-nums">{(r.deadhead_recovery_bps / 100).toFixed(0)}%</td>
              <td className="px-4 py-2.5 tabular-nums">{(r.risk_factor_bps / 100).toFixed(0)}%</td>
              <td className="px-4 py-2.5">{r.requires_4x4 ? "required" : "—"}</td>
              <td className="px-4 py-2.5">{r.active ? "yes" : "no"}</td>
            </tr>
          ))}
        </Table>
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-ink-900">Locations</h2>
        <Table head={["Name", "Slug", "Type", "Coordinates", "In service area"]}>
          {locs.map((l) => (
            <tr key={l.slug}>
              <td className="px-4 py-2.5">
                {l.name_en}
                {(l.name_ka || l.name_ru) && (
                  <span className="ml-2 text-xs text-ink-500">{[l.name_ka, l.name_ru].filter(Boolean).join(" · ")}</span>
                )}
              </td>
              <td className="px-4 py-2.5 font-mono text-xs">{l.slug}</td>
              <td className="px-4 py-2.5">{l.type.toLowerCase()}</td>
              <td className="px-4 py-2.5 tabular-nums text-xs">{l.lat.toFixed(4)}, {l.lon.toFixed(4)}</td>
              <td className="px-4 py-2.5">{l.in_service_area ? "yes" : "no"}</td>
            </tr>
          ))}
        </Table>
      </section>

      <RouteFamilyForm locations={locs.map((l) => ({ id: l.id, name_en: l.name_en }))} />

      <Card className="p-4 sm:p-6">
        <h2 className="mb-4 font-semibold text-ink-900">Add a location</h2>
        <ActionForm action={saveLocationAction} submitLabel="Add location">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name (English)" htmlFor="nameEn" required><Input id="nameEn" name="nameEn" required /></Field>
            <Field label="Slug" htmlFor="slug" hint="lowercase-with-hyphens" required>
              <Input id="slug" name="slug" pattern="[a-z0-9-]+" required />
            </Field>
            <Field label="Name (Georgian)" htmlFor="nameKa"><Input id="nameKa" name="nameKa" /></Field>
            <Field label="Name (Russian)" htmlFor="nameRu"><Input id="nameRu" name="nameRu" /></Field>
            <Field label="Type" htmlFor="type" required>
              <Select id="type" name="type" required>
                <option value="CITY">City</option>
                <option value="AIRPORT">Airport</option>
                <option value="TOWN">Town</option>
                <option value="ATTRACTION">Attraction</option>
                <option value="RESORT">Resort</option>
                <option value="BORDER">Border crossing</option>
              </Select>
            </Field>
            <div />
            <Field label="Latitude" htmlFor="lat" required>
              <Input id="lat" name="lat" inputMode="decimal" required />
            </Field>
            <Field label="Longitude" htmlFor="lon" required>
              <Input id="lon" name="lon" inputMode="decimal" required />
            </Field>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}

interface LocRow {
  id: string; slug: string; type: string; name_en: string; name_ka: string | null; name_ru: string | null;
  lat: number; lon: number; in_service_area: boolean;
}
interface RouteRow {
  slug: string; origin: string; destination: string; distance_km: string; drive_minutes: number;
  return_km: string; deadhead_recovery_bps: number; risk_factor_bps: number;
  requires_4x4: boolean; active: boolean;
}
