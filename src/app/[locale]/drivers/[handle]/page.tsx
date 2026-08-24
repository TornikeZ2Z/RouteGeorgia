import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { sql } from "@db/client";
import { isLocale, getTranslator } from "@/lib/i18n";
import { Badge, Card } from "@/components/ui";
import { VehiclePhoto } from "@/components/vehicle-photo";
import { formatMoney } from "@/lib/money";
import { CANONICAL } from "@/lib/currency";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string; handle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

interface TripQuote {
  id: string;
  grossMinor: bigint;
  points: string[];
  travelAt: Date;
  returnAt: Date | null;
  passengers: number;
  luggage: number;
}

/** The traveller's selection, if they arrived from a search result. */
async function loadTripQuote(quoteId: string | undefined, driverId: string): Promise<TripQuote | null> {
  if (!quoteId || !/^[0-9a-f-]{36}$/i.test(quoteId)) return null;
  const [q] = await sql<{
    id: string; gross_minor: string; travel_at: string; passengers: number;
    luggage: number; itinerary: unknown; expires_at: string; status: string;
  }[]>`
    SELECT q.id, q.gross_minor, q.expires_at, q.status::text AS status,
           s.travel_at, s.passengers, s.luggage, s.itinerary
    FROM quotes q
    JOIN route_searches s ON s.id = q.search_id
    WHERE q.id = ${quoteId}::uuid AND q.driver_id = ${driverId}::uuid`;
  if (!q || q.status === "CONSUMED" || new Date(q.expires_at) <= new Date()) return null;
  const it = q.itinerary as { origin: string; stops?: string[]; destination: string; roundTrip?: boolean; returnAt?: string };
  const slugs = [it.origin, ...(it.stops ?? []), it.destination];
  const named = await sql<{ slug: string; name: string }[]>`
    SELECT slug, name_en AS name FROM locations WHERE slug = ANY(${slugs})`;
  const nameOf = (slug: string) => named.find((n) => n.slug === slug)?.name ?? slug;
  return {
    id: q.id,
    grossMinor: BigInt(q.gross_minor),
    points: slugs.map(nameOf),
    travelAt: new Date(q.travel_at),
    returnAt: it.roundTrip && it.returnAt ? new Date(it.returnAt) : null,
    passengers: q.passengers,
    luggage: q.luggage,
  };
}

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

export default async function DriverProfile({ params, searchParams }: Props) {
  const { locale, handle } = await params;
  if (!isLocale(locale)) notFound();
  const t = getTranslator(locale);

  const data = await loadDriver(handle);
  if (!data) notFound();
  const { driver, languages, vehicles, media, reviews } = data;

  const sp = (await searchParams) ?? {};
  const quoteParam = Array.isArray(sp.quote) ? sp.quote[0] : sp.quote;
  const trip = await loadTripQuote(quoteParam, driver.id);
  const fmtWhen = (d: Date) =>
    d.toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tbilisi" });

  return (
    <div className="space-y-6">
      {/* The booking decision travels with the reader. */}
      {trip ? (
        <div className="sticky top-[4.2rem] z-20 rounded-2xl border border-ink-200 bg-white/95 p-4 shadow-[var(--shadow-soft)] backdrop-blur-md dark:border-white/10 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold-600">{t("driver.yourTrip")}</p>
              <p className="truncate font-semibold text-ink-900">
                {trip.points.join(" → ")}{trip.returnAt ? " ⇄" : ""}
              </p>
              <p className="text-sm text-ink-500">
                {fmtWhen(trip.travelAt)}
                {trip.returnAt ? ` · ⇄ ${fmtWhen(trip.returnAt)}` : ""}
                {" · "}{trip.passengers} pax · {trip.luggage} 🧳
              </p>
            </div>
            <div className="ml-auto flex items-center gap-4">
              <p className="font-display text-2xl text-ink-900">
                {formatMoney(trip.grossMinor, CANONICAL, locale)}
              </p>
              <a
                href={`/${locale}/checkout?quote=${trip.id}`}
                className="inline-flex min-h-11 items-center rounded-lg bg-gold-400 px-6 py-2.5 font-bold tracking-[-0.01em] text-pine-900 shadow-sm transition-colors hover:bg-gold-300"
              >
                {t("driver.bookNow")}
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className="sticky top-[4.2rem] z-20 rounded-2xl border border-ink-200 bg-white/95 p-4 shadow-[var(--shadow-soft)] backdrop-blur-md dark:border-white/10 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="text-sm text-ink-600">
              {t("driver.searchToBook", { name: driver.public_name })}
            </p>
            <a
              href={`/${locale}#book`}
              className="ml-auto inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              {t("driver.findDates")}
            </a>
          </div>
        </div>
      )}
      <div className="rounded-2xl border border-ink-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-pine-600 text-lg font-semibold text-white">
            {driver.public_name.charAt(0)}
          </span>
          <div>
            <h1 className="font-display text-3xl text-ink-900">{driver.public_name}</h1>
            <span className="mt-1 inline-block"><Badge tone="success">{t("card.verified")}</Badge></span>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-600">
          {driver.base_location ? `Based in ${driver.base_location}` : "Georgia"}
          {" · "}
          {driver.rating_count > 0
            ? `${(driver.rating_sum / driver.rating_count).toFixed(1)} ★ (${driver.rating_count})`
            : t("card.noReviews")}
          {" · "}
          {t("card.trips", { count: driver.completed_trips })}
        </p>
      </div>

      {driver.bio && <Card className="p-4 text-sm leading-relaxed text-ink-700">{driver.bio}</Card>}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink-900">{t("card.languages")}</h2>
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
        <h2 className="mb-3 text-lg font-semibold text-ink-900">{t("card.vehicle")}</h2>
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
                  {v.class.replaceAll("_", " ").toLowerCase()} · {t("card.seats", { count: v.seats })} ·{" "}
                  {t("card.luggage", { count: v.luggage })}
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
