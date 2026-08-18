import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const NAV = [
  { href: "/admin", label: "Command centre", permission: "admin.access" },
  { href: "/admin/drivers", label: "Drivers", permission: "admin.drivers.read" },
  { href: "/admin/bookings", label: "Bookings", permission: "admin.bookings.read" },
  { href: "/admin/media", label: "Photos", permission: "admin.drivers.decide" },
  { href: "/admin/reviews", label: "Reviews", permission: "admin.drivers.decide" },
  { href: "/admin/finance", label: "Finance", permission: "admin.finance.read" },
  { href: "/admin/locations", label: "Locations & routes", permission: "admin.locations.write" },
  { href: "/admin/pricing", label: "Price bands", permission: "admin.pricing.approve" },
  { href: "/admin/content", label: "Content", permission: "admin.content.write" },
  { href: "/admin/images", label: "Photography", permission: "admin.content.write" },
  { href: "/admin/staff", label: "Staff", permission: "admin.rbac.write" },
  { href: "/admin/audit", label: "Audit log", permission: "admin.audit.read" },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  // Layout-level gate. Every page and action re-checks its own permission —
  // this is convenience, not the security boundary.
  if (!can(user.roles, "admin.access")) redirect("/driver");

  const nav = NAV.filter((item) => can(user.roles, item.permission));

  return (
    <div className="flex min-h-dvh flex-col bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2.5">
            <span aria-hidden className="grid size-8 place-items-center rounded-full bg-wine-600 text-white">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" aria-hidden>
                <ellipse cx="12" cy="14" rx="9" ry="5.5" strokeWidth="1.4" opacity=".45" />
                <path d="M4 18 C9 10, 15 16, 20 7" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </span>
            <span className="font-display text-lg text-ink-900">Operations</span>
          </Link>
          <div className="flex items-center gap-3 text-sm text-ink-500">
            <span>{user.email}</span>
            <span className="rounded bg-ink-100 px-2 py-0.5 text-xs">{user.roles.join(", ")}</span>
            <form action="/logout" method="post">
              <button className="rounded px-2 py-1 hover:bg-ink-100">Sign out</button>
            </form>
          </div>
        </div>
        <nav aria-label="Admin" className="mx-auto max-w-6xl overflow-x-auto px-2 pb-2">
          <ul className="flex gap-1 text-sm">
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block whitespace-nowrap rounded-lg px-3 py-1.5 text-ink-600 hover:bg-ink-100">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
