import { DISPLAY_CURRENCIES, type DisplayCurrency } from "@/lib/currency";
import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n";

/**
 * Locale and currency pickers. Rendered as forms that submit on change, with
 * a visible Go button as the no-JavaScript fallback.
 */
export function PreferenceSwitcher({
  locale, currency, returnTo,
}: { locale: Locale; currency: DisplayCurrency; returnTo: string }) {
  return (
    <div className="flex items-center gap-2">
      <form action="/api/preferences" method="post" className="flex items-center gap-1">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="currency" value={currency} />
        <label htmlFor="locale-select" className="sr-only">Language</label>
        <select
          id="locale-select" name="locale" defaultValue={locale}
          className="rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-xs"
        >
          {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABEL[l]}</option>)}
        </select>
        <button className="rounded border border-ink-200 px-2 py-1.5 text-xs text-ink-500 hover:bg-ink-50">
          Go
        </button>
      </form>

      <form action="/api/preferences" method="post" className="flex items-center gap-1">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor="currency-select" className="sr-only">Display currency</label>
        <select
          id="currency-select" name="currency" defaultValue={currency}
          className="rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-xs"
        >
          {DISPLAY_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="rounded border border-ink-200 px-2 py-1.5 text-xs text-ink-500 hover:bg-ink-50">
          Go
        </button>
      </form>
    </div>
  );
}
