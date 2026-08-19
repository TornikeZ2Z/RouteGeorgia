/* eslint-disable @next/next/no-img-element */
/**
 * The RouteGeorgia lockup: the supplied brand mark (wave, mountains, road)
 * next to a bold one-word wordmark. On dark surfaces the mark sits on a
 * small white tile — its greens and navy road vanish on dark otherwise.
 */
export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5" aria-hidden>
      {dark ? (
        <span className="grid h-9 w-12 place-items-center rounded-lg bg-white px-1">
          <img src="/logo-mark.png" alt="" className="max-h-7 w-auto" />
        </span>
      ) : (
        <img src="/logo-mark.png" alt="" className="h-9 w-auto" />
      )}
      <span className={`text-xl font-bold tracking-[-0.02em] ${dark ? "text-white" : "text-ink-900"}`}>
        RouteGeorgia
      </span>
    </span>
  );
}
