import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, LOCALES, getTranslator, type Locale, type MessageKey } from "@/lib/i18n";
import { config } from "@/lib/config";
import { Card } from "@/components/ui";

export const revalidate = 3600;

interface Props { params: Promise<{ locale: string }> }

/**
 * The questions live in the dictionary, so every locale carries its own text
 * and the parity test guarantees none can go missing. The earlier version
 * hard-coded English here, which is exactly how a "fully translated" site
 * still showed English FAQs to Georgian visitors.
 */
const QA: [MessageKey, MessageKey][] = [
  ["faq.q1", "faq.a1"], ["faq.q2", "faq.a2"], ["faq.q3", "faq.a3"],
  ["faq.q4", "faq.a4"], ["faq.q5", "faq.a5"], ["faq.q6", "faq.a6"],
  ["faq.q7", "faq.a7"], ["faq.q8", "faq.a8"], ["faq.q9", "faq.a9"],
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getTranslator(locale as Locale);
  const url = `${config.appUrl}/${locale}/faq`;
  return {
    title: t("faq.title"),
    description: t("faq.a1"),
    alternates: {
      canonical: url,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}/faq`])),
    },
  };
}

export default async function FaqPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getTranslator(locale as Locale);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: QA.map(([q, a]) => ({
      "@type": "Question",
      name: t(q),
      acceptedAnswer: { "@type": "Answer", text: t(a) },
    })),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header>
        <p className="eyebrow text-brand-600">{t("nav.faq")}</p>
        <h1 className="font-display mt-3 text-4xl text-ink-900 sm:text-5xl">{t("faq.title")}</h1>
      </header>

      <ul className="space-y-3">
        {QA.map(([q, a]) => (
          <li key={q}>
            <Card className="p-4">
              <details>
                <summary className="cursor-pointer font-medium text-ink-900">{t(q)}</summary>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{t(a)}</p>
              </details>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
