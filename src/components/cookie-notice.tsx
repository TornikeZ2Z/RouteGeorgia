import { cookies } from "next/headers";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";

/**
 * Cookie notice.
 *
 * Deliberately not a consent wall. This site sets three cookies — session,
 * language, currency — and none of them track anybody, so blocking the page
 * behind an "accept" button would be theatre. It says what is set, links to
 * the detail, and gets out of the way.
 *
 * If advertising or analytics cookies are ever added, this must become a real
 * consent gate with a genuine reject path before they load.
 */
export async function CookieNotice({ locale, returnTo }: { locale: Locale; returnTo: string }) {
  const jar = await cookies();
  if (jar.get("gt_cookie_notice")) return null;

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-ink-700">
          We set three cookies: your sign-in session, your language and your currency. Nothing that
          tracks you, and nothing shared with anyone.{" "}
          <Link href={`/${locale}/legal/privacy`} className="text-wine-700 underline underline-offset-2">
            How we handle your data
          </Link>
        </p>
        <form action="/api/consent" method="post" className="shrink-0">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            name="choice" value="accept"
            className="min-h-11 w-full rounded-lg bg-ink-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-800 sm:w-auto"
          >
            Got it
          </button>
        </form>
      </div>
    </div>
  );
}
