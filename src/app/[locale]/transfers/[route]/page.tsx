import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, LOCALES, getTranslator, type Locale } from "@/lib/i18n";
import { getRoute, relatedRoutes, listRoutes } from "@/lib/routes-content";
import { routePriceFrom } from "@/lib/offers";
import { formatMoney } from "@/lib/money";
import { getDisplayCurrency, getRate, convert, CANONICAL } from "@/lib/currency";
import { config } from "@/lib/config";
import { Alert, Badge, Card } from "@/components/ui";
import { formatDuration, formatDistance } from "@/lib/format";
import { PlaceImage } from "@/components/place-image";
import { SearchForm } from "@/components/search-form";
import { sql } from "@db/client";

/** Rebuilt hourly: prices move when drivers change plans, but not by the minute. */
export const revalidate = 3600;

interface Props { params: Promise<{ locale: string; route: string }> }

export async function generateStaticParams() {
  const routes = await listRoutes("en");
  return LOCALES.flatMap((locale) => routes.map((r) => ({ locale, route: r.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, route } = await params;
  if (!isLocale(locale)) return {};
  const data = await getRoute(route, locale);
  if (!data) return { title: "Route not found" };

  const url = `${config.appUrl}/${locale}/transfers/${route}`;
  const title = `${data.originName} to ${data.destinationName} transfer — private driver`;
  const description =
    `Book a private driver from ${data.originName} to ${data.destinationName}. ` +
    `About ${Math.round(data.distanceKm)} km, ${formatDuration(data.driveMinutes)} driving. ` +
    `Fixed price for the whole vehicle, agreed before you travel.`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: Object.fromEntries(
        LOCALES.map((l) => [l, `${config.appUrl}/${l}/transfers/${route}`]),
      ),
    },
    openGraph: { title, description, url, type: "website" },
  };
}

export default async function RoutePage({ params }: Props) {
  const { locale, route } = await params;
  if (!isLocale(locale)) notFound();

  const data = await getRoute(route, locale);
  if (!data) notFound();
  const t = getTranslator(locale);

  const [pricing, related, locations, currency] = await Promise.all([
    routePriceFrom(route),
    relatedRoutes(route, locale),
    sql<{ slug: string; name_en: string; type: string }[]>`
      SELECT slug, name_en, type::text AS type FROM locations
      WHERE in_service_area ORDER BY type, name_en`,
    getDisplayCurrency(),
  ]);
  const rate = await getRate(currency);

  const fromPrice = pricing ? formatMoney(pricing.fromMinor, CANONICAL, locale) : null;
  const fromPriceAlt =
    pricing && rate.currency !== CANONICAL
      ? formatMoney(convert(pricing.fromMinor, rate), rate.currency, locale)
      : null;

  // Structured data. Only facts we actually hold: no invented review counts.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: "Private transfer",
    provider: { "@type": "Organization", name: "Route Georgia", url: config.appUrl },
    areaServed: { "@type": "Country", name: "Georgia" },
    name: `${data.originName} to ${data.destinationName} private transfer`,
    ...(pricing && {
      offers: {
        "@type": "Offer",
        priceCurrency: CANONICAL,
        price: (Number(pricing.fromMinor) / 100).toFixed(2),
        availability: "https://schema.org/InStock",
      },
    }),
  };

  return (
    <div className="space-y-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="Breadcrumb" className="text-sm text-ink-500">
        <Link href={`/${locale}`} className="hover:text-ink-800">{t("common.home")}</Link>
        <span className="mx-2" aria-hidden>/</span>
        <Link href={`/${locale}/transfers`} className="hover:text-ink-800">{t("transfers.eyebrow")}</Link>
        <span className="mx-2" aria-hidden>/</span>
        <span className="text-ink-700">{data.originName} → {data.destinationName}</span>
      </nav>

      <PlaceImage
        imageKey={data.imageKey}
        alt={data.imageAlt ?? `${data.originName} to ${data.destinationName}`}
        seedText={data.slug}
        className="h-52 w-full sm:h-64"
        rounded="rounded-2xl"
      />

      <header>
        <h1 className="font-display text-4xl text-ink-900 sm:text-5xl">
          {t("transfers.routeTitle", { from: data.originName, to: data.destinationName })}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-600">
          <span>{formatDistance(data.distanceKm)}</span>
          <span>{formatDuration(data.driveMinutes)} {t("tours.driving")}</span>
          {fromPrice && (
            <span className="font-medium text-ink-900">
              {t("transfers.fromPrice", { price: fromPrice })}
              {fromPriceAlt && <span className="font-normal text-ink-500"> (≈ {fromPriceAlt})</span>}
            </span>
          )}
          {pricing && <span>{t("transfers.vehicles", { count: pricing.driverCount })}</span>}
          {data.requires4x4 && <Badge tone="warning">{t("tours.fourByFour")}</Badge>}
        </div>
        <p className="mt-3 max-w-2xl text-ink-600">
          {t("transfers.routeIntro")}
        </p>
      </header>

      {data.seasonalNote && (
        <Alert tone="warning" title={t("transfers.seasonal")}>{data.seasonalNote}</Alert>
      )}

      <Card className="p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-ink-900">{t("transfers.checkTitle")}</h2>
        <SearchForm
          locale={locale}
          locations={locations}
          initial={{ from: data.originSlug, to: data.destinationSlug }}
        />
      </Card>

      <section>
        <h2 className="font-display mb-4 text-2xl text-ink-900">{t("transfers.included")}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {([1, 2, 3, 4, 5, 6] as const).map((n) => (
            <li key={n} className="rounded-lg border border-ink-200 bg-white p-4">
              <p className="font-medium text-ink-900">{t(`transfers.inc${n}t` as const)}</p>
              <p className="mt-1 text-sm text-ink-600">{t(`transfers.inc${n}b` as const)}</p>
            </li>
          ))}
        </ul>
      </section>

      {related.length > 0 && (
        <section>
          <h2 className="font-display mb-4 text-2xl text-ink-900">{t("transfers.related")}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/${locale}/transfers/${r.slug}`}
                  className="block rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm hover:border-wine-300"
                >
                  <span className="font-medium text-ink-800">{r.originName}</span>
                  <span className="mx-2 text-ink-400" aria-hidden>→</span>
                  <span className="font-medium text-ink-800">{r.destinationName}</span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    {formatDistance(r.distanceKm)} · {formatDuration(r.driveMinutes)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

