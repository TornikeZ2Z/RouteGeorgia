/**
 * Localization coverage.
 *
 * The failure this prevents: the dictionary was fully translated while most
 * pages carried hard-coded English, so "all keys translated" was true and the
 * site still showed English to Georgian visitors. Two rules, enforced here:
 *
 *   1. Georgian and Russian must contain EVERY key English has. The Partial
 *      type stays (fallback is still the right runtime behaviour) but a
 *      missing key now fails the build instead of shipping quietly.
 *   2. Placeholders must survive translation — a Georgian string that lost
 *      its {count} renders a literal hole.
 */
import { describe, it, expect } from "vitest";
import { en } from "@/lib/i18n/en";
import { ka } from "@/lib/i18n/ka";
import { ru } from "@/lib/i18n/ru";

const enKeys = Object.keys(en);

describe("dictionary parity", () => {
  it("Georgian covers every key", () => {
    const missing = enKeys.filter((k) => !(k in ka));
    expect(missing, `ka is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("Russian covers every key", () => {
    const missing = enKeys.filter((k) => !(k in ru));
    expect(missing, `ru is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("no dictionary carries keys English does not", () => {
    for (const [name, dict] of [["ka", ka], ["ru", ru]] as const) {
      const extra = Object.keys(dict).filter((k) => !enKeys.includes(k));
      expect(extra, `${name} has orphan keys: ${extra.join(", ")}`).toEqual([]);
    }
  });

  it("placeholders survive translation", () => {
    for (const key of enKeys) {
      const holes = (en[key as keyof typeof en].match(/\{[a-z]+\}/gi) ?? []).sort();
      for (const [name, dict] of [["ka", ka], ["ru", ru]] as const) {
        const value = (dict as Record<string, string>)[key];
        if (value === undefined) continue; // parity test reports it
        const got = (value.match(/\{[a-z]+\}/gi) ?? []).sort();
        expect(got, `${name}:${key} placeholders`).toEqual(holes);
      }
    }
  });

  it("no value is empty", () => {
    for (const [name, dict] of [["en", en], ["ka", ka], ["ru", ru]] as const) {
      for (const [k, v] of Object.entries(dict)) {
        expect((v as string).trim().length, `${name}:${k} is empty`).toBeGreaterThan(0);
      }
    }
  });
});
