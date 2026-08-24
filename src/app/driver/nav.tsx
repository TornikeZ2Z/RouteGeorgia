"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Same pattern as the operations console: server decides items, client marks the current one. */
export function DriverNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/driver" ? pathname === "/driver" : pathname.startsWith(href);

  return (
    <>
      <nav aria-label="Driver" className="hidden lg:block">
        <ul className="space-y-0.5">
          {items.map((item) => (
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
      </nav>

      <nav aria-label="Driver" className="flex gap-1 overflow-x-auto px-1 pb-2 lg:hidden">
        {items.map((item) => (
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
