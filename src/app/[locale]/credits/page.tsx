import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, getTranslator, LOCALES } from "@/lib/i18n";
import { config } from "@/lib/config";
import { PHOTO_CREDITS } from "@/lib/photo-credits";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getTranslator(locale);
  return {
    title: t("credits.title"),
    robots: { index: false },
    alternates: {
      canonical: `${config.appUrl}/${locale}/credits`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}/credits`])),
    },
  };
}

export default async function CreditsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getTranslator(locale);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="eyebrow">{t("footer.legal")}</p>
        <h1 className="font-display mt-2 text-4xl text-ink-900">{t("credits.title")}</h1>
        <p className="mt-4 leading-relaxed text-ink-500">{t("credits.lead")}</p>
        <p className="mt-3 leading-relaxed text-ink-500">{t("credits.ours")}</p>
      </header>
      <ul className="divide-y divide-ink-200 rounded-2xl border border-ink-200 bg-white">
        {PHOTO_CREDITS.map((c) => (
          <li key={c.source} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 text-sm">
            <span className="font-semibold capitalize text-ink-900">{c.subject}</span>
            <span className="text-ink-500">{c.author}</span>
            <span className="text-ink-400">{c.license}</span>
            <a href={c.source} target="_blank" rel="noreferrer license"
               className="text-ink-900 underline underline-offset-4">
              Wikimedia Commons
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
