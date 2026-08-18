import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { sql } from "@db/client";
import { isLocale, getTranslator } from "@/lib/i18n";
import { Badge, Card } from "@/components/ui";
import { VehiclePhoto } from "@/components/vehicle-photo";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ locale: string; handle: string }> }

/** Only published data is ever selected here. */
async function loadDriver(handle: string) {
  const [driver] = await sql<DriverRow[]>`
    SELECT d.id, d.handle, d.public_name, d.bio, d.rating_sum, d.rating_count,
           d.completed_trips, d.approved_at, l.name_en AS base_location
    FROM driver_profiles d
    LEFT JOIN locations l ON l.id = d.base_location_id
    WHERE d.handle = ${handle} AND d.published AND d.status = 'APPROVED'`;
  if (!driver) return null;

  const [languages, vehicles] = await Promise.all([
    sql<{ language: string; declared_level: string; verified_level: string | null }[]>`
      SELECT language, declared_level::text, verified_level::text FROM driver_languages
      WHERE driver_id = ${driver.id}::uuid ORDER BY language`,
    sql<VehicleRow[]>`
      SELECT id, make, model, year, color, class::text AS class, seats, luggage, amenities, capabilities
      FROM vehicles WHERE driver_id = ${driver.id}::uuid AND published AND status = 'APPROVED'`,
  ]);

  // Only moderator-approved photos are ever public.
  const media = vehicles.length === 0 ? [] : await sql<MediaRow[]>`
    SELECT id, vehicle_id, storage_key, alt_text, view_type FROM vehicle_media
    WHERE vehicle_id = ANY(${vehicles.map((v) => v.id)}::uuid[])
      AND moderation_state = 'APPROVED'
    ORDER BY position`;

  return { driver, languages, vehicles, media };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const data = await loadDriver(handle);
  if (!data) return { title: "Driver not found" };
  return {
    title: `${data.driver.public_name} — verified driver`,
    description: `Book ${data.driver.public_name}, a verified private driver in Georgia.`,
  };
}

export default async function DriverProfile({ params }: Props) {
  const { locale, handle } = await params;
  if (!isLocale(locale)) notFound();
  const t = getTranslator(locale);

  const data = await loadDriver(handle);
  if (!data) notFound();
  const { driver, languages, vehicles, media } = data;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{driver.public_name}</h1>
          <Badge tone="success">{t("driver.verified")}</Badge>
        </div>
        <p className="mt-1 text-sm text-ink-500">
          {driver.base_location ? `Based in ${driver.base_location}` : "Georgia"}
          {" · "}
          {driver.rating_count > 0
            ? `${(driver.rating_sum / driver.rating_count).toFixed(1)} ★ (${driver.rating_count})`
            : t("driver.noReviews")}
          {" · "}
          {t("driver.trips", { count: driver.completed_trips })}
        </p>
      </div>

      {driver.bio && <Card className="p-4 text-sm leading-relaxed text-ink-700">{driver.bio}</Card>}

      <section>
        <h2 className="mb-2 text-lg font-semibold text-ink-900">{t("driver.languages")}</h2>
        {languages.length === 0 ? (
          <p className="text-sm text-ink-500">Not stated.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {languages.map((l) => (
              <li key={l.language}>
                {/* Verified proficiency is shown distinctly from a self-claim:
                    the benchmark's most common complaint was language mismatch. */}
                <Badge tone={l.verified_level ? "success" : "neutral"}>
                  {l.language} · {(l.verified_level ?? l.declared_level).toLowerCase()}
                  {l.verified_level ? " (verified)" : " (self-declared)"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-ink-900">{t("driver.vehicle")}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {vehicles.map((v) => {
            const shots = media.filter((m) => m.vehicle_id === v.id);
            return (
            <li key={v.id}>
              <Card className="p-4">
                {shots.length > 0 ? (
                  <ul className="mb-3 flex gap-2 overflow-x-auto pb-1">
                    {shots.map((m) => (
                      <li key={m.id} className="shrink-0">
                        <VehiclePhoto
                          photoKey={m.storage_key} colour={v.color}
                          alt={m.alt_text ?? `${v.make} ${v.model} — ${m.view_type ?? "photo"}`}
                          className="h-32 w-48"
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mb-3">
                    <VehiclePhoto
                      photoKey={null} colour={v.color}
                      alt={`${v.make} ${v.model}`} className="h-32 w-full"
                    />
                  </div>
                )}
                <p className="font-medium text-ink-900">{v.make} {v.model} · {v.year}</p>
                <p className="mt-1 text-sm text-ink-600">
                  {v.class.replaceAll("_", " ").toLowerCase()} · {t("driver.seats", { count: v.seats })} ·{" "}
                  {t("driver.luggage", { count: v.luggage })}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries({ ...(v.amenities as object), ...(v.capabilities as object) })
                    .filter(([, on]) => on === true)
                    .map(([key]) => (
                      <li key={key}><Badge>{key.replaceAll("_", " ")}</Badge></li>
                    ))}
                </ul>
              </Card>
            </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

interface DriverRow {
  id: string; handle: string; public_name: string; bio: string | null;
  rating_sum: number; rating_count: number; completed_trips: number;
  approved_at: Date | null; base_location: string | null;
}
interface VehicleRow {
  id: string; make: string; model: string; year: number; color: string | null;
  class: string; seats: number; luggage: number; amenities: unknown; capabilities: unknown;
}
interface MediaRow {
  id: string; vehicle_id: string; storage_key: string; alt_text: string | null; view_type: string | null;
}
