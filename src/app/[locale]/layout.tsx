import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, getTranslator, LOCALES, type Locale } from "@/lib/i18n";
import { getSessionUser } from "@/lib/auth/session";
import { getDisplayCurrency } from "@/lib/currency";
import { config } from "@/lib/config";
import { PreferenceSwitcher } from "@/components/preference-switcher";
import { CookieNotice } from "@/components/cookie-notice";

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

  const nav = [
    { href: `/${locale}/transfers`, label: t("nav.transfers") },
    { href: `/${locale}/tours`, label: t("nav.tours") },
    { href: `/${locale}/faq`, label: t("nav.faq") },
  ];

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip" lang={locale}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2.5 focus:shadow-lg"
      >
        {t("common.home")}
      </a>

      <header className="sticky top-0 z-30 border-b border-ink-200/80 bg-ink-50/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link
            href={`/${locale}`}
            className="flex shrink-0 items-center gap-2.5 text-ink-900"
          >
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-wine-600 text-white">
              {/* Contour rings with a route cutting through — the signature mark. */}
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" aria-hidden>
                <ellipse cx="12" cy="14" rx="9" ry="5.5" strokeWidth="1.3" opacity=".45" />
                <ellipse cx="12" cy="14" rx="5.5" ry="3.2" strokeWidth="1.3" opacity=".7" />
                <path d="M4 18 C9 10, 15 16, 20 7" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <span className="font-display text-lg">{t("brand.name")}</span>
          </Link>

          <nav className="hidden flex-1 items-center gap-1 text-sm sm:flex" aria-label="Main">
            {nav.map((item) => (
              <Link
                key={item.href} href={item.href}
                className="rounded-lg px-3 py-2 font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden lg:block">
              <PreferenceSwitcher locale={locale as Locale} currency={currency} returnTo={`/${locale}`} />
            </div>
            {user ? (
              <Link
                href={user.isStaff ? "/admin" : "/driver"}
                className="rounded-lg border border-ink-300 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-white"
              >
                {user.isStaff ? "Operations" : "My driving"}
              </Link>
            ) : (
              <>
                <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100">
                  {t("nav.signIn")}
                </Link>
                <Link
                  href="/driver"
                  className="hidden rounded-lg bg-wine-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-wine-700 sm:block"
                >
                  {t("nav.becomeDriver")}
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Mobile navigation: a scrollable strip rather than a hamburger, so
            the three destinations stay one tap away. */}
        <nav className="flex gap-1 overflow-x-auto border-t border-ink-200/70 px-3 py-2 text-sm sm:hidden" aria-label="Main">
          {nav.map((item) => (
            <Link key={item.href} href={item.href}
                  className="whitespace-nowrap rounded-lg px-3 py-1.5 font-medium text-ink-600 hover:bg-ink-100">
              {item.label}
            </Link>
          ))}
          <Link href="/driver" className="whitespace-nowrap rounded-lg px-3 py-1.5 font-medium text-wine-700">
            {t("nav.becomeDriver")}
          </Link>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:py-12">{children}</main>

      <CookieNotice locale={locale as Locale} returnTo={`/${locale}`} />

      <footer className="mt-8 border-t border-ink-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-display flex items-center gap-2.5 text-xl text-ink-900">
              <span aria-hidden className="inline-block size-5 rounded-full bg-wine-600" />
              {t("brand.name")}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-600">{t("brand.tagline")}</p>
            <p className="mt-4 text-xs leading-relaxed text-ink-500">
              {t("footer.preLaunch")}
            </p>
          </div>

          <nav aria-label="Travel">
            <p className="text-sm font-semibold text-ink-900">{t("footer.travel")}</p>
            <ul className="mt-3 space-y-2 text-sm text-ink-600">
              <li><Link className="hover:text-ink-900" href={`/${locale}/transfers`}>{t("footer.allRoutes")}</Link></li>
              <li><Link className="hover:text-ink-900" href={`/${locale}/tours`}>{t("footer.dayTrips")}</Link></li>
              <li><Link className="hover:text-ink-900" href={`/${locale}/faq`}>{t("footer.faqLink")}</Link></li>
              <li><Link className="hover:text-ink-900" href={`/${locale}/contact`}>{t("footer.support")}</Link></li>
            </ul>
          </nav>

          <nav aria-label="Drivers and legal">
            <p className="text-sm font-semibold text-ink-900">{t("footer.drivers")}</p>
            <ul className="mt-3 space-y-2 text-sm text-ink-600">
              <li><Link className="hover:text-ink-900" href="/driver">{t("nav.becomeDriver")}</Link></li>
              <li><Link className="hover:text-ink-900" href="/login">{t("nav.signIn")}</Link></li>
            </ul>
            <p className="mt-5 text-sm font-semibold text-ink-900">{t("footer.legal")}</p>
            <ul className="mt-3 space-y-2 text-sm text-ink-600">
              <li><Link className="hover:text-ink-900" href={`/${locale}/legal/terms`}>{t("footer.terms")}</Link></li>
              <li><Link className="hover:text-ink-900" href={`/${locale}/legal/privacy`}>{t("footer.privacy")}</Link></li>
              <li><Link className="hover:text-ink-900" href={`/${locale}/legal/cancellation`}>{t("footer.cancellation")}</Link></li>
            </ul>
          </nav>

          <div>
            <p className="text-sm font-semibold text-ink-900">{t("footer.langCurrency")}</p>
            <div className="mt-3">
              <PreferenceSwitcher locale={locale as Locale} currency={currency} returnTo={`/${locale}`} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              {t("footer.gelNote")}
            </p>
          </div>
        </div>

        <div className="border-t border-ink-100">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-ink-500">
            <p>© {new Date().getFullYear()} {t("brand.name")}</p>
            <ul className="flex gap-4">
              {LOCALES.map((l) => (
                <li key={l}>
                  <Link href={`/${l}`} hrefLang={l}
                        aria-current={l === locale ? "true" : undefined}
                        className={l === locale ? "font-semibold text-ink-800" : "hover:text-ink-800"}>
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
