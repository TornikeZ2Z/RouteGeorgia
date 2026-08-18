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
  locale, currency, returnTo, dark = false,
}: { locale: Locale; currency: DisplayCurrency; returnTo: string; dark?: boolean }) {
  const t = getTranslator(locale);
  const localeForm = useRef<HTMLFormElement>(null);
  const currencyForm = useRef<HTMLFormElement>(null);

  const select = dark
    ? "cursor-pointer rounded-lg border border-pine-600 bg-transparent py-1.5 pl-2 pr-6 text-xs " +
      "font-medium text-pine-100 transition-colors hover:border-pine-400 hover:text-white [&>option]:text-ink-900"
    : "cursor-pointer rounded-lg border border-ink-200 bg-transparent py-1.5 pl-2 pr-6 text-xs " +
      "font-medium text-ink-600 transition-colors hover:border-ink-300 hover:text-ink-900";
  const suffix = dark ? "-footer" : "";

  return (
    <div className="flex items-center gap-1.5">
      <form ref={localeForm} action="/api/preferences" method="post" className="contents">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="currency" value={currency} />
        <label htmlFor={`locale-select${suffix}`} className="sr-only">{t("footer.langCurrency")}</label>
        <select
          id={`locale-select${suffix}`} name="locale" defaultValue={locale} className={select}
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
        <label htmlFor={`currency-select${suffix}`} className="sr-only">{t("footer.langCurrency")}</label>
        <select
          id={`currency-select${suffix}`} name="currency" defaultValue={currency} className={select}
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
