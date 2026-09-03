import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/rbac";
import { adminT, adminLocale } from "@/lib/i18n/admin";
import { countNew } from "@/lib/change-requests";
import { setStaffLocaleAction } from "./actions";
import { AdminNav, type AdminNavGroup } from "./nav";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

type NavItem = { href: string; key: Parameters<ReturnType<typeof adminT>>[0]; permission: Permission };

/**
 * Grouped by how the team actually works: the daily queue first, the things
 * edited weekly second, the things touched rarely last.
 */
const GROUPS: { key: "shell.groupOps" | "shell.groupContent" | "shell.groupSystem"; items: NavItem[] }[] = [
  {
    key: "shell.groupOps",
    items: [
      { href: "/admin", key: "nav.dashboard", permission: "admin.access" },
      { href: "/admin/drivers", key: "nav.drivers", permission: "admin.drivers.read" },
      { href: "/admin/bookings", key: "nav.bookings", permission: "admin.bookings.read" },
      { href: "/admin/support", key: "nav.support", permission: "admin.bookings.read" },
      { href: "/admin/schools", key: "nav.schools", permission: "admin.schools.read" },
      { href: "/admin/requests", key: "nav.requests", permission: "admin.requests.read" },
      { href: "/admin/media", key: "nav.media", permission: "admin.drivers.decide" },
      { href: "/admin/reviews", key: "nav.reviews", permission: "admin.drivers.decide" },
    ],
  },
  {
    key: "shell.groupContent",
    items: [
      { href: "/admin/locations", key: "nav.locations", permission: "admin.locations.write" },
      { href: "/admin/pricing", key: "nav.pricing", permission: "admin.pricing.approve" },
      { href: "/admin/tours", key: "nav.tours", permission: "admin.content.write" },
      { href: "/admin/content", key: "nav.content", permission: "admin.content.write" },
      { href: "/admin/images", key: "nav.images", permission: "admin.content.write" },
    ],
  },
  {
    key: "shell.groupSystem",
    items: [
      { href: "/admin/finance", key: "nav.finance", permission: "admin.finance.read" },
      { href: "/admin/staff", key: "nav.staff", permission: "admin.rbac.write" },
      { href: "/admin/audit", key: "nav.audit", permission: "admin.audit.read" },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  // While impersonating, the console is the driver's — the banner there is
  // the way back. Admin never renders half-as-staff, half-as-driver.
  if (user.impersonator) redirect("/driver");
  // Layout-level gate. Every page and action re-checks its own permission —
  // this is convenience, not the security boundary.
  if (!can(user.roles, "admin.access")) redirect("/driver");

  const t = adminT(user.locale);
  const locale = adminLocale(user.locale);

  // Nothing else tells anyone a change request has arrived: the notification
  // email cannot send while SMTP is blocked, so this badge is the only signal.
  const newRequests = can(user.roles, "admin.requests.read") ? await countNew() : 0;

  const groups: AdminNavGroup[] = GROUPS
    .map((group) => ({
      label: t(group.key),
      items: group.items
        .filter((item) => can(user.roles, item.permission))
        .map((item) => ({
          href: item.href,
          label: t(item.key),
          badge: item.href === "/admin/requests" && newRequests > 0 ? newRequests : undefined,
        })),
    }))
    .filter((group) => group.items.length > 0);

  const canSearchDrivers = can(user.roles, "admin.drivers.read");

  return (
    <div className="flex min-h-dvh flex-col bg-ink-50">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
        <div className="flex items-center gap-3 px-4 py-2.5 lg:px-6">
          <Link href="/admin" className="flex shrink-0 items-center gap-2.5">
            <span aria-hidden className="grid size-8 place-items-center rounded-full bg-pine-800 text-white">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" aria-hidden>
                <ellipse cx="12" cy="14" rx="9" ry="5.5" strokeWidth="1.4" opacity=".45" />
                <path d="M4 18 C9 10, 15 16, 20 7" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </span>
            <span className="font-display text-lg text-ink-900">{t("shell.title")}</span>
          </Link>

          {canSearchDrivers && (
            <form action="/admin/drivers" method="get" role="search" className="mx-auto hidden w-full max-w-md sm:block">
              <label htmlFor="admin-search" className="sr-only">{t("drivers.searchLabel")}</label>
              <input
                id="admin-search"
                type="search"
                name="q"
                placeholder={t("shell.searchPlaceholder")}
                className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2 text-sm text-ink-900 placeholder:text-ink-400 hover:border-ink-300 focus:border-ink-900 focus:bg-white"
              />
            </form>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2 text-sm">
            {/* Console language: a per-account setting, not a cookie, so it
                follows the member of staff to any machine. */}
            <form action={setStaffLocaleAction} className="flex overflow-hidden rounded-lg border border-ink-200">
              {(["ka", "en"] as const).map((l) => (
                <button
                  key={l}
                  name="locale"
                  value={l}
                  aria-pressed={locale === l}
                  className={
                    locale === l
                      ? "bg-pine-800 px-2.5 py-1 text-xs font-semibold text-white"
                      : "px-2.5 py-1 text-xs text-ink-500 hover:bg-ink-100"
                  }
                >
                  {l === "ka" ? "ქარ" : "ENG"}
                </button>
              ))}
            </form>

            <Link href="/ka" className="hidden rounded-lg px-2.5 py-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900 md:block">
              {t("shell.viewSite")}
            </Link>

            <span className="hidden items-center gap-2 rounded-lg bg-ink-50 px-2.5 py-1.5 text-xs text-ink-600 xl:flex">
              {user.email}
              <span className="rounded bg-ink-200/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                {user.roles[0]?.replaceAll("_", " ")}
              </span>
            </span>

            <form action="/logout" method="post">
              <button className="rounded-lg px-2.5 py-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900">
                {t("shell.signOut")}
              </button>
            </form>
          </div>
        </div>

        {/* Small screens get the nav strip inside the sticky header. */}
        <div className="lg:hidden">
          <AdminNav groups={groups} />
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-ink-200 bg-white px-3 py-6 lg:block">
          <AdminNav groups={groups} />
        </aside>
        <main className="w-full min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
