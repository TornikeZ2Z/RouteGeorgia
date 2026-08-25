import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, getTranslator } from "@/lib/i18n";
import { searchOffers, availableFacets, type SortKey } from "@/lib/offers";
import { formatMoney } from "@/lib/money";
import { formatDuration } from "@/lib/format";
import { getDisplayCurrency, getRate, convert, CANONICAL } from "@/lib/currency";
import { Badge, Card, EmptyState } from "@/components/ui";
import { VehiclePhoto } from "@/components/vehicle-photo";
import { OfferFiltersPanel, CLASS_LABEL, type FilterState } from "@/components/offer-filters";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const str = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;
const list = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
const on = (v: string | string[] | undefined): boolean => str(v) === "1";

const AMENITY_LABEL: Record<string, string> = {
  air_conditioning: "A/C", wifi: "Wi-Fi", pets_allowed: "Pets", child_seat: "Child seat",
  smoke_free: "Smoke free", four_wheel_drive: "4x4", winter_tyres: "Winter tyres",
  wheelchair_access: "Step-free",
};

export default async function SearchPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getTranslator(locale);
  const sp = await searchParams;

  // Exact addresses typed at search time ride along to checkout untouched.
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const addressParams = new URLSearchParams();
  if (one(sp.pd).trim()) addressParams.set("pd", one(sp.pd).trim().slice(0, 300));
  if (one(sp.dd).trim()) addressParams.set("dd", one(sp.dd).trim().slice(0, 300));
  const addressThread = addressParams.size > 0 ? `&${addressParams}` : "";

  const from = str(sp.from), to = str(sp.to), when = str(sp.when);
  const stops = list(sp.stop).filter(Boolean);

  if (!from || !to || !when) {
    return <EmptyState title={t("search.startTitle")}>{t("search.startBody")}</EmptyState>;
  }

  const travelAt = new Date(when);
  if (Number.isNaN(travelAt.getTime())) {
    return <EmptyState title={t("search.badDateTitle")}>{t("search.badDateBody")}</EmptyState>;
  }
  const returnRaw = str(sp.return);
  const returnAt = returnRaw ? new Date(returnRaw) : null;
  const roundTrip = returnAt !== null && !Number.isNaN(returnAt.getTime()) && returnAt.getTime() > travelAt.getTime();

  const filterState: FilterState = {
    classes: list(sp.class),
    language: str(sp.language) ?? "",
    verifiedLanguageOnly: on(sp.verifiedLanguage),
    fourWheelDrive: on(sp.fourWheelDrive),
    winterTyres: on(sp.winterTyres),
    petsAllowed: on(sp.petsAllowed),
    childSeat: on(sp.childSeat),
    wifi: on(sp.wifi),
    airConditioning: on(sp.airConditioning),
    wheelchairAccess: on(sp.wheelchairAccess),
    minRating: Number(str(sp.minRating) ?? 0) || 0,
    // Cheapest first by default. Price orders the classes on its own —
    // sedan, minivan, SUV, minibus — so a traveller sees the real range
    // immediately instead of meeting a wall of filters. Anyone who wants a
    // particular class or a different order chooses it in the panel.
    sort: str(sp.sort) ?? "price_asc",
  };

  const passengers = Number(str(sp.passengers) ?? 1) || 1;
  const luggage = Number(str(sp.luggage) ?? 0) || 0;

  const [result, facets, currency] = await Promise.all([
    searchOffers({
      originSlug: from,
      destinationSlug: to,
      stopSlugs: stops,
      tourSlug: str(sp.tour),
      travelAt,
      returnAt: roundTrip ? returnAt : null,
      passengers,
      luggage,
      sort: filterState.sort as SortKey,
      filters: {
        classes: filterState.classes,
        language: filterState.language || undefined,
        verifiedLanguageOnly: filterState.verifiedLanguageOnly,
        fourWheelDrive: filterState.fourWheelDrive,
        winterTyres: filterState.winterTyres,
        petsAllowed: filterState.petsAllowed,
        childSeat: filterState.childSeat,
        wifi: filterState.wifi,
        airConditioning: filterState.airConditioning,
        wheelchairAccess: filterState.wheelchairAccess,
        minRating: filterState.minRating || undefined,
      },
      attribution: {
        utm_source: str(sp.utm_source) ?? "",
        utm_campaign: str(sp.utm_campaign) ?? "",
        qr: str(sp.qr) ?? "",
      },
    }),
    availableFacets(),
    getDisplayCurrency(),
  ]);

  const rate = await getRate(currency);
  const km = (result.route.distanceKm100 / 100).toFixed(0);

  // Preserved across filter submissions so the trip itself never changes.
  const hidden: [string, string][] = [
    ["from", from], ["to", to], ["when", when],
    ...(roundTrip ? [["return", returnRaw!] as [string, string]] : []),
    ...(str(sp.tour) ? [["tour", str(sp.tour)!] as [string, string]] : []),
    ["passengers", String(passengers)], ["luggage", String(luggage)],
    ...stops.map((s) => ["stop", s] as [string, string]),
  ];

  const price = (gel: bigint) => {
    const shown = formatMoney(gel, CANONICAL, locale);
    if (rate.currency === CANONICAL) return { primary: shown, secondary: null };
    return { primary: shown, secondary: formatMoney(convert(gel, rate), rate.currency, locale) };
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-ink-200 bg-white p-5">
        <h1 className="font-display text-2xl text-ink-900 sm:text-3xl">
          {result.route.originName || from}
          <span className="mx-2 text-ink-400" aria-hidden>{roundTrip ? "⇄" : "→"}</span>
          {result.route.destinationName || to}
          {roundTrip && <span className="ml-3 align-middle"><Badge tone="success">{t("search.roundTripBadge")}</Badge></span>}
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          {t("search.outbound")}: {travelAt.toLocaleString(locale, { dateStyle: "full", timeStyle: "short" })}
          {stops.length > 0 && <span className="text-ink-500"> · {t("search.viaStops", { count: stops.length })}</span>}
        </p>
        {roundTrip && (
          <p className="mt-0.5 text-sm text-ink-600">
            {t("search.returnLeg")}: {returnAt!.toLocaleString(locale, { dateStyle: "full", timeStyle: "short" })}
          </p>
        )}
        {result.offers.length > 0 && (
          <>
            <p className="mt-1 text-sm text-ink-600">
              {t("search.driveEstimate", { minutes: formatDuration(result.route.driveMinutes), km })}
            </p>
            <p className="mt-1 text-xs text-ink-500">{t("search.estimateNote")}</p>
          </>
        )}
        <Link href={`/${locale}`} className="mt-2 inline-block text-sm text-ink-900 underline">
          {t("search.changeRoute")}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <OfferFiltersPanel
            locale={locale}
            hidden={hidden} state={filterState} facets={facets}
            resultCount={result.offers.length}
          />
        </aside>

        <div className="space-y-4">
          {result.offers.length === 0 ? (
            <EmptyState title={t("search.empty")}>
              {result.emptyReason === "filtered_out" ? (
                <p>{t("search.emptyFiltered")}</p>
              ) : result.emptyReason === "no_route" ? (
                <p>{t("search.emptyNoRoute")}</p>
              ) : (
                <p>{t("search.emptyHelp")}</p>
              )}
            </EmptyState>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-ink-600">{t("search.resultsCount", { count: result.offers.length })}</p>
                {rate.currency !== CANONICAL && rate.asOf && (
                  <p className="text-xs text-ink-500">
                    {t("search.rateNote", { currency: rate.currency, date: new Date(rate.asOf).toLocaleDateString(locale) })}
                  </p>
                )}
              </div>

              <ul className="space-y-4">
                {result.offers.map((offer, index) => {
                  const shown = price(offer.grossMinor);
                  const features = Object.entries({
                    ...(offer.vehicle.amenities as Record<string, unknown>),
                    ...(offer.vehicle.capabilities as Record<string, unknown>),
                  }).filter(([, v]) => v === true).map(([k]) => k);

                  return (
                    <li key={offer.quoteId}>
                      <Card className="overflow-hidden p-5 transition-colors hover:border-ink-300">
                        <div className="flex flex-wrap gap-5">
                          <VehiclePhoto
                            photoKey={offer.vehicle.photoKey}
                            colour={offer.vehicle.colour}
                            alt={`${offer.vehicle.make} ${offer.vehicle.model}`}
                            className="h-28 w-40 shrink-0"
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="font-display text-xl text-ink-900">{offer.driverName}</h2>
                              <Badge tone="success">{t("card.verified")}</Badge>
                              {index === 0 && filterState.sort === "recommended" && (
                                <Badge tone="info">{t("search.recommended")}</Badge>
                              )}
                              {index === 0 && filterState.sort === "price_asc" && result.offers.length > 1 && (
                                <Badge tone="info">{t("search.cheapest")}</Badge>
                              )}
                            </div>

                            <p className="mt-1 text-sm text-ink-600">
                              {offer.vehicle.make} {offer.vehicle.model} ({offer.vehicle.year}) ·{" "}
                              {CLASS_LABEL[offer.vehicle.class] ?? offer.vehicle.class} ·{" "}
                              {t("card.seats", { count: offer.vehicle.seats })} ·{" "}
                              {t("card.luggage", { count: offer.vehicle.luggage })}
                            </p>

                            <p className="mt-1 text-sm text-ink-600">
                              {t("card.languages")}:{" "}
                              {offer.languages.length === 0 ? "—" : offer.languages.map((l) =>
                                `${l.language} (${l.level.toLowerCase()}${l.verified ? `, ${t("card.verifiedLevel")}` : ""})`).join(", ")}
                            </p>

                            {features.length > 0 && (
                              <ul className="mt-2 flex flex-wrap gap-1.5">
                                {features.map((f) => (
                                  <li key={f}><Badge>{AMENITY_LABEL[f] ?? f.replaceAll("_", " ")}</Badge></li>
                                ))}
                              </ul>
                            )}

                            <p className="mt-2 text-sm text-ink-500">
                              {offer.ratingCount > 0
                                ? `${offer.ratingAverage?.toFixed(1)} ★ · ${t("card.trips", { count: offer.completedTrips })}`
                                : t("card.noReviews")}
                            </p>
                          </div>

                          <div className="ml-auto shrink-0 text-right">
                            <p className="font-display text-3xl text-ink-900">{shown.primary}</p>
                            {shown.secondary && (
                              <p className="text-sm text-ink-500">≈ {shown.secondary}</p>
                            )}
                            <p className="mt-0.5 text-xs text-ink-500">{t("search.priceForVehicle")}</p>
                            <Link
                              href={`/${locale}/drivers/${offer.handle}?quote=${offer.quoteId}${addressThread}`}
                              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
                            >
                              {t("search.viewBook")} →
                            </Link>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-5 border-t border-ink-100 pt-3">
                          <details className="text-xs">
                            <summary className="cursor-pointer text-ink-500">{t("search.breakdown")}</summary>
                            <ul className="mt-2 space-y-1 text-ink-600">
                              {offer.breakdown.lines.map((line, i) => (
                                <li key={i} className="flex justify-between gap-6">
                                  <span>{line.label}{line.detail ? ` — ${line.detail}` : ""}</span>
                                  <span className="tabular-nums">
                                    {formatMoney(BigInt(line.amountMinor), CANONICAL, locale)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </details>
                          {filterState.sort === "recommended" && (
                            <details className="text-xs">
                              <summary className="cursor-pointer text-ink-500">{t("search.whyRanking")}</summary>
                              <p className="mt-1 text-ink-600">{offer.scoreReasons.join(" · ")}</p>
                            </details>
                          )}
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>

              <p className="text-xs text-ink-500">
                {t("search.heldUntil", { time: result.offers[0]!.expiresAt.toLocaleTimeString(locale, { timeStyle: "short" }) })}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
