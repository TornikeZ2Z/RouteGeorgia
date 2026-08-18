import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, getTranslator, LOCALES, type Locale } from "@/lib/i18n";
import { getSessionUser } from "@/lib/auth/session";
import { getDisplayCurrency } from "@/lib/currency";
import { config } from "@/lib/config";
import { PreferenceSwitcher } from "@/components/preference-switcher";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    metadataBase: new URL(config.appUrl),
    // hreflang alternates so the three locales are not treated as duplicates.
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${config.appUrl}/${l}`])),
    },
  };
}

export default async function LocaleLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getTranslator(locale);
  const [user, currency] = await Promise.all([getSessionUser(), getDisplayCurrency()]);

  return (
    <div className="flex min-h-dvh flex-col" lang={locale}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>

      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href={`/${locale}`} className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="inline-block size-6 rounded-md bg-wine-600" />
            {t("brand.name")}
          </Link>

          <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Main">
            <Link className="rounded px-3 py-2 text-ink-600 hover:bg-ink-100" href={`/${locale}/transfers`}>
              {t("nav.transfers")}
            </Link>
            <Link className="rounded px-3 py-2 text-ink-600 hover:bg-ink-100" href={`/${locale}/faq`}>
              FAQ
            </Link>
            <Link className="rounded px-3 py-2 text-ink-600 hover:bg-ink-100" href="/driver">
              {t("nav.becomeDriver")}
            </Link>
            {user ? (
              <Link className="rounded px-3 py-2 text-ink-600 hover:bg-ink-100" href={user.isStaff ? "/admin" : "/driver"}>
                {user.email}
              </Link>
            ) : (
              <Link className="rounded px-3 py-2 text-ink-600 hover:bg-ink-100" href="/login">
                {t("nav.signIn")}
              </Link>
            )}
            <PreferenceSwitcher locale={locale as Locale} currency={currency} returnTo={`/${locale}`} />
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-semibold text-ink-900">{t("brand.name")}</p>
            <p className="mt-2 text-sm text-ink-600">{t("brand.tagline")}</p>
          </div>

          <nav aria-label="Travel">
            <p className="text-sm font-medium text-ink-800">Travel</p>
            <ul className="mt-2 space-y-1 text-sm text-ink-600">
              <li><Link className="hover:text-ink-900" href={`/${locale}/transfers`}>All transfer routes</Link></li>
              <li><Link className="hover:text-ink-900" href={`/${locale}/faq`}>Frequently asked questions</Link></li>
            </ul>
          </nav>

          <nav aria-label="Drivers">
            <p className="text-sm font-medium text-ink-800">Drivers</p>
            <ul className="mt-2 space-y-1 text-sm text-ink-600">
              <li><Link className="hover:text-ink-900" href="/driver">{t("nav.becomeDriver")}</Link></li>
              <li><Link className="hover:text-ink-900" href="/login">{t("nav.signIn")}</Link></li>
            </ul>
          </nav>

          <div>
            <p className="text-sm font-medium text-ink-800">Language and currency</p>
            <div className="mt-2">
              <PreferenceSwitcher locale={locale as Locale} currency={currency} returnTo={`/${locale}`} />
            </div>
            <p className="mt-3 text-xs text-ink-500">
              All trips are charged in Georgian lari. Other currencies are shown for guidance only.
            </p>
          </div>
        </div>

        <div className="border-t border-ink-100">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-ink-500">
            <p>© {new Date().getFullYear()} {t("brand.name")}. Working name — not a registered brand.</p>
            <ul className="flex gap-4">
              {LOCALES.map((l) => (
                <li key={l}>
                  <Link
                    href={`/${l}`} hrefLang={l}
                    aria-current={l === locale ? "true" : undefined}
                    className={l === locale ? "font-medium text-ink-800" : "hover:text-ink-800"}
                  >
                    {l.toUpperCase()}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
