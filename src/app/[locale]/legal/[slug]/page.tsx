import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, LOCALES, type Locale } from "@/lib/i18n";
import { getLegalDocument, LEGAL_SLUGS } from "@/lib/legal";
import { config } from "@/lib/config";
import { Alert } from "@/components/ui";

export const revalidate = 3600;

interface Props { params: Promise<{ locale: string; slug: string }> }

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => LEGAL_SLUGS.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const doc = getLegalDocument(slug, locale as Locale);
  if (!doc) return { title: "Not found" };
  return {
    title: doc.title,
    description: doc.intro.slice(0, 155),
    alternates: {
      canonical: `${config.appUrl}/${locale}/legal/${slug}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}/legal/${slug}`])),
    },
  };
}

export default async function LegalPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const doc = getLegalDocument(slug, locale as Locale);
  if (!doc) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-500">
        <Link href={`/${locale}`} className="hover:text-ink-800">Home</Link>
        <span className="mx-2" aria-hidden>/</span>
        <span className="text-ink-700">{doc.title}</span>
      </nav>

      <header className="mt-6">
        <p className="eyebrow text-brand-600">Legal</p>
        <h1 className="font-display mt-3 text-4xl text-ink-900 sm:text-5xl">{doc.title}</h1>
        <p className="mt-2 text-sm text-ink-500">Last updated {doc.updated}</p>
        <p className="mt-5 text-lg leading-relaxed text-ink-700">{doc.intro}</p>
      </header>

      <div className="mt-6">
        <Alert tone="warning" title="Not yet reviewed by a Georgian lawyer">
          These terms describe accurately what this service does and what it stores, but they have
          not been checked by qualified local counsel. That review is required before trading.
        </Alert>
      </div>

      <div className="mt-10 space-y-10">
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-display text-2xl text-ink-900">{section.heading}</h2>
            <div className="rule-fade mt-3" />
            <div className="mt-4 space-y-3">
              {section.body.map((paragraph, i) => (
                <p key={i} className="leading-relaxed text-ink-700">{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <nav className="mt-14 flex flex-wrap gap-4 border-t border-ink-200 pt-6 text-sm">
        {LEGAL_SLUGS.filter((s) => s !== slug).map((s) => {
          const other = getLegalDocument(s, locale as Locale)!;
          return (
            <Link key={s} href={`/${locale}/legal/${s}`} className="text-brand-700 underline underline-offset-4">
              {other.title}
            </Link>
          );
        })}
        <Link href={`/${locale}/contact`} className="text-brand-700 underline underline-offset-4">Contact</Link>
      </nav>
    </div>
  );
}
