import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

import { getTranslator, isLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { adminT } from "@/lib/i18n/admin";
import { exitImpersonationAction } from "./actions";
import { DriverNav } from "./nav";

/**
 * Every driver on this platform is Georgian. The console renders in the
 * locale on their account (set when they were onboarded), not in English
 * with a translated marketing site around it.
 */
const NAV: { href: string; label: MessageKey }[] = [
  { href: "/driver", label: "console.navOverview" },
  { href: "/driver/orders", label: "console.navOrders" },
  { href: "/driver/earnings", label: "console.navEarnings" },
  { href: "/driver/contract", label: "console.navContract" },
  { href: "/driver/application", label: "console.navProfile" },
  { href: "/driver/vehicle", label: "console.navVehicle" },
  { href: "/driver/documents", label: "console.navDocuments" },
  { href: "/driver/pricing", label: "console.navPricing" },
  { href: "/driver/availability", label: "console.navAvailability" },
];

/**
 * Driver surface, in the same visual language as the operations console: a
 * sidebar on desktop, a scroll strip on the phone the driver actually uses.
 */
export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/driver");
  const t = getTranslator(isLocale(user.locale) ? (user.locale as Locale) : "ka");
  const at = adminT(user.locale);

  const items = NAV.map((item) => ({ href: item.href, label: t(item.label) }));

  return (
    <div className="flex min-h-dvh flex-col bg-ink-50">
      {/* Impossible to miss, impossible to forget: staff acting as a driver
          see who they are being on every page, with the way back one tap
          away. The cookie expires on its own after an hour regardless. */}
      {user.impersonator && (
        <div className="sticky top-0 z-30 border-b border-gold-500/40 bg-gold-100">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 lg:px-6">
            <p className="text-sm text-pine-900">
              <span className="font-semibold">{at("impersonate.bannerTitle")} {user.email}.</span>{" "}
              {at("impersonate.bannerBody")}
            </p>
            <form action={exitImpersonationAction}>
              <button className="rounded-lg bg-pine-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-pine-700">
                {at("impersonate.exit")}
              </button>
            </form>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
        <div className="flex items-center gap-3 px-4 py-2.5 lg:px-6">
          <Link href="/driver" className="flex shrink-0 items-center gap-2.5">
            <span aria-hidden className="grid size-8 place-items-center rounded-full bg-pine-800 text-white">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" aria-hidden>
                <ellipse cx="12" cy="14" rx="9" ry="5.5" strokeWidth="1.4" opacity=".45" />
                <path d="M4 18 C9 10, 15 16, 20 7" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </span>
            <span className="font-display text-lg text-ink-900">{t("console.title")}</span>
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-2 text-sm">
            <span className="hidden rounded-lg bg-ink-50 px-2.5 py-1.5 text-xs text-ink-600 md:block">
              {user.email}
            </span>
            <form action="/logout" method="post">
              <button className="rounded-lg px-2.5 py-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900">
                {t("nav.signOut")}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:hidden">
          <DriverNav items={items} />
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r border-ink-200 bg-white px-3 py-6 lg:block">
          <DriverNav items={items} />
        </aside>
        <main className="w-full min-w-0 max-w-5xl flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
