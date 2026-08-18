import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, LOCALES, type Locale } from "@/lib/i18n";
import { listTours, tourPriceFrom } from "@/lib/tours";
import { formatMoney } from "@/lib/money";
import { getDisplayCurrency, getRate, convert, CANONICAL } from "@/lib/currency";
import { config } from "@/lib/config";
import { Badge, EmptyState } from "@/components/ui";

export const revalidate = 3600;

interface Props { params: Promise<{ locale: string }> }

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

export default async function ToursIndex({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const [tours, currency] = await Promise.all([
    listTours(locale as Locale),
    getDisplayCurrency(),
  ]);
  const rate = await getRate(currency);
  const prices = await Promise.all(tours.map((t) => tourPriceFrom(t.slug)));

  return (
    <div className="space-y-10">
      <header className="max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-wide text-wine-600">Tours</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          Routes worth taking, with someone who knows them
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-600">
          Each of these is a full itinerary with a private driver and vehicle. The price covers the
          car for the whole trip, including the drive home — not a seat, and not per person.
        </p>
      </header>

      {tours.length === 0 ? (
        <EmptyState title="No tours published yet" />
      ) : (
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tours.map((tour, index) => {
            const price = prices[index];
            return (
              <li key={tour.slug}>
                <Link
                  href={`/${locale}/tours/${tour.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white transition-colors hover:border-wine-300"
                >
                  {/* An abstract route illustration rather than stock photography
                      of a place the traveller has not yet chosen. */}
                  <div className="relative h-36 bg-gradient-to-br from-forest-600 via-forest-500 to-forest-700">
                    <svg className="absolute inset-0 size-full opacity-30" viewBox="0 0 400 144" aria-hidden preserveAspectRatio="none">
                      <path d="M0 110 L60 82 L120 96 L190 48 L250 70 L320 30 L400 56 L400 144 L0 144 Z" fill="rgba(255,255,255,.22)" />
                      <path d="M0 128 L70 104 L140 118 L210 80 L280 98 L350 66 L400 88 L400 144 L0 144 Z" fill="rgba(255,255,255,.16)" />
                    </svg>
                    <div className="absolute left-4 top-4 flex gap-2">
                      <Badge tone="neutral">
                        {tour.durationDays === 1 ? "Day trip" : `${tour.durationDays} days`}
                      </Badge>
                      {tour.requires4x4 && <Badge tone="warning">4x4</Badge>}
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="font-semibold text-ink-900 group-hover:text-wine-700">{tour.title}</h2>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-600">{tour.summary}</p>

                    <div className="mt-4 flex items-end justify-between border-t border-ink-100 pt-3">
                      <p className="text-xs text-ink-500">
                        From {tour.originName}
                        <span className="mt-0.5 block">
                          {Math.round(tour.distanceKm)} km · {Math.round(tour.driveMinutes / 60)} h driving
                        </span>
                      </p>
                      {price && (
                        <p className="text-right">
                          <span className="block text-xs text-ink-500">from</span>
                          <span className="text-lg font-semibold text-ink-900">
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
