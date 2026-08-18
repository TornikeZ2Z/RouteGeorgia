import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

const NAV = [
  { href: "/driver", label: "Overview" },
  { href: "/driver/orders", label: "Orders" },
  { href: "/driver/earnings", label: "Earnings" },
  { href: "/driver/application", label: "Profile" },
  { href: "/driver/vehicle", label: "Vehicle" },
  { href: "/driver/documents", label: "Documents" },
  { href: "/driver/pricing", label: "Pricing" },
  { href: "/driver/availability", label: "Availability" },
];

/**
 * Driver surface. Built mobile-first and kept deliberately light: the target
 * device is a mid-range Android phone on an intermittent connection.
 */
export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/driver");

  return (
    <div className="flex min-h-dvh flex-col bg-ink-50">
      <header className="sticky top-0 z-10 border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/driver" className="flex items-center gap-2.5">
            <span aria-hidden className="grid size-8 place-items-center rounded-full bg-wine-600 text-white">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" aria-hidden>
                <ellipse cx="12" cy="14" rx="9" ry="5.5" strokeWidth="1.4" opacity=".45" />
                <path d="M4 18 C9 10, 15 16, 20 7" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </span>
            <span className="font-display text-lg text-ink-900">Driver</span>
          </Link>
          <form action="/logout" method="post">
            <button className="rounded px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-100">Sign out</button>
          </form>
        </div>
        <nav aria-label="Driver" className="mx-auto max-w-4xl overflow-x-auto px-2 pb-2">
          <ul className="flex gap-1 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block whitespace-nowrap rounded-lg px-3 py-1.5 text-ink-600 hover:bg-ink-100">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
