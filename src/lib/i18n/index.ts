/**
 * Minimal i18n. No customer-facing string is hard-coded in a component.
 *
 * Missing keys fall back to English and are reported, because a silently
 * blank call-to-action is worse than an untranslated one.
 */
import { en } from "./en";
import { ka } from "./ka";
import { ru } from "./ru";

export const LOCALES = ["en", "ka", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English", ka: "ქართული", ru: "Русский",
};

export type MessageKey = keyof typeof en;
/** Values are plain strings: `en` is `as const` for key inference only. */
export type Dictionary = Record<MessageKey, string>;

const DICTIONARIES: Record<Locale, Partial<Dictionary>> = { en, ka, ru };
const base: Dictionary = en;

const missing = new Set<string>();

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const dict = DICTIONARIES[locale] ?? {};
  let value: string | undefined = dict[key] ?? base[key];

  if (dict[key] === undefined && locale !== DEFAULT_LOCALE) {
    const id = `${locale}:${String(key)}`;
    if (!missing.has(id)) {
      missing.add(id);
      // Observable, per the spec's localization requirement.
      console.warn(`[i18n] missing translation ${id} — falling back to English`);
    }
  }
  if (value === undefined) {
    console.error(`[i18n] unknown message key "${String(key)}"`);
    return String(key);
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) value = value.replaceAll(`{${k}}`, String(v));
  }
  return value;
}

export function getTranslator(locale: Locale) {
  return (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
}

/** For an ops dashboard: which keys are currently falling back. */
export const missingTranslationKeys = (): string[] => [...missing];
