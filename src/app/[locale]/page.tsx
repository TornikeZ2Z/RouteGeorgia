import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { sql } from "@db/client";
import { isLocale, getTranslator, LOCALES } from "@/lib/i18n";
import { listRoutes } from "@/lib/routes-content";
import { config } from "@/lib/config";
import { Badge, Card } from "@/components/ui";
import { ContourField } from "@/components/contour-field";
import { PlaceImage } from "@/components/place-image";
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

/** Claims here must be things the product actually does. Text lives in the dictionary. */
const PROMISE_KEYS = [
  ["home.why1t", "home.why1b"], ["home.why2t", "home.why2b"],
  ["home.why3t", "home.why3b"], ["home.why4t", "home.why4b"],
] as const;

const STEP_KEYS = [
  ["home.how1t", "home.how1b"], ["home.how2t", "home.how2b"],
  ["home.how3t", "home.how3b"], ["home.how4t", "home.how4b"],
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
      <section className="relative left-1/2 -mt-10 w-screen -translate-x-1/2 overflow-hidden bg-forest-800 px-4 pb-28 pt-14 text-forest-50 sm:-mt-12 sm:pb-32 sm:pt-20">
        <ContourField className="text-forest-200" opacity={0.18} />
        <div className="relative mx-auto max-w-6xl">
          <p className="eyebrow text-gold-400">{t("home.heroEyebrow")}</p>

          <h1 className="font-display mt-5 max-w-4xl text-[2.75rem] leading-[1.05] sm:text-6xl lg:text-7xl">
            {t("home.heroTitle")}
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-forest-100">
            {t("home.heroSubtitle")}
          </p>

          <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-5">
            {[
              [stats[0]?.drivers ?? 0, t("home.statDrivers")],
              [stats[0]?.routes ?? 0, t("home.statRoutes")],
              [tours.length, t("home.statTours")],
            ].map(([value, label]) => (
              <div key={label as string}>
                <dt className="font-display text-3xl text-gold-300">{value as number}</dt>
                <dd className="mt-0.5 text-sm text-forest-200">{label as string}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="relative z-10 -mt-20 sm:-mt-24">
        <Card className="p-6 shadow-[0_18px_50px_-24px_rgba(32,38,37,.45)] sm:p-8">
          <p className="eyebrow text-wine-600">{t("home.planEyebrow")}</p>
          <h2 className="font-display mt-2 mb-6 text-2xl text-ink-900">{t("home.planTitle")}</h2>
          <SearchForm locale={locale} locations={locations} />
        </Card>
      </div>

      <section>
        <p className="eyebrow text-wine-600">{t("home.whyEyebrow")}</p>
        <h2 className="font-display mt-2 text-3xl text-ink-900 sm:text-4xl">
          {t("home.whyTitle")}
        </h2>
        <div className="rule-fade mt-5" />
        <ul className="mt-8 grid gap-px overflow-hidden rounded-xl border border-ink-200 bg-ink-200 sm:grid-cols-2">
          {PROMISE_KEYS.map(([title, body], i) => (
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
              <p className="font-display mt-4 text-xl text-ink-900">{t(title)}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{t(body)}</p>
            </li>
          ))}
        </ul>
      </section>

      {tours.length > 0 && (
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow text-wine-600">{t("home.toursEyebrow")}</p>
              <h2 className="font-display mt-2 text-3xl text-ink-900 sm:text-4xl">{t("home.toursTitle")}</h2>
            </div>
            <Link href={`/${locale}/tours`} className="text-sm font-medium text-wine-700 underline underline-offset-4">
              {t("home.seeAllTours")}
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
                  <div className="relative">
                    <PlaceImage
                      imageKey={tour.heroImageKey}
                      alt={tour.heroImageAlt ?? tour.title}
                      seedText={tour.slug}
                      className="h-40 w-full"
                    />
                    <span className="absolute left-4 top-4">
                      <Badge tone="neutral">
                        {tour.durationDays === 1 ? t("tours.dayTrip") : t("tours.days", { count: tour.durationDays })}
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
              <p className="eyebrow text-wine-600">{t("home.transfersEyebrow")}</p>
              <h2 className="font-display mt-2 text-3xl text-ink-900 sm:text-4xl">{t("home.transfersTitle")}</h2>
            </div>
            <Link href={`/${locale}/transfers`} className="text-sm font-medium text-wine-700 underline underline-offset-4">
              {t("home.seeAllRoutes")}
            </Link>
          </div>
          <div className="rule-fade mt-5" />
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {popular.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/${locale}/transfers/${r.slug}`}
                  className="block h-full overflow-hidden rounded-xl border border-ink-200 bg-white hover:border-wine-300"
                >
                  <PlaceImage
                    imageKey={r.imageKey}
                    alt={r.imageAlt ?? `${r.originName} to ${r.destinationName}`}
                    seedText={r.slug}
                    className="h-24 w-full"
                  />
                  <span className="block px-4 py-3">
                  <span className="font-medium text-ink-800">{r.originName}</span>
                  <span className="mx-2 text-ink-400" aria-hidden>→</span>
                  <span className="font-medium text-ink-800">{r.destinationName}</span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    {formatDistance(r.distanceKm)} · {formatApproxDuration(r.driveMinutes)} {t("tours.driving")}
                  </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <p className="eyebrow text-wine-600">{t("home.howEyebrow")}</p>
        <h2 className="font-display mt-2 text-3xl text-ink-900 sm:text-4xl">{t("home.howTitle")}</h2>
        <div className="rule-fade mt-5" />
        <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEP_KEYS.map(([title, body], i) => (
            <li key={title} className="border-t-2 border-wine-600 pt-4">
              <span className="font-display text-4xl text-ink-300">{String(i + 1).padStart(2, "0")}</span>
              <p className="mt-2 font-semibold text-ink-900">{t(title)}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{t(body)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative overflow-hidden rounded-2xl bg-ink-900 px-6 py-12 text-ink-50 sm:px-12">
        <ContourField className="text-ink-300" opacity={0.2} seed={3} />
        <div className="relative max-w-2xl">
          <p className="eyebrow text-gold-400">{t("home.driveEyebrow")}</p>
          <h2 className="font-display mt-3 text-3xl sm:text-4xl">{t("home.driveTitle")}</h2>
          <p className="mt-4 leading-relaxed text-ink-200">
            {t("home.driveBody")}
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
