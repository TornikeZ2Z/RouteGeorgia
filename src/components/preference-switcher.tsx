"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  // Return to the page the visitor is actually on — switching language in
  // the middle of a search must not dump them back on the homepage. The
  // server-rendered fallback stays the locale home for the no-JS case.
  const [backTo, setBackTo] = useState(returnTo);
  useEffect(() => {
    setBackTo(window.location.pathname + window.location.search);
  }, []);

  // React 19 swallows client-form redirects; post explicitly and follow.
  async function post(form: HTMLFormElement | null) {
    if (!form) return;
    const res = await fetch("/api/preferences", { method: "POST", body: new FormData(form) });
    window.location.assign(res.url || backTo);
  }

  const select = dark
    ? "cursor-pointer rounded-lg border border-pine-600 bg-transparent py-1.5 pl-2 pr-6 text-xs " +
      "font-medium text-pine-100 transition-colors hover:border-pine-400 hover:text-white [&>option]:text-ink-900"
    : "cursor-pointer rounded-lg border border-ink-200 bg-transparent py-1.5 pl-2 pr-6 text-xs " +
      "font-medium text-ink-600 transition-colors hover:border-ink-300 hover:text-ink-900";
  // Unique per instance: the header and footer both render this component.
  const suffix = "-" + useId().replace(/[^a-zA-Z0-9]/g, "");

  return (
    <div className="flex items-center gap-1.5">
      <form ref={localeForm} action="/api/preferences" method="post" className="contents">
        <input type="hidden" name="returnTo" value={backTo} />
        <input type="hidden" name="currency" value={currency} />
        <label htmlFor={`locale-select${suffix}`} className="sr-only">{t("footer.langCurrency")}</label>
        <select
          id={`locale-select${suffix}`} name="locale" defaultValue={locale} className={select}
          onChange={() => void post(localeForm.current)}
        >
          {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABEL[l]}</option>)}
        </select>
        <noscript>
          <button className="rounded border border-ink-200 px-2 py-1.5 text-xs">Go</button>
        </noscript>
      </form>

      <form ref={currencyForm} action="/api/preferences" method="post" className="contents">
        <input type="hidden" name="returnTo" value={backTo} />
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor={`currency-select${suffix}`} className="sr-only">{t("footer.langCurrency")}</label>
        <select
          id={`currency-select${suffix}`} name="currency" defaultValue={currency} className={select}
          onChange={() => void post(currencyForm.current)}
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
