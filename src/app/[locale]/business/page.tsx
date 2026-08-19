import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, getTranslator, LOCALES } from "@/lib/i18n";
import { config } from "@/lib/config";
import { Card } from "@/components/ui";
import { InquiryForm } from "@/components/inquiry-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getTranslator(locale);
  return {
    title: t("business.title"),
    description: t("business.lead"),
    alternates: {
      canonical: `${config.appUrl}/${locale}/business`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}/business`])),
    },
  };
}

const POINTS = [
  ["business.p1t", "business.p1b"],
  ["business.p2t", "business.p2b"],
  ["business.p3t", "business.p3b"],
] as const;

export default async function BusinessPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const t = getTranslator(locale);

  return (
    <div className="mx-auto max-w-4xl space-y-12">
      <header>
        <p className="eyebrow">{t("nav.business")}</p>
        <h1 className="font-display mt-2 text-4xl text-ink-900 sm:text-5xl">{t("business.title")}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-600">{t("business.lead")}</p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-3">
        {POINTS.map(([title, body]) => (
          <li key={title} className="rounded-lg border border-ink-300 bg-white p-6">
            <p className="font-semibold text-ink-900">{t(title)}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">{t(body)}</p>
          </li>
        ))}
      </ul>

      <Card className="p-6 sm:p-8">
        <h2 className="font-display mb-6 text-2xl text-ink-900">{t("business.formTitle")}</h2>
        <InquiryForm
          locale={locale} kind="business" withCompany
          sent={sp.sent === "1"} error={sp.error === "1"}
        />
      </Card>
    </div>
  );
}
