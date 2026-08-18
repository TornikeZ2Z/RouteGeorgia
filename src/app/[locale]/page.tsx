import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { sql } from "@db/client";
import { isLocale, getTranslator, LOCALES } from "@/lib/i18n";
import { listRoutes } from "@/lib/routes-content";
import { config } from "@/lib/config";
import { Badge, Card } from "@/components/ui";
import { listTours } from "@/lib/tours";
import { SearchForm } from "@/components/search-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const url = `${config.appUrl}/${locale}`;
  return {
    title: "Private drivers across Georgia, booked in advance",
    description:
      "Book a verified private driver and vehicle in Georgia. Fixed price for the whole car, " +
      "agreed before you travel. Add stops at no extra charge.",
    alternates: {
      canonical: url,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}`])),
    },
  };
}

/** Claims here must be things the product actually does. */
const PROMISES = [
  ["Fixed price, agreed up front", "You see the final price for the whole vehicle before you book. It does not move afterwards unless you change the trip."],
  ["A named driver and car", "You choose a specific driver and see their car, languages and reviews — not an anonymous vehicle class."],
  ["Stops are included", "Add stops when you book. Waiting at them is not charged extra."],
  ["Checked documents", "Licence, insurance and vehicle papers are reviewed by us and must be valid on your travel date."],
] as const;

const STEPS = [
  ["Plan the route", "Pick where you are going and when. Add any stops you want along the way."],
  ["Compare real drivers", "Filter by language, vehicle, 4x4 or child seat, and see the price each driver charges for your exact trip."],
  ["See how the price is built", "Every quote itemises distance, the return leg, route conditions and any minimum fare. Nothing is hidden."],
  ["Book and travel", "Your driver confirms, you get their details, and the price you agreed is the price you pay."],
] as const;

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getTranslator(locale);

  const [locations, routes, stats, tours] = await Promise.all([
    sql<{ slug: string; name_en: string; type: string }[]>`
      SELECT slug, name_en, type::text AS type FROM locations
      WHERE in_service_area ORDER BY type, name_en`,
    listRoutes(locale),
    sql<{ drivers: number; routes: number }[]>`
      SELECT (SELECT count(*) FROM driver_profiles WHERE published)::int AS drivers,
             (SELECT count(*) FROM route_families WHERE active)::int AS routes`,
    listTours(locale),
  ]);

  const popular = routes.slice(0, 6);

  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden rounded-3xl border border-forest-700 bg-forest-600 px-6 py-12 text-white sm:px-10 sm:py-16">
        {/* Caucasus ridgeline. Drawn rather than photographed: an illustration
            promises nothing about a specific place the traveller has not chosen. */}
        <svg
          className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full opacity-25"
          viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden
        >
          <path d="M0 150 L150 90 L280 130 L420 50 L560 110 L700 40 L860 100 L1000 60 L1200 120 L1200 200 L0 200 Z" fill="rgba(255,255,255,.35)" />
          <path d="M0 175 L180 125 L320 160 L470 95 L620 145 L780 85 L920 135 L1080 100 L1200 150 L1200 200 L0 200 Z" fill="rgba(255,255,255,.25)" />
        </svg>

        <div className="relative max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-forest-100">
            Georgia · private drivers
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            {t("home.heroTitle")}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-forest-100">
            {t("home.heroSubtitle")}
          </p>
          <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-forest-200">
            <span>{stats[0]?.drivers ?? 0} verified drivers</span>
            <span>{stats[0]?.routes ?? 0} priced routes</span>
            <span>Free cancellation</span>
          </p>
        </div>
      </section>

      <Card className="-mt-24 relative z-10 mx-auto max-w-5xl p-5 shadow-lg sm:p-7">
        <h2 className="mb-4 text-lg font-semibold text-ink-900">Where are you going?</h2>
        <SearchForm locale={locale} locations={locations} />
      </Card>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight text-ink-900">
          Why book ahead instead of at the roadside
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {PROMISES.map(([title, body], i) => (
            <li key={title} className="rounded-xl border border-ink-200 bg-white p-5">
              <span aria-hidden className="grid size-9 place-items-center rounded-lg bg-wine-50 text-wine-700">
                <svg viewBox="0 0 20 20" className="size-5" fill="none" strokeWidth="1.8" stroke="currentColor">
                  {i === 0 && <path d="M10 3v14M6.5 6.5h5.2a2.3 2.3 0 010 4.6H8.3a2.3 2.3 0 000 4.6h5.2" strokeLinecap="round" />}
                  {i === 1 && <><circle cx="10" cy="7" r="3" /><path d="M4 17a6 6 0 0112 0" strokeLinecap="round" /></>}
                  {i === 2 && <><circle cx="10" cy="9" r="2.5" /><path d="M10 2.5c3.6 0 6 2.4 6 6 0 4-6 9-6 9s-6-5-6-9c0-3.6 2.4-6 6-6z" /></>}
                  {i === 3 && <path d="M10 2.5l6 2.5v5c0 4-2.7 6.7-6 7.5-3.3-.8-6-3.5-6-7.5v-5l6-2.5zM7.5 10l1.8 1.8L13 8" strokeLinecap="round" strokeLinejoin="round" />}
                </svg>
              </span>
              <p className="mt-3 font-semibold text-ink-900">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {tours.length > 0 && (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-ink-900">Tours worth taking</h2>
            <Link href={`/${locale}/tours`} className="text-sm font-medium text-wine-700 underline underline-offset-4">
              See all tours
            </Link>
          </div>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tours.slice(0, 3).map((tour) => (
              <li key={tour.slug}>
                <Link
                  href={`/${locale}/tours/${tour.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white hover:border-wine-300"
                >
                  <div className="relative h-32 bg-gradient-to-br from-forest-600 to-forest-700">
                    <svg className="absolute inset-0 size-full opacity-30" viewBox="0 0 400 128" preserveAspectRatio="none" aria-hidden>
                      <path d="M0 96 L80 66 L150 84 L230 40 L300 62 L400 30 L400 128 L0 128 Z" fill="rgba(255,255,255,.25)" />
                    </svg>
                    <span className="absolute left-3 top-3">
                      <Badge tone="neutral">
                        {tour.durationDays === 1 ? "Day trip" : `${tour.durationDays} days`}
                      </Badge>
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <p className="font-semibold text-ink-900 group-hover:text-wine-700">{tour.title}</p>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-600">{tour.summary}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {popular.length > 0 && (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-ink-900">Popular routes</h2>
            <Link href={`/${locale}/transfers`} className="text-sm font-medium text-wine-700 underline underline-offset-4">
              See all routes
            </Link>
          </div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {popular.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/${locale}/transfers/${r.slug}`}
                  className="block h-full rounded-xl border border-ink-200 bg-white px-4 py-3 hover:border-wine-300"
                >
                  <span className="font-medium text-ink-800">{r.originName}</span>
                  <span className="mx-2 text-ink-400" aria-hidden>→</span>
                  <span className="font-medium text-ink-800">{r.destinationName}</span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    {Math.round(r.distanceKm)} km · about {Math.round(r.driveMinutes / 60)} h driving
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-2xl font-semibold tracking-tight text-ink-900">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="relative rounded-xl border border-ink-200 bg-white p-5">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-wine-600 text-sm font-semibold text-white">
                {i + 1}
              </span>
              <p className="mt-3 font-semibold text-ink-900">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900 px-6 py-10 text-white sm:px-10">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight">Drive with us</h2>
          <p className="mt-3 leading-relaxed text-ink-200">
            Set your own rates within published limits, control your own calendar, and keep 85% of
            every completed trip. We find the passenger, handle the paperwork, and answer the phone
            when plans change.
          </p>
          <Link
            href="/driver"
            className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-ink-900 hover:bg-ink-100"
          >
            {t("nav.becomeDriver")}
          </Link>
        </div>
      </section>
    </div>
  );
}
