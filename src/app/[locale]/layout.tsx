import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, getTranslator, LOCALES, type Locale } from "@/lib/i18n";
import { getSessionUser } from "@/lib/auth/session";
import { getDisplayCurrency } from "@/lib/currency";
import { config } from "@/lib/config";
import { PreferenceSwitcher } from "@/components/preference-switcher";
import { CookieNotice } from "@/components/cookie-notice";
import { Logo } from "@/components/logo";

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
    { href: `/${locale}/plan`, label: t("nav.plan") },
    { href: `/${locale}/business`, label: t("nav.business") },
    { href: `/${locale}/schools`, label: t("nav.schools") },
    { href: `/${locale}/about`, label: t("nav.about") },
  ];

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip" lang={locale}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2.5 focus:shadow-lg"
      >
        {t("common.home")}
      </a>

      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] 2xl:max-w-[1680px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <Link href={`/${locale}`} aria-label={t("brand.name")} className="shrink-0">
            <Logo />
          </Link>

          <nav className="hidden flex-1 items-center gap-0.5 text-sm lg:flex" aria-label="Main">
            {nav.map((item) => (
              <Link
                key={item.href} href={item.href}
                className="rounded-lg px-3 py-2 text-ink-500 transition-colors hover:text-ink-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {config.contact.phone && (
              <a
                href={`tel:${config.contact.phone.replace(/\s+/g, "")}`}
                className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-50 xl:flex"
              >
                <svg viewBox="0 0 24 24" className="size-4 text-ink-900" fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 5c0-1.1.9-2 2-2h2.2c.5 0 .9.3 1 .8l.9 3.3c.1.4 0 .9-.4 1.1l-1.6 1.2a13.5 13.5 0 006.5 6.5l1.2-1.6c.2-.4.7-.5 1.1-.4l3.3.9c.5.1.8.5.8 1V18c0 1.1-.9 2-2 2h-1C10.6 20 4 13.4 4 5.5V5z" />
                </svg>
                {config.contact.phone}
              </a>
            )}
            <div className="hidden lg:block">
              <PreferenceSwitcher locale={locale as Locale} currency={currency} returnTo={`/${locale}`} />
            </div>
            {user ? (
              <Link
                href={user.isStaff ? "/admin" : "/driver"}
                className="rounded-lg border border-ink-300 px-3 py-2 text-sm text-ink-900 hover:border-ink-500"
              >
                {user.isStaff ? "Operations" : "My driving"}
              </Link>
            ) : (
              <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm text-ink-500 hover:text-ink-900 sm:block">
                {t("nav.signIn")}
              </Link>
            )}
            <Link
              href={`/${locale}#book`}
              className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm text-white shadow-[0_0_2px_0_rgba(0,0,0,.16)] transition-colors hover:bg-brand-700"
            >
              {t("nav.bookRide")}
            </Link>
          </div>
        </div>

        {/* Mobile navigation: a scrollable strip rather than a hamburger, so
            every destination stays one tap away. */}
        <nav className="flex gap-1 overflow-x-auto border-t border-ink-100 px-3 py-2 text-sm lg:hidden" aria-label="Main">
          {nav.map((item) => (
            <Link key={item.href} href={item.href}
                  className="whitespace-nowrap rounded-lg px-3 py-1.5 font-medium text-ink-600 hover:bg-ink-50">
              {item.label}
            </Link>
          ))}
          <Link href="/driver" className="whitespace-nowrap rounded-lg px-3 py-1.5 font-medium text-ink-900">
            {t("nav.becomeDriver")}
          </Link>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] flex-1 px-4 py-10 sm:px-6 sm:py-12 lg:px-10">{children}</main>

      <CookieNotice locale={locale as Locale} returnTo={`/${locale}`} />

      <footer className="mt-8 bg-pine-900 text-pine-100">
        <div className="mx-auto grid max-w-[1400px] 2xl:max-w-[1680px] gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-10">
          <div>
            <Logo dark />
            <p className="mt-4 text-sm leading-relaxed text-pine-200">{t("brand.tagline")}</p>
            <div className="mt-5 space-y-1.5 text-sm text-pine-200">
              {config.contact.phone && (
                <p><a className="hover:text-white" href={`tel:${config.contact.phone.replace(/\s+/g, "")}`}>{config.contact.phone}</a></p>
              )}
              <p><a className="hover:text-white" href={`mailto:${config.contact.email}`}>{config.contact.email}</a></p>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-pine-300">{t("footer.preLaunch")}</p>
          </div>

          <nav aria-label="Travel">
            <p className="text-sm font-semibold text-white">{t("footer.travel")}</p>
            <ul className="mt-3 space-y-2 text-sm text-pine-200">
              <li><Link className="hover:text-white" href={`/${locale}/transfers`}>{t("footer.allRoutes")}</Link></li>
              <li><Link className="hover:text-white" href={`/${locale}/tours`}>{t("footer.dayTrips")}</Link></li>
              <li><Link className="hover:text-white" href={`/${locale}/hourly`}>{t("nav.hourly")}</Link></li>
              <li><Link className="hover:text-white" href={`/${locale}/faq`}>{t("footer.faqLink")}</Link></li>
              <li><Link className="hover:text-white" href={`/${locale}/contact`}>{t("footer.support")}</Link></li>
            </ul>
          </nav>

          <nav aria-label="Company and legal">
            <p className="text-sm font-semibold text-white">{t("footer.company")}</p>
            <ul className="mt-3 space-y-2 text-sm text-pine-200">
              <li><Link className="hover:text-white" href={`/${locale}/about`}>{t("nav.about")}</Link></li>
              <li><Link className="hover:text-white" href={`/${locale}/business`}>{t("nav.business")}</Link></li>
              <li><Link className="hover:text-white" href={`/${locale}/schools`}>{t("nav.schools")}</Link></li>
              <li><Link className="hover:text-white" href="/driver">{t("nav.becomeDriver")}</Link></li>
              <li><Link className="hover:text-white" href="/login">{t("nav.signIn")}</Link></li>
            </ul>
            <p className="mt-5 text-sm font-semibold text-white">{t("footer.legal")}</p>
            <ul className="mt-3 space-y-2 text-sm text-pine-200">
              <li><Link className="hover:text-white" href={`/${locale}/legal/terms`}>{t("footer.terms")}</Link></li>
              <li><Link className="hover:text-white" href={`/${locale}/legal/privacy`}>{t("footer.privacy")}</Link></li>
              <li><Link className="hover:text-white" href={`/${locale}/legal/cancellation`}>{t("footer.cancellation")}</Link></li>
            </ul>
          </nav>

          <div>
            <p className="text-sm font-semibold text-white">{t("footer.langCurrency")}</p>
            <div className="mt-3">
              <PreferenceSwitcher locale={locale as Locale} currency={currency} returnTo={`/${locale}`} dark />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-pine-300">{t("footer.gelNote")}</p>
          </div>
        </div>

        <div className="border-t border-pine-700/60">
          <div className="mx-auto flex max-w-[1400px] 2xl:max-w-[1680px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-pine-300 sm:px-6 lg:px-10">
            <p>© {new Date().getFullYear()} {t("brand.name")}</p>
            <ul className="flex gap-4">
              {LOCALES.map((l) => (
                <li key={l}>
                  <Link href={`/${l}`} hrefLang={l}
                        aria-current={l === locale ? "true" : undefined}
                        className={l === locale ? "font-semibold text-white" : "hover:text-white"}>
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
