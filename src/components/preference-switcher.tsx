"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DISPLAY_CURRENCIES, type DisplayCurrency } from "@/lib/currency-constants";
import { LOCALES, LOCALE_LABEL, getTranslator, type Locale } from "@/lib/i18n";

/**
 * Language and currency pickers, as proper dropdown buttons.
 *
 * Each is a pill that opens a small panel listing the options with the
 * active one marked in gold. Selection posts to /api/preferences and
 * follows the redirect explicitly (React 19 swallows client-form
 * redirects). A <noscript> native form remains for the no-JS case, and
 * the `dark` prop forces dark styling on always-navy surfaces (footer);
 * without it the pills adapt to the theme via `dark:` variants.
 */
const CURRENCY_META: Record<DisplayCurrency, { symbol: string; name: string }> = {
  GEL: { symbol: "₾", name: "Georgian lari" },
  USD: { symbol: "$", name: "US dollar" },
  EUR: { symbol: "€", name: "Euro" },
};

function Menu<T extends string>({
  id, label, button, value, options, describe, onPick, dark, align = "right",
}: {
  id: string;
  label: string;
  button: React.ReactNode;
  value: T;
  options: readonly T[];
  describe: (v: T) => React.ReactNode;
  onPick: (v: T) => void;
  dark: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const pill = dark
    ? "border-white/25 text-pine-100 hover:border-gold-400 hover:text-white"
    : "border-ink-300 text-ink-600 hover:border-gold-500 hover:text-ink-900 " +
      "dark:border-white/25 dark:text-pine-100 dark:hover:border-gold-400 dark:hover:text-white";
  const panel = dark
    ? "border-white/15 bg-pine-700 text-pine-100"
    : "border-ink-200 bg-white text-ink-900 dark:border-white/15 dark:bg-pine-700 dark:text-pine-100";
  const row = dark
    ? "hover:bg-white/10"
    : "hover:bg-ink-50 dark:hover:bg-white/10";

  return (
    <div ref={box} className="relative">
      <button
        type="button" id={id} aria-haspopup="listbox" aria-expanded={open} aria-label={label}
        onClick={() => setOpen(!open)}
        className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${pill}`}
      >
        {button}
        <svg viewBox="0 0 24 24" className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
             fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox" aria-labelledby={id}
          className={`absolute ${align === "right" ? "right-0" : "left-0"} bottom-auto top-full z-40 mt-2 min-w-44 overflow-hidden rounded-xl border py-1.5 shadow-[var(--shadow-float)] ${panel}`}
        >
          {options.map((v) => (
            <li key={v} role="option" aria-selected={v === value}>
              <button
                type="button"
                onClick={() => { setOpen(false); if (v !== value) onPick(v); }}
                className={`flex w-full items-center justify-between gap-6 px-3.5 py-2 text-left text-sm ${row}`}
              >
                <span>{describe(v)}</span>
                {v === value && (
                  <svg viewBox="0 0 24 24" className="size-4 text-gold-500" fill="none" stroke="currentColor"
                       strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PreferenceSwitcher({
  locale, currency, returnTo, dark = false,
}: { locale: Locale; currency: DisplayCurrency; returnTo: string; dark?: boolean }) {
  const t = getTranslator(locale);
  const [backTo, setBackTo] = useState(returnTo);
  useEffect(() => {
    setBackTo(window.location.pathname + window.location.search);
  }, []);

  async function save(next: { locale?: Locale; currency?: DisplayCurrency }) {
    const body = new FormData();
    body.set("returnTo", backTo);
    body.set("locale", next.locale ?? locale);
    body.set("currency", next.currency ?? currency);
    const res = await fetch("/api/preferences", { method: "POST", body });
    window.location.assign(res.url || backTo);
  }

  const suffix = useId().replace(/[^a-zA-Z0-9]/g, "");

  return (
    <div className="flex items-center gap-1.5">
      <Menu
        id={`locale-menu-${suffix}`} label={t("footer.langCurrency")} dark={dark}
        value={locale} options={LOCALES}
        button={
          <>
            <svg viewBox="0 0 24 24" className="size-3.5 text-gold-500" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a15.6 15.6 0 0 1 0 18M12 3a15.6 15.6 0 0 0 0 18" />
            </svg>
            {locale.toUpperCase()}
          </>
        }
        describe={(l) => LOCALE_LABEL[l]}
        onPick={(l) => void save({ locale: l })}
      />
      <Menu
        id={`currency-menu-${suffix}`} label={t("footer.langCurrency")} dark={dark}
        value={currency} options={DISPLAY_CURRENCIES}
        button={<>{CURRENCY_META[currency].symbol}&nbsp;{currency}</>}
        describe={(c) => (
          <span className="flex items-baseline gap-2">
            <span className="w-4 text-gold-600">{CURRENCY_META[c].symbol}</span>
            {CURRENCY_META[c].name}
          </span>
        )}
        onPick={(c) => void save({ currency: c })}
      />
      <noscript>
        <form action="/api/preferences" method="post" className="flex items-center gap-1">
          <input type="hidden" name="returnTo" value={returnTo} />
          <select name="locale" defaultValue={locale} className="rounded border px-1 py-1 text-xs">
            {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABEL[l]}</option>)}
          </select>
          <select name="currency" defaultValue={currency} className="rounded border px-1 py-1 text-xs">
            {DISPLAY_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="rounded border px-2 py-1 text-xs">Go</button>
        </form>
      </noscript>
    </div>
  );
}
