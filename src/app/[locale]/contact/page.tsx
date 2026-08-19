import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, LOCALES, getTranslator, type Locale } from "@/lib/i18n";
import { config } from "@/lib/config";
import { Card } from "@/components/ui";

export const revalidate = 3600;

interface Props { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Contact and support",
    description: "How to reach Route Georgia before, during or after a trip.",
    alternates: {
      canonical: `${config.appUrl}/${locale}/contact`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}/contact`])),
    },
  };
}

/**
 * Contact details are held in one place so they cannot drift between the
 * footer, the emails and this page. Replace these with real ones before
 * launch — a support address nobody reads is worse than none.
 */
const SUPPORT_EMAIL = "support@routegeorgia.ge";
const SUPPORT_HOURS = "Every day, 08:00 – 22:00 Georgia time";

export default async function Contact({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getTranslator(locale as Locale);

  return (
    <div className="mx-auto max-w-3xl">
      <header>
        <p className="eyebrow">{t("contact.eyebrow")}</p>
        <h1 className="font-display mt-3 text-4xl text-ink-900 sm:text-5xl">{t("contact.title")}</h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-700">
          {t("contact.intro")}
        </p>
      </header>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-xl text-ink-900">{t("contact.bookedT")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            {t("contact.bookedB1")}
          </p>
          <p className="mt-3 text-sm text-ink-600">
            {t("contact.bookedB2")}
          </p>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-xl text-ink-900">{t("contact.elseT")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            {t("contact.elseB", { email: "" })}{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-ink-900 underline">{SUPPORT_EMAIL}</a>
          </p>
          <p className="mt-3 text-sm text-ink-600">{t("contact.hours")}</p>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-xl text-ink-900">{t("contact.driversT")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            {t("contact.driversB1")}{" "}
            <Link href="/driver" className="text-ink-900 underline">{t("nav.becomeDriver")}</Link>
          </p>
          <p className="mt-3 text-sm text-ink-600">
            {t("contact.driversB2")}
          </p>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-xl text-ink-900">{t("contact.emergencyT")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            {t("contact.emergencyB")}
          </p>
        </Card>
      </div>

      <section className="mt-12">
        <h2 className="font-display text-2xl text-ink-900">{t("contact.rulesT")}</h2>
        <div className="rule-fade mt-3" />
        <ul className="mt-4 space-y-2 text-sm">
          {([
            ["terms", t("contact.ruleTerms")],
            ["privacy", t("contact.rulePrivacy")],
            ["cancellation", t("contact.ruleCancel")],
          ] as const).map(([slug, label]) => (
            <li key={slug}>
              <Link href={`/${locale}/legal/${slug}`} className="text-ink-900 underline underline-offset-4">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
