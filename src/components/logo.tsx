/**
 * The RouteGeorgia lockup: pin mark in a rounded green square, two-tone
 * wordmark. The name is a Latin proper noun in every locale, so the wordmark
 * is not translated — screen readers get the accessible name from the link
 * that wraps this.
 */
export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5" aria-hidden>
      <svg viewBox="0 0 64 64" className="size-9 shrink-0">
        <rect width="64" height="64" rx="16" className="fill-brand-600" />
        <path
          d="M32 12c-8.3 0-15 6.6-15 14.8C17 38 32 52 32 52s15-14 15-25.2C47 18.6 40.3 12 32 12z"
          fill="#fff"
        />
        <circle cx="32" cy="27" r="6" className="fill-brand-600" />
      </svg>
      <span className={`font-display text-xl tracking-tight ${dark ? "text-white" : "text-ink-900"}`}>
        Route<span className={dark ? "text-brand-300" : "text-brand-600"}>Georgia</span>
      </span>
    </span>
  );
}
