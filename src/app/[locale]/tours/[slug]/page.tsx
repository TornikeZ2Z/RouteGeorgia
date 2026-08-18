import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { sql } from "@db/client";
import { isLocale, LOCALES, getTranslator, type Locale } from "@/lib/i18n";
import { getTour, listTours, tourPriceFrom } from "@/lib/tours";
import { formatMoney } from "@/lib/money";
import { formatDuration, formatDistance } from "@/lib/format";
import { getDisplayCurrency, getRate, convert, CANONICAL } from "@/lib/currency";
import { config } from "@/lib/config";
import { Alert, Badge, Card } from "@/components/ui";
import { PlaceImage } from "@/components/place-image";
import { SearchForm } from "@/components/search-form";

export const revalidate = 3600;

interface Props { params: Promise<{ locale: string; slug: string }> }

export async function generateStaticParams() {
  const tours = await listTours("en");
  return LOCALES.flatMap((locale) => tours.map((t) => ({ locale, slug: t.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const tour = await getTour(slug, locale as Locale);
  if (!tour) return { title: "Tour not found" };
  const url = `${config.appUrl}/${locale}/tours/${slug}`;
  return {
    title: tour.title,
    description: tour.summary,
    alternates: {
      canonical: url,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}/tours/${slug}`])),
    },
    openGraph: { title: tour.title, description: tour.summary, url, type: "article" },
  };
}

export default async function TourPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  const tour = await getTour(slug, locale as Locale);
  if (!tour) notFound();
  const t = getTranslator(locale as Locale);

  const [price, locations, others, currency] = await Promise.all([
    tourPriceFrom(slug),
    sql<{ slug: string; name_en: string; type: string }[]>`
      SELECT slug,
             coalesce(CASE WHEN ${locale} = 'ka' THEN name_ka
                           WHEN ${locale} = 'ru' THEN name_ru END, name_en) AS name_en,
             type::text AS type
      FROM locations WHERE in_service_area ORDER BY type, 2`,
    listTours(locale as Locale),
    getDisplayCurrency(),
  ]);
  const rate = await getRate(currency);


  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: tour.title,
    description: tour.summary,
    touristType: "Private transfer with driver",
    provider: { "@type": "Organization", name: "Route Georgia", url: config.appUrl },
    itinerary: {
      "@type": "ItemList",
      itemListElement: tour.stops.map((s, i) => ({
        "@type": "ListItem", position: i + 1, name: s.name,
      })),
    },
    ...(price && {
      offers: {
        "@type": "Offer", priceCurrency: CANONICAL,
        price: (Number(price.fromMinor) / 100).toFixed(2),
      },
    }),
  };

  return (
    <div className="space-y-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="Breadcrumb" className="text-sm text-ink-500">
        <Link href={`/${locale}`} className="hover:text-ink-800">{t("common.home")}</Link>
        <span className="mx-2" aria-hidden>/</span>
        <Link href={`/${locale}/tours`} className="hover:text-ink-800">{t("tours.eyebrow")}</Link>
        <span className="mx-2" aria-hidden>/</span>
        <span className="text-ink-700">{tour.title}</span>
      </nav>

      <PlaceImage
        imageKey={tour.heroImageKey}
        alt={tour.heroImageAlt ?? tour.title}
        seedText={tour.slug}
        className="h-56 w-full sm:h-72"
        rounded="rounded-2xl"
      />

      <header className="max-w-3xl">
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">{tour.durationDays === 1 ? t("tours.dayTrip") : t("tours.days", { count: tour.durationDays })}</Badge>
          {tour.requires4x4 && <Badge tone="warning">{t("tours.fourByFour")}</Badge>}
          <Badge tone="success">{t("tours.private")}</Badge>
        </div>
        <h1 className="font-display mt-4 text-4xl text-ink-900 sm:text-5xl">{tour.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-600">{tour.summary}</p>

        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-ink-200 pt-4 text-sm">
          <div><dt className="text-ink-500">{t("tours.startsFrom")}</dt><dd className="font-medium text-ink-900">{tour.originName}</dd></div>
          <div><dt className="text-ink-500">{t("tours.distance")}</dt><dd className="font-medium text-ink-900">{t("tours.roundTrip", { km: formatDistance(tour.distanceKm) })}</dd></div>
          <div><dt className="text-ink-500">{t("tours.drivingTime")}</dt><dd className="font-medium text-ink-900">{formatDuration(tour.driveMinutes)}</dd></div>
          {price && (
            <div>
              <dt className="text-ink-500">{t("tours.priceFrom")}</dt>
              <dd className="font-medium text-ink-900">
                {formatMoney(price.fromMinor, CANONICAL, locale)}
                {rate.currency !== CANONICAL && (
                  <span className="font-normal text-ink-500"> (≈ {formatMoney(convert(price.fromMinor, rate), rate.currency, locale)})</span>
                )}
              </dd>
            </div>
          )}
        </dl>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <section className="max-w-2xl">
            <h2 className="font-display text-2xl text-ink-900">{t("tours.about")}</h2>
            <div className="mt-3 space-y-4 leading-relaxed text-ink-700">
              {tour.body.split("\n\n").map((paragraph, i) => <p key={i}>{paragraph}</p>)}
            </div>
          </section>

          <section>
            <h2 className="font-display text-2xl text-ink-900">{t("tours.route")}</h2>
            <ol className="mt-4 space-y-0">
              {tour.stops.map((stop, i) => {
                const last = i === tour.stops.length - 1;
                return (
                  <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                    {!last && <span aria-hidden className="absolute left-[11px] top-6 h-full w-px bg-ink-200" />}
                    <span
                      aria-hidden
                      className={`relative z-10 mt-1 size-6 shrink-0 rounded-full border-2 ${
                        i === 0 ? "border-brand-600 bg-brand-600"
                        : last ? "border-pine-600 bg-pine-600"
                        : "border-ink-300 bg-white"}`}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900">
                        {stop.name}
                        {stop.legKm !== null && stop.legKm > 0 && (
                          <span className="ml-2 text-sm font-normal text-ink-500">{stop.legKm} km</span>
                        )}
                        {tour.durationDays > 1 && (
                          <span className="ml-2 text-xs font-normal text-ink-400">{t("tours.day", { n: stop.dayIndex + 1 })}</span>
                        )}
                      </p>
                      {stop.notes && <p className="mt-1 text-sm leading-relaxed text-ink-600">{stop.notes}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <Alert tone="info" title={t("tours.coversTitle")}>
            {t("tours.coversBody", { place: tour.originName })}
            {tour.durationDays > 1 && ` ${t("tours.coversOvernight")}`}
          </Alert>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <Card className="p-5">
            <h2 className="font-semibold text-ink-900">{t("tours.checkTitle")}</h2>
            <p className="mt-1 text-sm text-ink-600">
              {t("tours.checkBody")}
            </p>
            <div className="mt-4">
              <SearchForm
                locale={locale}
                locations={locations}
                layout="compact"
                lockRoute
                tourSlug={tour.slug}
                initial={{ from: tour.originSlug, to: tour.originSlug }}
              />
            </div>
          </Card>
        </aside>
      </div>

      {others.length > 1 && (
        <section>
          <h2 className="font-display mb-4 text-2xl text-ink-900">{t("tours.others")}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {others.filter((t2) => t2.slug !== slug).slice(0, 4).map((t2) => (
              <li key={t2.slug}>
                <Link href={`/${locale}/tours/${t2.slug}`}
                      className="block h-full rounded-xl border border-ink-200 bg-white p-4 hover:border-brand-300">
                  <p className="font-medium text-ink-900">{t2.title}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {t2.durationDays === 1 ? t("tours.dayTrip") : t("tours.days", { count: t2.durationDays })} · {formatDistance(t2.distanceKm)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
