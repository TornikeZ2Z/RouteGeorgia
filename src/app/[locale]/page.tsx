import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { sql } from "@db/client";
import { isLocale, getTranslator, LOCALES } from "@/lib/i18n";
import { listRoutes } from "@/lib/routes-content";
import { config } from "@/lib/config";
import { Badge, Card } from "@/components/ui";
import { listTours } from "@/lib/tours";
import { formatApproxDuration, formatDistance } from "@/lib/format";
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
    <div className="space-y-20">
      {/* Full-bleed: the hero should meet the edges of the window, not sit inside
          the page gutter like another card. */}
      <section className="contours relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-forest-800 px-6 pb-32 pt-16 text-forest-50 sm:px-10 sm:pb-36 sm:pt-24">
        <div className="relative mx-auto max-w-6xl px-0 sm:px-4">
          <p className="eyebrow text-gold-400">Georgia · private drivers</p>

          <h1 className="font-display mt-5 max-w-4xl text-[2.75rem] leading-[1.05] sm:text-6xl lg:text-7xl">
            {t("home.heroTitle")}
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-forest-100">
            {t("home.heroSubtitle")}
          </p>

          <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-5">
            {[
              [stats[0]?.drivers ?? 0, "verified drivers"],
              [stats[0]?.routes ?? 0, "priced routes"],
              [tours.length, "curated tours"],
            ].map(([value, label]) => (
              <div key={label as string}>
                <dt className="font-display text-3xl text-gold-300">{value as number}</dt>
                <dd className="mt-0.5 text-sm text-forest-200">{label as string}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="relative z-10 -mt-24 sm:-mt-28">
        <Card className="mx-auto max-w-5xl p-6 shadow-[0_18px_50px_-24px_rgba(32,38,37,.45)] sm:p-8">
          <p className="eyebrow text-wine-600">Plan your trip</p>
          <h2 className="font-display mt-2 mb-6 text-2xl text-ink-900">Where are you going?</h2>
          <SearchForm locale={locale} locations={locations} />
        </Card>
      </div>

      <section>
        <p className="eyebrow text-wine-600">Why book ahead</p>
        <h2 className="font-display mt-2 text-3xl text-ink-900 sm:text-4xl">
          Everything agreed before you land
        </h2>
        <div className="rule-fade mt-5" />
        <ul className="mt-8 grid gap-px overflow-hidden rounded-xl border border-ink-200 bg-ink-200 sm:grid-cols-2">
          {PROMISES.map(([title, body], i) => (
            <li key={title} className="bg-white p-6">
              <span aria-hidden className="grid size-10 place-items-center rounded-full bg-wine-50 text-wine-700">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" strokeWidth="1.7"
                     stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  {/* price tag */}
                  {i === 0 && <><path d="M3 12.5V4.5A1.5 1.5 0 014.5 3h8l8.5 8.5a1.5 1.5 0 010 2.1l-6.4 6.4a1.5 1.5 0 01-2.1 0L3 12.5z" /><circle cx="7.5" cy="7.5" r="1.4" /></>}
                  {/* driver */}
                  {i === 1 && <><circle cx="12" cy="8" r="3.4" /><path d="M4.5 20a7.5 7.5 0 0115 0" /></>}
                  {/* route with stops */}
                  {i === 2 && <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="18" r="2" /><path d="M7 6h6a3 3 0 010 6H11a3 3 0 000 6h6" /></>}
                  {/* verified shield */}
                  {i === 3 && <><path d="M12 3l7.5 3v6c0 4.8-3.2 8.1-7.5 9-4.3-.9-7.5-4.2-7.5-9V6L12 3z" /><path d="M9 12l2.2 2.2L15.5 10" /></>}
                </svg>
              </span>
              <p className="font-display mt-4 text-xl text-ink-900">{title}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {tours.length > 0 && (
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow text-wine-600">Tours</p>
              <h2 className="font-display mt-2 text-3xl text-ink-900 sm:text-4xl">Routes worth taking</h2>
            </div>
            <Link href={`/${locale}/tours`} className="text-sm font-medium text-wine-700 underline underline-offset-4">
              See all tours
            </Link>
          </div>
          <div className="rule-fade mt-5" />
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tours.slice(0, 3).map((tour) => (
              <li key={tour.slug}>
                <Link
                  href={`/${locale}/tours/${tour.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white hover:border-wine-300"
                >
                  <div className="contours relative h-36 bg-forest-700 text-forest-200">
                    <span className="absolute left-4 top-4">
                      <Badge tone="neutral">
                        {tour.durationDays === 1 ? "Day trip" : `${tour.durationDays} days`}
                      </Badge>
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <p className="font-display text-xl text-ink-900 group-hover:text-wine-700">{tour.title}</p>
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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow text-wine-600">Transfers</p>
              <h2 className="font-display mt-2 text-3xl text-ink-900 sm:text-4xl">Popular routes</h2>
            </div>
            <Link href={`/${locale}/transfers`} className="text-sm font-medium text-wine-700 underline underline-offset-4">
              See all routes
            </Link>
          </div>
          <div className="rule-fade mt-5" />
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
                    {formatDistance(r.distanceKm)} · {formatApproxDuration(r.driveMinutes)} driving
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <p className="eyebrow text-wine-600">How it works</p>
        <h2 className="font-display mt-2 text-3xl text-ink-900 sm:text-4xl">Four steps, no haggling</h2>
        <div className="rule-fade mt-5" />
        <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="border-t-2 border-wine-600 pt-4">
              <span className="font-display text-4xl text-ink-300">{String(i + 1).padStart(2, "0")}</span>
              <p className="mt-2 font-semibold text-ink-900">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="contours overflow-hidden rounded-2xl bg-ink-900 px-6 py-12 text-ink-50 sm:px-12">
        <div className="max-w-2xl">
          <p className="eyebrow text-gold-400">For drivers</p>
          <h2 className="font-display mt-3 text-3xl sm:text-4xl">Drive with us</h2>
          <p className="mt-4 leading-relaxed text-ink-200">
            Set your own rates within published limits, control your own calendar, and keep 85% of
            every completed trip. We find the passenger, handle the paperwork, and answer the phone
            when plans change.
          </p>
          <Link
            href="/driver"
            className="mt-7 inline-flex min-h-12 items-center rounded-lg bg-gold-400 px-6 py-3 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-300"
          >
            {t("nav.becomeDriver")}
          </Link>
        </div>
      </section>
    </div>
  );
}
