import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "@db/client";
import { isLocale, getTranslator, LOCALES } from "@/lib/i18n";
import { config } from "@/lib/config";
import { PlaceImage } from "@/components/place-image";
import { sitePhoto } from "@/lib/site-photos";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getTranslator(locale);
  return {
    title: t("about.title"),
    description: t("about.lead"),
    alternates: {
      canonical: `${config.appUrl}/${locale}/about`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}/about`])),
    },
  };
}

/** The product promises double as the company values — they are enforced in code. */
const VALUE_KEYS = [
  ["home.why1t", "home.why1b"], ["home.why2t", "home.why2b"],
  ["home.why3t", "home.why3b"], ["home.why4t", "home.why4b"],
] as const;

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getTranslator(locale);

  const [stats] = await sql<{ drivers: number; routes: number; tours: number; locations: number; trips: number }[]>`
    SELECT (SELECT count(*) FROM driver_profiles WHERE published)::int AS drivers,
           (SELECT count(*) FROM route_families WHERE active)::int AS routes,
           (SELECT count(*) FROM tours WHERE active)::int AS tours,
           (SELECT count(*) FROM locations WHERE in_service_area)::int AS locations,
           (SELECT count(*) FROM bookings WHERE status = 'COMPLETED')::int AS trips`;

  const numbers = [
    [stats?.drivers ?? 0, t("home.statDrivers")],
    [stats?.locations ?? 0, t("home.statLocations")],
    [stats?.routes ?? 0, t("home.statRoutes")],
    [stats?.tours ?? 0, t("home.statTours")],
    [stats?.trips ?? 0, t("home.statTrips")],
  ].filter(([v]) => (v as number) > 0) as [number, string][];

  const photo = sitePhoto("about.jpg");

  return (
    <div className="mx-auto max-w-4xl space-y-14">
      <header>
        <p className="eyebrow">{t("nav.about")}</p>
        <h1 className="font-display mt-2 text-4xl text-ink-900 sm:text-5xl">{t("about.title")}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-600">{t("about.lead")}</p>
      </header>

      <div className="overflow-hidden rounded-2xl">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="aspect-[21/9] w-full object-cover" />
        ) : (
          <PlaceImage imageKey={null} alt="" seedText="georgia-panorama" className="aspect-[21/9] w-full" />
        )}
      </div>

      <div className="max-w-2xl space-y-5 leading-relaxed text-ink-700">
        <p>{t("about.body1")}</p>
        <p>{t("about.body2")}</p>
        <p>{t("about.body3")}</p>
      </div>

      {numbers.length > 0 && (
        <section>
          <h2 className="font-display text-2xl text-ink-900 sm:text-3xl">{t("about.numbersTitle")}</h2>
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
            {numbers.map(([value, label]) => (
              <div key={label}>
                <dt className="font-display text-3xl text-ink-900">{value}</dt>
                <dd className="mt-0.5 text-sm text-ink-500">{label}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section>
        <h2 className="font-display text-2xl text-ink-900 sm:text-3xl">{t("about.valuesTitle")}</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {VALUE_KEYS.map(([title, body]) => (
            <li key={title} className="rounded-lg border border-ink-300 bg-white p-6">
              <p className="font-semibold text-ink-900">{t(title)}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{t(body)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl bg-ink-50 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-xl text-sm leading-relaxed text-ink-700">{t("home.driveBody")}</p>
          <Link
            href="/driver"
            className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm text-white shadow-[0_0_2px_0_rgba(0,0,0,.16)] transition-colors hover:bg-brand-700"
          >
            {t("nav.becomeDriver")}
          </Link>
        </div>
      </section>
    </div>
  );
}
