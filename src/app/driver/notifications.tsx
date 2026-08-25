import Link from "next/link";
import { sql } from "@db/client";
import { getTranslator, isLocale, type Locale } from "@/lib/i18n";

/**
 * The bell.
 *
 * Everything the platform sends a driver went out by email or SMS into a
 * channel they may not be watching — and with email transport unconfigured,
 * some of it currently reaches nobody at all. The outbox already holds every
 * message; this shows the driver their own.
 *
 * Server-rendered inside a details element so it costs no JavaScript and
 * works on a slow phone.
 */
export async function NotificationBell({
  userId, locale,
}: { userId: string; locale: string }) {
  const t = getTranslator(isLocale(locale) ? (locale as Locale) : "ka");

  const rows = await sql<NotificationRow[]>`
    SELECT id, kind, subject, body, created_at, read_at
    FROM notifications
    WHERE user_id = ${userId}::uuid
    ORDER BY created_at DESC
    LIMIT 20`;

  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center rounded-lg px-2.5 py-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900">
        <span className="relative inline-flex">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor"
               strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
        <span className="sr-only">{t("console.notifTitle")}</span>
      </summary>

      <div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-ink-200 bg-white p-2 shadow-lg">
        <div className="flex items-center justify-between px-2 py-1.5">
          <p className="text-sm font-semibold text-ink-900">{t("console.notifTitle")}</p>
          {unread > 0 && (
            <form action="/api/driver/notifications/read" method="post">
              <button className="text-xs text-ink-500 underline hover:text-ink-900">
                {t("console.notifMarkRead")}
              </button>
            </form>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="px-2 py-4 text-sm text-ink-500">{t("console.notifEmpty")}</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {rows.map((n) => (
              <li
                key={n.id}
                className={`rounded-lg px-2 py-2 ${n.read_at ? "" : "bg-brand-50"}`}
              >
                <p className="text-sm font-medium text-ink-900">{n.subject ?? n.kind}</p>
                <p className="mt-0.5 line-clamp-3 text-xs text-ink-600">{n.body}</p>
                <p className="mt-1 text-[11px] text-ink-400">
                  {new Date(n.created_at).toLocaleString("en-GB", {
                    dateStyle: "short", timeStyle: "short",
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}

        <Link
          href="/driver/orders"
          className="mt-1 block rounded-lg px-2 py-2 text-xs text-ink-500 hover:bg-ink-50"
        >
          {t("console.notifAllOrders")}
        </Link>
      </div>
    </details>
  );
}

interface NotificationRow {
  id: string; kind: string; subject: string | null; body: string;
  created_at: Date; read_at: Date | null;
}
