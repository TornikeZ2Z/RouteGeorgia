import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { sql } from "@db/client";
import { isLocale, getTranslator, LOCALES } from "@/lib/i18n";
import { listRoutes } from "@/lib/routes-content";
import { config } from "@/lib/config";
import { Card } from "@/components/ui";
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

  const [locations, routes, stats] = await Promise.all([
    sql<{ slug: string; name_en: string; type: string }[]>`
      SELECT slug, name_en, type::text AS type FROM locations
      WHERE in_service_area ORDER BY type, name_en`,
    listRoutes(locale),
    sql<{ drivers: number; routes: number }[]>`
      SELECT (SELECT count(*) FROM driver_profiles WHERE published)::int AS drivers,
             (SELECT count(*) FROM route_families WHERE active)::int AS routes`,
  ]);

  const popular = routes.slice(0, 6);

  return (
    <div className="space-y-14">
      <section>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          {t("home.heroTitle")}
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-ink-600">{t("home.heroSubtitle")}</p>
        <p className="mt-2 text-sm text-ink-500">
          {stats[0]?.drivers ?? 0} verified drivers · {stats[0]?.routes ?? 0} priced routes
        </p>
      </section>

      <Card className="p-4 sm:p-6">
        <SearchForm locale={locale} locations={locations} />
      </Card>

      <section>
        <h2 className="text-xl font-semibold text-ink-900">Why book ahead instead of at the roadside</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {PROMISES.map(([title, body]) => (
            <li key={title} className="rounded-xl border border-ink-200 bg-white p-5">
              <p className="font-medium text-ink-900">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {popular.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold text-ink-900">Popular routes</h2>
            <Link href={`/${locale}/transfers`} className="text-sm text-wine-700 underline">
              See all routes
            </Link>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        <h2 className="text-xl font-semibold text-ink-900">How it works</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="rounded-xl border border-ink-200 bg-white p-5">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-wine-100 text-sm font-semibold text-wine-700">
                {i + 1}
              </span>
              <p className="mt-3 font-medium text-ink-900">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-900">Drive with us</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
          You set your own rates within published limits, control your own calendar, and keep 85% of
          every completed trip. We handle finding the passenger, the paperwork and the support.
        </p>
        <Link
          href="/driver"
          className="mt-4 inline-block rounded-lg bg-wine-600 px-4 py-2 text-sm font-medium text-white hover:bg-wine-700"
        >
          {t("nav.becomeDriver")}
        </Link>
      </section>
    </div>
  );
}
