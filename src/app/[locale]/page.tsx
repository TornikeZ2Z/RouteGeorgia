import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { sql } from "@db/client";
import { isLocale, getTranslator, LOCALES } from "@/lib/i18n";
import { Badge, Card } from "@/components/ui";
import { PlaceImage } from "@/components/place-image";
import { sitePhoto, listTravellerPhotos } from "@/lib/site-photos";
import { GeorgiaMap } from "@/components/georgia-map";
import { DESTINATIONS, type MapCategory } from "@/lib/destinations";
import { CATEGORY_ICONS } from "@/lib/map-icons";
import { config } from "@/lib/config";
import { listTours } from "@/lib/tours";
import { formatApproxDuration, formatDistance } from "@/lib/format";
import { SearchTabs } from "@/components/search-tabs";
import { HeroCarousel } from "@/components/hero-carousel";
import { unstable_cache } from "next/cache";
import { listRoutes } from "@/lib/routes-content";
import { routePriceFrom } from "@/lib/offers";
import { formatMoney } from "@/lib/money";
import { CANONICAL } from "@/lib/currency";

export const dynamic = "force-dynamic";

/**
 * Popular destinations: curated Tbilisi routes with a real "from" price
 * from the pricing engine (cheapest active plan), cached for an hour so
 * the homepage does not recompute quotes on every view.
 */
const POPULAR = ["kazbegi", "batumi", "borjomi", "mestia", "telavi", "sighnaghi", "gudauri", "bakhmaro"];

const popularDestinations = unstable_cache(
  async () => {
    const routes = await listRoutes("en");
    const fromTbilisi = routes.filter((r) => r.originSlug === "tbilisi");
    const out: { slug: string; routeSlug: string; name: string; fromMinor: string }[] = [];
    for (const dest of POPULAR) {
      if (out.length >= 6) break;
      const route = fromTbilisi.find((r) => r.destinationSlug === dest);
      if (!route) continue;
      const pricing = await routePriceFrom(route.slug);
      if (!pricing) continue;
      out.push({ slug: dest, routeSlug: route.slug, name: route.destinationName, fromMinor: pricing.fromMinor.toString() });
    }
    return out;
  },
  ["home-popular-destinations"],
  { revalidate: 3600 },
);

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const url = `${config.appUrl}/${locale}`;
  if (!isLocale(locale)) return {};
  const t = getTranslator(locale);
  return {
    title: t("brand.tagline"),
    description: t("home.heroSubtitle"),
    alternates: {
      canonical: url,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}`])),
    },
  };
}

const STEP_KEYS = [
  ["home.how1t", "home.how1b"], ["home.how2t", "home.how2b"],
  ["home.how3t", "home.how3b"], ["home.how4t", "home.how4b"],
] as const;

/** Icon paths for the hero chips and the trust band. */
const ICONS = {
  driver: "M12 11a3.4 3.4 0 1 0 0-6.8A3.4 3.4 0 0 0 12 11Zm-7.5 9a7.5 7.5 0 0 1 15 0",
  price: "M3 12.5V4.5A1.5 1.5 0 0 1 4.5 3h8l8.5 8.5a1.5 1.5 0 0 1 0 2.1l-6.4 6.4a1.5 1.5 0 0 1-2.1 0L3 12.5Zm4.5-5h.01",
  shield: "M12 3l7.5 3v6c0 4.8-3.2 8.1-7.5 9-4.3-.9-7.5-4.2-7.5-9V6L12 3Zm-3 9 2.2 2.2L15.5 10",
  support: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm0-14v5l3.5 2",
  car: "M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11m-14 0h14m-14 0a2 2 0 0 0-2 2v4h2m14-6a2 2 0 0 1 2 2v4h-2m-12 0v2m10-2v2m-9-5h.01M17 13h.01",
} as const;

const HERO_CHIPS = [
  ["home.chip1", ICONS.driver], ["home.chip2", ICONS.price],
  ["home.chip3", ICONS.shield], ["home.chip4", ICONS.support],
] as const;

const TRUST = [
  ["home.trust1", ICONS.driver], ["home.trust2", ICONS.car], ["home.trust3", ICONS.price],
  ["home.trust4", ICONS.support], ["home.trust5", ICONS.shield],
] as const;

/** Service cards: photo drop-in name, illustration seed, destination. */
const SERVICES = [
  { t: "home.svc1t", b: "home.svc1b", photo: "airport.jpg", seed: "tbilisi-airport", href: "/transfers", icon: "M10.5 20l1-5.5L6 12l-2.5 1L3 11.5 6.8 9 6 3.5 7.5 3l3 5 5.6-2.4a1.6 1.6 0 0 1 1.3 2.9L12.5 11l1.5 5.5-1.5 1-2-5-3.5 2 .5 4-1.5 1.5Z" },
  { t: "home.svc2t", b: "home.svc2b", photo: "cityroad.jpg", seed: "tbilisi-kutaisi", href: "/transfers", icon: "M12 3v2m0 4v2m0 4v2m0 4v0M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" },
  { t: "home.svc3t", b: "home.svc3b", photo: "tour.jpg", seed: "svaneti-tour", href: "/tours", icon: "M9 20l-5-2V5l5 2m0 13 6-2m-6 2V7m6 11 5 2V7l-5-2m0 13V5M9 7l6-2" },
  { t: "home.svc4t", b: "home.svc4b", photo: "group.jpg", seed: "group-minibus", href: "/business", icon: "M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2 20a6 6 0 0 1 12 0m1-6.5a5 5 0 0 1 7 4.6V20" },
  { t: "home.svc5t", b: "home.svc5b", photo: "school.jpg", seed: "school-run", href: "/schools", icon: "M12 3 2 8l10 5 8-4v5m-14-2.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5" },
] as const;

export default async function Home({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const rawCat = Array.isArray(sp.cat) ? sp.cat[0] : sp.cat;
  const CAT_LIST = ["sea", "mountains", "winter", "wine", "culture", "nature"] as const;
  const initialCat = CAT_LIST.includes(rawCat as (typeof CAT_LIST)[number]) ? (rawCat as MapCategory) : "all";
  if (!isLocale(locale)) notFound();
  const t = getTranslator(locale);

  const popular = await popularDestinations();
  const [locations, tours, stats] = await Promise.all([
    sql<{ slug: string; name_en: string; type: string; lat: number; lon: number }[]>`
      SELECT slug,
             coalesce(CASE WHEN ${locale} = 'ka' THEN name_ka
                           WHEN ${locale} = 'ru' THEN name_ru END, name_en) AS name_en,
             type::text AS type, lat, lon
      FROM locations WHERE in_service_area ORDER BY type, 2`,
    listTours(locale),
    sql<{ drivers: number; trips: number }[]>`
      SELECT (SELECT count(*) FROM driver_profiles WHERE published)::int AS drivers,
             (SELECT count(*) FROM bookings WHERE status = 'COMPLETED')::int AS trips`,
  ]);

  // Any that exist are shown, so a slide can be added by dropping the file in.
  const heroSlides = [
    "hero.jpg", "hero-2.jpg", "hero-3.jpg", "hero-4.jpg",
    "hero-5.jpg", "hero-6.jpg", "hero-7.jpg", "hero-8.jpg",
  ]
    .map((name) => sitePhoto(name))
    .filter((src): src is string => src !== null);
  const travellers = listTravellerPhotos();


  return (
    <div className="space-y-20 sm:space-y-28">
      {/* ------------------------------------------------ hero ------------ */}
      <section className="relative left-1/2 -mt-10 w-screen -translate-x-1/2 overflow-hidden bg-pine-800 text-white sm:-mt-12">
        <div className="absolute inset-0" aria-hidden>
          {heroSlides.length > 0 ? (
            <HeroCarousel images={heroSlides} />
          ) : (
            <PlaceImage imageKey={null} alt="" seedText="stepantsminda-gergeti" className="size-full" />
          )}
          <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-r from-pine-900/95 via-pine-900/60 to-pine-900/15" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-32 bg-gradient-to-t from-pine-900/80 to-transparent" />
        </div>

        <div className="relative z-[2] mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 pb-32 pt-14 sm:px-6 sm:pb-44 sm:pt-20 lg:px-10">
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div className="max-w-2xl">
              <h1 className="font-display max-w-3xl text-[2.6rem] leading-[1.07] sm:text-6xl xl:text-7xl">
                {t("home.heroTitle")}
                <span className="block text-gold-400">{t("home.heroTitle2")}</span>
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-pine-100 sm:text-lg">
                {t("home.heroSubtitle")}
              </p>

              <ul className="mt-10 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-4">
                {HERO_CHIPS.map(([key, icon], i) => (
                  <li key={key}>
                    <span className="grid size-12 place-items-center rounded-full border border-gold-400/70 text-gold-400">
                      <svg viewBox="0 0 24 24" className="size-5.5" fill="none" stroke="currentColor"
                           strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d={icon} />
                      </svg>
                    </span>
                    <p className="mt-2.5 text-sm font-bold tracking-[-0.01em] leading-tight">{t(key)}</p>
                    <p className="mt-1 text-xs leading-snug text-pine-200">{t(`home.chip${i + 1}s` as never)}</p>
                  </li>
                ))}
              </ul>
            </div>

            {tours.length > 0 && (
              <Link
                href={`/${locale}/tours`}
                className="group hidden w-80 shrink-0 rounded-2xl bg-pine-900/75 p-5 backdrop-blur-md transition-colors hover:bg-pine-900/90 lg:block"
              >
                <p className="eyebrow text-pine-300">{t("home.promoEyebrow")}</p>
                <p className="font-display mt-2 text-xl">{t("home.promoTitle")}</p>
                <p className="mt-2 text-sm leading-relaxed text-pine-100">{t("home.promoBody")}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-pine-800 transition-colors group-hover:bg-ink-100 dark:bg-ink-900 dark:group-hover:bg-ink-800">
                  {t("home.promoCta")}
                  <span aria-hidden>→</span>
                </span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* -------------------------------------------- booking widget ------ */}
      <div id="book" className="relative z-10 -mt-24 scroll-mt-24 sm:-mt-36">
        <Card className="p-6 shadow-[var(--shadow-float)] sm:p-8">
          <SearchTabs locale={locale} locations={locations} />
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-ink-100 pt-4">
            {(["home.check1", "home.check2", "home.check3", "home.check4"] as const).map((key) => (
              <li key={key} className="flex items-center gap-1.5 text-xs font-medium text-ink-600">
                <svg viewBox="0 0 24 24" className="size-4 text-ink-900" fill="none" stroke="currentColor"
                     strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12.5 10 17.5 19 7" />
                </svg>
                {t(key)}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ------------------------------------------------ categories ------ */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl text-ink-900 sm:text-4xl">{t("home.catsTitle")}</h2>
            <p className="mt-2 text-ink-500">{t("home.catsSub")}</p>
          </div>
          <a href="#explore" className="text-sm font-semibold text-ink-900 underline underline-offset-4">
            {t("home.catsAll")} →
          </a>
        </div>
        <ul className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {(["mountains", "nature", "sea", "wine", "culture", "winter"] as const).map((cat) => {
            const names = DESTINATIONS.filter((d) => d.categories.includes(cat)).slice(0, 3)
              .map((d) => locations.find((l) => l.slug === d.slug)?.name_en).filter(Boolean);
            const photo = sitePhoto(`categories/${cat}.jpg`);
            const KEY: Record<string, string> = {
              sea: "tours.catSea", mountains: "tours.catMountains", winter: "tours.catWinter",
              wine: "tours.catWine", culture: "tours.catCulture", nature: "map.catNature",
            };
            return (
              <li key={cat}>
                <Link href={`/${locale}?cat=${cat}#explore`} className="group relative block h-56 overflow-hidden rounded-2xl shadow-[0_1px_3px_rgba(11,29,51,.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-soft)] lg:h-64">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" loading="lazy"
                         className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <PlaceImage imageKey={null} alt="" seedText={`cat-${cat}`}
                                className="absolute inset-0 size-full transition-transform duration-500 group-hover:scale-105" />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-pine-900/90 via-pine-900/35 to-pine-900/10" />
                  <span className="absolute inset-x-0 bottom-0 p-4 text-white">
                    <span className="grid size-10 place-items-center rounded-full border border-gold-400/70 text-gold-400">
                      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor"
                           strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d={CATEGORY_ICONS[cat]} />
                      </svg>
                    </span>
                    <span className="mt-2 block text-lg font-bold tracking-[-0.01em]">{t(KEY[cat] as never)}</span>
                    <span className="mt-0.5 block truncate text-xs text-pine-200">{names.join(", ")}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ------------------------------------------- popular destinations - */}
      {popular.length > 0 && (
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-3xl text-ink-900 sm:text-4xl">{t("home.popularTitle")}</h2>
              <p className="mt-2 text-ink-500">{t("home.popularSub")}</p>
            </div>
            <Link href={`/${locale}/transfers`} className="text-sm font-semibold text-ink-900 underline underline-offset-4">
              {t("footer.allRoutes")} →
            </Link>
          </div>
          <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
            {popular.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/${locale}/transfers/${d.routeSlug}`}
                  className="group block overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[0_1px_3px_rgba(11,29,51,.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-soft)]"
                >
                  <span className="block h-32 overflow-hidden">
                    <PlaceImage
                      imageKey={null}
                      photoSrc={sitePhoto(`destinations/${d.slug}.jpg`)}
                      alt=""
                      seedText={d.slug}
                      className="size-full transition-transform duration-500 group-hover:scale-105"
                    />
                  </span>
                  <span className="block p-3.5 text-center">
                    <span className="block font-semibold tracking-[-0.01em] text-ink-900">
                      {locations.find((l) => l.slug === d.slug)?.name_en ?? d.name}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-500">
                      {t("transfers.fromPrice", { price: formatMoney(BigInt(d.fromMinor), CANONICAL, locale) })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* -------------------------------------- plan your perfect trip ---- */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-center">
        <div>
          <p className="eyebrow">{t("home.planTeaserEyebrow")}</p>
          <h2 className="font-display mt-2 text-3xl text-ink-900 sm:text-4xl">{t("home.planTeaserTitle")}</h2>
          <p className="mt-4 leading-relaxed text-ink-500">{t("home.planTeaserBody")}</p>
          <Link
            href={`/${locale}/plan`}
            className="mt-6 inline-flex min-h-12 items-center rounded-lg bg-brand-600 px-6 py-3 font-bold tracking-[-0.02em] text-white shadow-[0_0_2px_0_rgba(0,0,0,.16)] transition-colors hover:bg-brand-700"
          >
            {t("home.planTeaserCta")}
          </Link>
        </div>
        <div className="divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white px-6 shadow-[0_1px_3px_rgba(11,29,51,.06)] sm:px-8">
          {/* step 1 — days */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-5">
            <StepBadge n={1} />
            <p className="w-40 font-semibold text-ink-900">{t("home.planStep1")}</p>
            <ul className="flex flex-wrap gap-2">
              {([["1", "home.day1t"], ["3", "home.day2t"], ["5", "home.day3t"], ["7", "home.day4t"]] as const).map(([d, label]) => (
                <li key={d}>
                  <Link
                    href={`/${locale}/plan?d=${d}&i=nature&p=0`}
                    className="inline-flex rounded-full border border-ink-200 px-3.5 py-1.5 text-sm font-medium text-ink-600 transition-colors hover:border-gold-500 hover:text-ink-900"
                  >
                    {t(label)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {/* step 2 — interests */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-5">
            <StepBadge n={2} />
            <p className="w-40 font-semibold text-ink-900">{t("home.planStep2")}</p>
            <ul className="flex flex-wrap gap-4">
              {([["nature", "nature", "plan.int1"], ["culture", "culture", "plan.int2"], ["wine", "wine", "plan.int3"],
                 ["adventure", "mountains", "plan.int4"], ["rest", "sea", "plan.int5"]] as const).map(([interest, icon, label]) => (
                <li key={interest}>
                  <Link
                    href={`/${locale}/plan?d=3&i=${interest}&p=0`}
                    className="group flex flex-col items-center gap-1.5 text-ink-600 transition-colors hover:text-ink-900"
                  >
                    <span className="grid size-11 place-items-center rounded-full border border-ink-200 transition-colors group-hover:border-gold-500">
                      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor"
                           strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d={CATEGORY_ICONS[icon]} />
                      </svg>
                    </span>
                    <span className="text-[11px] font-medium">
                      {t(label)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {/* step 3 — party */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 py-5">
            <StepBadge n={3} />
            <p className="w-40 font-semibold text-ink-900">{t("home.planStep3")}</p>
            <ul className="flex flex-wrap gap-2">
              {(["plan.party1", "plan.party2", "plan.party3", "plan.party4"] as const).map((key, i) => (
                <li key={key}>
                  <Link
                    href={`/${locale}/plan?d=3&i=nature&p=${i}`}
                    className="inline-flex rounded-full border border-ink-200 px-3.5 py-1.5 text-sm font-medium text-ink-600 transition-colors hover:border-gold-500 hover:text-ink-900"
                  >
                    {t(key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* -------------------------------------------- why + contact ------- */}
      <section className={config.contact.phone ? "grid gap-4 lg:grid-cols-[1fr_20rem]" : "grid gap-4"}>
        <div className="rounded-2xl bg-pine-50 p-6 sm:p-10">
          <h2 className="font-display text-2xl text-ink-900 sm:text-3xl">{t("home.whyRG")}</h2>
          <ul className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {([["home.why1t", "home.why1b"], ["home.why2t", "home.why2b"],
               ["home.why3t", "home.why3b"], ["home.why4t", "home.why4b"]] as const).map(([tt, bb]) => (
              <li key={tt} className="flex gap-3">
                <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-gold-600" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m5 12 5 5L20 7" />
                </svg>
                <div>
                  <p className="font-semibold text-ink-900">{t(tt)}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-500">{t(bb)}</p>
                </div>
              </li>
            ))}
          </ul>
          {/* Destinations and tour counts are catalogue size, not proof of
              anything — dropped. Drivers and completed trips are earned
              numbers, shown only once they exist. */}
          {((stats[0]?.drivers ?? 0) > 0 || (stats[0]?.trips ?? 0) > 0) && (
            <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-ink-200 pt-6">
              {([[stats[0]?.drivers ?? 0, t("home.statDrivers")],
                 [stats[0]?.trips ?? 0, t("home.statTrips")]] as const)
                .filter(([v]) => (v as number) > 0)
                .map(([value, label]) => (
                <div key={label as string}>
                  <dt className="font-display text-3xl text-brand-600">{value as number}</dt>
                  <dd className="mt-0.5 text-sm text-ink-500">{label as string}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {config.contact.phone && (
          <div className="rounded-2xl bg-pine-800 p-6 text-white">
            <h2 className="font-display text-xl">{t("home.helpTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-pine-200">{t("home.helpBody")}</p>
            <div className="mt-5 flex flex-col gap-2.5">
              <a href={`https://wa.me/${config.contact.phone.replace(/[^0-9]/g, "")}`}
                 className="rounded-lg bg-white px-4 py-2.5 text-center text-sm font-bold tracking-[-0.01em] text-pine-800 hover:bg-pine-100 dark:bg-ink-900 dark:hover:bg-ink-800">
                {t("home.helpWhatsApp")}
              </a>
              <a href={`tel:${config.contact.phone.replace(/\s+/g, "")}`}
                 className="rounded-lg border border-gold-400 px-4 py-2.5 text-center text-sm font-bold tracking-[-0.01em] text-gold-400 hover:bg-white/5">
                {t("home.helpCall")} · {config.contact.phone}
              </a>
            </div>
          </div>
        )}
      </section>

      {/* ------------------------------------------------ explore map ----- */}
      <section>
        <div className="text-center">
          <p className="eyebrow">{t("home.mapEyebrow")}</p>
          <h2 className="font-display mt-2 text-3xl text-ink-900 sm:text-4xl">{t("home.mapTitle")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-500">{t("home.mapBody")}</p>
        </div>
        <div className="mt-8">
          <GeorgiaMap
            locale={locale}
            initialCat={initialCat}
            places={DESTINATIONS.flatMap((d) => {
              const loc = locations.find((l) => l.slug === d.slug);
              if (!loc) return [];
              return [{
                slug: d.slug, name: loc.name_en, lat: Number(loc.lat), lon: Number(loc.lon),
                categories: d.categories, seasons: d.seasons, icon: d.icon,
                descKey: d.descKey, labelPos: d.labelPos, dx: d.dx, dy: d.dy,
                photo: sitePhoto(`destinations/${d.slug}.jpg`),
              }];
            })}
          />
        </div>
      </section>

      {/* ------------------------------------------------ travellers ------ */}
      {travellers.length > 0 && (
        <section>
          <p className="eyebrow">{t("home.travellersEyebrow")}</p>
          <h2 className="font-display mt-2 text-3xl text-ink-900 sm:text-4xl">{t("home.travellersTitle")}</h2>
          <p className="mt-3 max-w-xl text-ink-500">{t("home.travellersBody")}</p>
          <ul className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {travellers.map((photo) => (
              <li key={photo.src} className="overflow-hidden rounded-lg border border-ink-300 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.src} alt={photo.caption} loading="lazy" className="aspect-square w-full rounded-t-lg object-cover" />
                <p className="px-4 py-3 text-sm text-ink-500">{photo.caption}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------ closing CTA ----- */}
      <section className="rounded-2xl bg-pine-800 px-6 py-14 text-center text-white sm:px-12">
        <h2 className="font-display text-3xl sm:text-4xl">{t("home.closingTitle")}</h2>
        <p className="mx-auto mt-4 max-w-xl leading-relaxed text-pine-100">{t("home.closingBody")}</p>
        <a
          href="#book"
          className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-gold-400 px-8 py-3 font-bold tracking-[-0.01em] text-pine-900 shadow-[0_0_2px_0_rgba(0,0,0,.16)] transition-colors hover:bg-gold-300"
        >
          {t("home.closingCta")}
        </a>
      </section>

    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 font-display text-sm font-bold text-white">
      {n}
    </span>
  );
}
