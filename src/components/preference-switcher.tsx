"use client";

import { useRef } from "react";
import { DISPLAY_CURRENCIES, type DisplayCurrency } from "@/lib/currency-constants";
import { LOCALES, LOCALE_LABEL, getTranslator, type Locale } from "@/lib/i18n";

/**
 * Language and currency pickers.
 *
 * They submit on change, so there is no "Go" button cluttering the header.
 * The button still exists for anyone without JavaScript — it lives inside
 * <noscript>, which is exactly what that element is for.
 */
export function PreferenceSwitcher({
  locale, currency, returnTo,
}: { locale: Locale; currency: DisplayCurrency; returnTo: string }) {
  const t = getTranslator(locale);
  const localeForm = useRef<HTMLFormElement>(null);
  const currencyForm = useRef<HTMLFormElement>(null);

  const select =
    "cursor-pointer rounded-lg border border-ink-200 bg-transparent py-1.5 pl-2 pr-6 text-xs " +
    "font-medium text-ink-600 transition-colors hover:border-ink-300 hover:text-ink-900";

  return (
    <div className="flex items-center gap-1.5">
      <form ref={localeForm} action="/api/preferences" method="post" className="contents">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="currency" value={currency} />
        <label htmlFor="locale-select" className="sr-only">{t("footer.langCurrency")}</label>
        <select
          id="locale-select" name="locale" defaultValue={locale} className={select}
          onChange={() => localeForm.current?.requestSubmit()}
        >
          {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABEL[l]}</option>)}
        </select>
        <noscript>
          <button className="rounded border border-ink-200 px-2 py-1.5 text-xs">Go</button>
        </noscript>
      </form>

      <form ref={currencyForm} action="/api/preferences" method="post" className="contents">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor="currency-select" className="sr-only">{t("footer.langCurrency")}</label>
        <select
          id="currency-select" name="currency" defaultValue={currency} className={select}
          onChange={() => currencyForm.current?.requestSubmit()}
        >
          {DISPLAY_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <noscript>
          <button className="rounded border border-ink-200 px-2 py-1.5 text-xs">Go</button>
        </noscript>
      </form>
    </div>
  );
}
