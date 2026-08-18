import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, getTranslator, LOCALES } from "@/lib/i18n";
import { config } from "@/lib/config";
import { Alert, Card } from "@/components/ui";
import { InquiryForm } from "@/components/inquiry-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getTranslator(locale);
  return {
    title: t("hourly.title"),
    description: t("hourly.lead"),
    alternates: {
      canonical: `${config.appUrl}/${locale}/hourly`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}/hourly`])),
    },
  };
}

export default async function HourlyPage({
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
    <div className="mx-auto max-w-4xl space-y-10">
      <header>
        <p className="eyebrow text-brand-600">{t("nav.hourly")}</p>
        <h1 className="font-display mt-2 text-4xl text-ink-900 sm:text-5xl">{t("hourly.title")}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-600">{t("hourly.lead")}</p>
      </header>

      <Alert tone="info">{t("hourly.note")}</Alert>

      <Card className="p-6 sm:p-8">
        <h2 className="font-display mb-6 text-2xl text-ink-900">{t("business.formTitle")}</h2>
        <InquiryForm
          locale={locale} kind="hourly" withHourly
          sent={sp.sent === "1"} error={sp.error === "1"}
        />
      </Card>
    </div>
  );
}
