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
    { href: `/${locale}/tours`, label: "Tours" },
    { href: `/${locale}/faq`, label: "FAQ" },
  ];

  return (
    <div className="flex min-h-dvh flex-col" lang={locale}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2.5 focus:shadow-lg"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-ink-200 bg-ink-50/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link
            href={`/${locale}`}
            className="flex shrink-0 items-center gap-2.5 text-[15px] font-semibold tracking-tight text-ink-900"
          >
            <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-wine-600 text-white">
              {/* A road disappearing over a hill — the product in one mark. */}
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
                <path d="M9 21 L11 4 M15 21 L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M12 4 h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </span>
            {t("brand.name")}
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

      <footer className="mt-8 border-t border-ink-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="flex items-center gap-2 font-semibold text-ink-900">
              <span aria-hidden className="inline-block size-5 rounded bg-wine-600" />
              {t("brand.name")}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-600">{t("brand.tagline")}</p>
            <p className="mt-4 text-xs leading-relaxed text-ink-500">
              Working name, pre-launch. Prices are set and charged in Georgian lari.
            </p>
          </div>

          <nav aria-label="Travel">
            <p className="text-sm font-semibold text-ink-900">Travel</p>
            <ul className="mt-3 space-y-2 text-sm text-ink-600">
              <li><Link className="hover:text-ink-900" href={`/${locale}/transfers`}>All transfer routes</Link></li>
              <li><Link className="hover:text-ink-900" href={`/${locale}/tours`}>Day trips and tours</Link></li>
              <li><Link className="hover:text-ink-900" href={`/${locale}/faq`}>Frequently asked questions</Link></li>
            </ul>
          </nav>

          <nav aria-label="Drivers">
            <p className="text-sm font-semibold text-ink-900">Drivers</p>
            <ul className="mt-3 space-y-2 text-sm text-ink-600">
              <li><Link className="hover:text-ink-900" href="/driver">{t("nav.becomeDriver")}</Link></li>
              <li><Link className="hover:text-ink-900" href="/login">{t("nav.signIn")}</Link></li>
            </ul>
          </nav>

          <div>
            <p className="text-sm font-semibold text-ink-900">Language and currency</p>
            <div className="mt-3">
              <PreferenceSwitcher locale={locale as Locale} currency={currency} returnTo={`/${locale}`} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              Other currencies are shown for guidance only, converted from a dated rate.
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
