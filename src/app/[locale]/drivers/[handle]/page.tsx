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

  // Only moderator-approved text is shown, and the redacted version if one exists.
  const reviews = await sql<ReviewRow[]>`
    SELECT id, rating_overall, rating_safety, rating_punctuality, rating_cleanliness,
           rating_communication, author_name,
           coalesce(published_body, '') AS body, driver_response, created_at
    FROM reviews
    WHERE driver_id = ${driver.id}::uuid AND status = 'PUBLISHED'
    ORDER BY created_at DESC LIMIT 20`;

  return { driver, languages, vehicles, media, reviews };
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
  const { driver, languages, vehicles, media, reviews } = data;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-ink-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-forest-600 text-lg font-semibold text-white">
            {driver.public_name.charAt(0)}
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{driver.public_name}</h1>
            <span className="mt-1 inline-block"><Badge tone="success">{t("driver.verified")}</Badge></span>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-600">
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
        <h2 className="mb-3 text-lg font-semibold text-ink-900">{t("driver.languages")}</h2>
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
        <h2 className="mb-3 text-lg font-semibold text-ink-900">{t("driver.vehicle")}</h2>
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

      <section>
        <h2 className="mb-2 text-lg font-semibold text-ink-900">
          Reviews {driver.rating_count > 0 && (
            <span className="font-normal text-ink-500">
              — {(driver.rating_sum / driver.rating_count).toFixed(1)} out of 5 from {driver.rating_count}
            </span>
          )}
        </h2>

        {reviews.length === 0 ? (
          <p className="text-sm text-ink-500">
            No published reviews yet. Only travellers who completed a booking can leave one.
          </p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li key={r.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink-900" aria-label={`${r.rating_overall} out of 5`}>
                      {"★".repeat(r.rating_overall)}<span className="text-ink-300">{"★".repeat(5 - r.rating_overall)}</span>
                    </span>
                    <span className="text-sm text-ink-600">{r.author_name ?? "A traveller"}</span>
                    <span className="text-xs text-ink-400">
                      {new Date(r.created_at).toLocaleDateString(locale, { month: "long", year: "numeric" })}
                    </span>
                  </div>
                  {r.body && <p className="mt-2 text-sm leading-relaxed text-ink-700">{r.body}</p>}
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {([["safety", r.rating_safety], ["punctuality", r.rating_punctuality],
                       ["cleanliness", r.rating_cleanliness], ["communication", r.rating_communication]] as const)
                      .filter(([, v]) => v !== null)
                      .map(([k, v]) => <li key={k}><Badge>{k} {v}/5</Badge></li>)}
                  </ul>
                  {r.driver_response && (
                    <p className="mt-3 border-l-2 border-ink-200 pl-3 text-sm text-ink-600">
                      <span className="font-medium">Reply from {driver.public_name}: </span>{r.driver_response}
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
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
interface ReviewRow {
  id: string; rating_overall: number; rating_safety: number | null; rating_punctuality: number | null;
  rating_cleanliness: number | null; rating_communication: number | null;
  author_name: string | null; body: string; driver_response: string | null; created_at: Date;
}
interface MediaRow {
  id: string; vehicle_id: string; storage_key: string; alt_text: string | null; view_type: string | null;
}
