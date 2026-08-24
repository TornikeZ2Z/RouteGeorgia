"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AdminNavGroup {
  label: string;
  items: { href: string; label: string }[];
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
          </Link>
        ))}
      </nav>
    </>
  );
}
