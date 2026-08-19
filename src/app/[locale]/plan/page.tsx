import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { sql } from "@db/client";
import { isLocale, getTranslator, LOCALES } from "@/lib/i18n";
import { config } from "@/lib/config";
import { PlanWizard } from "@/components/plan-wizard";
import { listTours } from "@/lib/tours";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getTranslator(locale);
  return {
    title: t("plan.title"),
    description: t("plan.lead"),
    alternates: {
      canonical: `${config.appUrl}/${locale}/plan`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}/plan`])),
    },
  };
}

export default async function PlanPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const t = getTranslator(locale);

  const [tours, places] = await Promise.all([
    listTours(locale),
    sql<{ slug: string; name: string }[]>`
      SELECT slug,
             coalesce(CASE WHEN ${locale} = 'ka' THEN name_ka
                           WHEN ${locale} = 'ru' THEN name_ru END, name_en) AS name
      FROM locations WHERE in_service_area`,
  ]);

  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header>
        <p className="eyebrow">{t("home.planTeaserEyebrow")}</p>
        <h1 className="font-display mt-2 text-4xl text-ink-900 sm:text-5xl">{t("plan.title")}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-500">{t("plan.lead")}</p>
      </header>
      <PlanWizard
        locale={locale}
        tours={tours.map((x) => ({ slug: x.slug, title: x.title, durationDays: x.durationDays }))}
        placeNames={Object.fromEntries(places.map((p) => [p.slug, p.name]))}
        initial={{ d: str(sp.d), i: str(sp.i), p: str(sp.p) }}
      />
    </div>
  );
}
