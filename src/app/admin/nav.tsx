"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AdminNavGroup {
  label: string;
  items: { href: string; label: string; badge?: number }[];
}

/**
 * The console's navigation, grouped and with the current page marked.
 *
 * A client component only because active-state needs the pathname; the groups
 * themselves are decided on the server, already filtered to the permissions
 * the signed-in member of staff actually holds.
 */
export function AdminNav({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <>
      {/* Desktop: grouped sidebar. */}
      <nav aria-label="Admin" className="hidden lg:block">
        {groups.map((group) => (
          <div key={group.label} className="mb-6">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              {group.label}
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={
                      isActive(item.href)
                        ? "block rounded-lg bg-pine-800 px-3 py-2 text-sm font-medium text-white"
                        : "block rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                    }
                  >
                    {item.label}
                    {item.badge ? <NavBadge n={item.badge} active={isActive(item.href)} /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Small screens: one scrollable strip, every destination one tap away. */}
      <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-1 pb-2 lg:hidden">
        {groups.flatMap((group) => group.items).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={
              isActive(item.href)
                ? "whitespace-nowrap rounded-lg bg-pine-800 px-3 py-1.5 text-sm font-medium text-white"
                : "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-100"
            }
          >
            {item.label}
            {item.badge ? <NavBadge n={item.badge} active={isActive(item.href)} /> : null}
          </Link>
        ))}
      </nav>
    </>
  );
}

/** The count of things waiting. Reads as a number to a screen reader, not as
    decoration, because it is the only signal that anything has arrived. */
function NavBadge({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={
        "ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums " +
        (active ? "bg-white text-pine-800" : "bg-pine-800 text-white")
      }
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
