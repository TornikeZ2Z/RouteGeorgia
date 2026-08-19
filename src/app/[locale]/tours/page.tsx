import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, LOCALES, getTranslator, type Locale } from "@/lib/i18n";
import { listTours, tourPriceFrom } from "@/lib/tours";
import { formatMoney } from "@/lib/money";
import { formatDuration, formatDistance } from "@/lib/format";
import { getDisplayCurrency, getRate, convert, CANONICAL } from "@/lib/currency";
import { config } from "@/lib/config";
import { Badge, EmptyState } from "@/components/ui";
import { PlaceImage } from "@/components/place-image";
import { sitePhoto } from "@/lib/site-photos";

export const revalidate = 3600;

interface Props { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const url = `${config.appUrl}/${locale}/tours`;
  return {
    title: "Day trips and multi-day tours in Georgia",
    description:
      "Curated routes with a private driver — Mtskheta, Kakheti wine country, Kazbegi, " +
      "Vardzia and Svaneti. Fixed price for the whole vehicle.",
    alternates: {
      canonical: url,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}/tours`])),
    },
  };
}

export default async function ToursIndex({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getTranslator(locale as Locale);
  const [tours, currency] = await Promise.all([
    listTours(locale as Locale),
    getDisplayCurrency(),
  ]);
  const rate = await getRate(currency);
  const sp = await searchParams;
  const rawCat = Array.isArray(sp.cat) ? sp.cat[0] : sp.cat;
  const CATS = ["sea", "mountains", "winter", "culture", "wine"] as const;
  const activeCat = CATS.includes(rawCat as (typeof CATS)[number]) ? rawCat : undefined;
  const shown = activeCat ? tours.filter((x) => x.category === activeCat) : tours;
  const prices = await Promise.all(shown.map((t) => tourPriceFrom(t.slug)));
  const CAT_KEY: Record<string, string> = {
    sea: "tours.catSea", mountains: "tours.catMountains", winter: "tours.catWinter",
    culture: "tours.catCulture", wine: "tours.catWine",
  };

  return (
    <div className="space-y-10">
      <header className="max-w-3xl">
        <p className="eyebrow">{t("tours.eyebrow")}</p>
        <h1 className="font-display mt-3 text-4xl text-ink-900 sm:text-5xl">
          {t("tours.title")}
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-600">
          {t("tours.intro")}
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Tour categories">
        {[undefined, ...CATS].map((cat) => (
          <Link
            key={cat ?? "all"}
            href={cat ? `/${locale}/tours?cat=${cat}` : `/${locale}/tours`}
            className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
              activeCat === cat || (!activeCat && !cat)
                ? "border-ink-900 bg-ink-900 text-white"
                : "border-ink-300 text-ink-900 hover:border-ink-500"
            }`}
          >
            {cat ? t(CAT_KEY[cat] as never) : t("tours.catAll")}
          </Link>
        ))}
      </nav>

      {tours.length === 0 ? (
        <EmptyState title={t("tours.empty")} />
      ) : (
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((tour, index) => {
            const price = prices[index];
            return (
              <li key={tour.slug}>
                <Link
                  href={`/${locale}/tours/${tour.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white transition-colors hover:border-ink-500"
                >
                  {/* An abstract route illustration rather than stock photography
                      of a place the traveller has not yet chosen. */}
                  <div className="relative">
                    <PlaceImage
                      imageKey={tour.heroImageKey}
                      photoSrc={sitePhoto(`tours/${tour.slug}.jpg`)}
                      alt={tour.heroImageAlt ?? tour.title}
                      seedText={tour.slug}
                      className="h-44 w-full"
                    />
                    <div className="absolute left-4 top-4 flex gap-2">
                      <Badge tone="neutral">
                        {tour.durationDays === 1 ? t("tours.dayTrip") : t("tours.days", { count: tour.durationDays })}
                      </Badge>
                      {tour.requires4x4 && <Badge tone="warning">4x4</Badge>}
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="font-display text-xl text-ink-900 group-hover:text-ink-900">{tour.title}</h2>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-600">{tour.summary}</p>

                    <div className="mt-4 flex items-end justify-between border-t border-ink-100 pt-3">
                      <p className="text-xs text-ink-500">
                        {t("tours.fromPlace", { place: tour.originName })}
                        <span className="mt-0.5 block">
                          {formatDistance(tour.distanceKm)} · {formatDuration(tour.driveMinutes)} {t("tours.driving")}
                        </span>
                      </p>
                      {price && (
                        <p className="text-right">
                          <span className="block text-xs text-ink-500">{t("tours.from")}</span>
                          <span className="font-display text-2xl text-ink-900">
                            {formatMoney(price.fromMinor, CANONICAL, locale)}
                          </span>
                          {rate.currency !== CANONICAL && (
                            <span className="block text-xs text-ink-500">
                              ≈ {formatMoney(convert(price.fromMinor, rate), rate.currency, locale)}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
