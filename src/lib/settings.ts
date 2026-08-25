import "server-only";
/**
 * Commercial settings an operator can change from the console.
 *
 * Reads are cached for a few seconds: a search page prices a dozen offers and
 * should not ask the database for the commission rate a dozen times, but an
 * operator who changes a number wants to see it take effect immediately, not
 * after a redeploy. Writes clear the cache in-process; other instances pick
 * the change up when their window lapses.
 *
 * Every value has a bound and a fallback. A row that is missing, unparseable
 * or out of range falls back to the environment default rather than pricing a
 * trip at zero commission — a settings table is not allowed to be a way to
 * break the business.
 */
import { sql } from "@db/client";
import { config } from "@/lib/config";

export const SETTING_KEYS = ["commission_rate_bps", "minimum_day_fare_minor"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export interface SettingSpec {
  /** Inclusive bounds. A value outside them is treated as corrupt. */
  min: number;
  max: number;
  fallback: () => number;
}

export const SETTING_SPECS: Record<SettingKey, SettingSpec> = {
  // 0%–50%. A platform taking more than half of a driver's fare is a typo.
  commission_rate_bps: { min: 0, max: 5000, fallback: () => config.policy.commissionRateBps },
  // Up to 5000 GEL a day in tetri; 0 disables the floor entirely.
  minimum_day_fare_minor: { min: 0, max: 500_000, fallback: () => 0 },
};

const CACHE_MS = 5_000;
let cache: { at: number; values: Record<SettingKey, number> } | null = null;

function parse(key: SettingKey, raw: string | undefined): number {
  const spec = SETTING_SPECS[key];
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) return spec.fallback();
  if (value < spec.min || value > spec.max) return spec.fallback();
  return value;
}

/** All settings at once — one query, so a page that needs several pays for one. */
export async function getSettings(): Promise<Record<SettingKey, number>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.values;

  let rows: { key: string; value: string }[] = [];
  try {
    rows = await sql<{ key: string; value: string }[]>`
      SELECT key, value FROM platform_settings WHERE key = ANY(${[...SETTING_KEYS]})`;
  } catch {
    // Table absent (a deploy that has not migrated yet) must not take pricing
    // down; every key falls back to its environment default.
    rows = [];
  }

  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const values = Object.fromEntries(
    SETTING_KEYS.map((key) => [key, parse(key, byKey.get(key))]),
  ) as Record<SettingKey, number>;

  cache = { at: Date.now(), values };
  return values;
}

/** The platform's cut, in basis points. */
export async function getCommissionRateBps(): Promise<number> {
  return (await getSettings()).commission_rate_bps;
}

/** Floor under one day of a driver's time, in minor units. 0 means no floor. */
export async function getMinimumDayFareMinor(): Promise<number> {
  return (await getSettings()).minimum_day_fare_minor;
}

/**
 * Write a setting. Returns the clamped value actually stored, or null when the
 * input is not a valid integer inside the setting's bounds — the caller shows
 * that as a form error rather than silently storing something else.
 */
export async function setSetting(
  key: SettingKey,
  value: number,
  actorUserId: string,
): Promise<number | null> {
  const spec = SETTING_SPECS[key];
  if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
  if (value < spec.min || value > spec.max) return null;

  await sql`
    INSERT INTO platform_settings (key, value, updated_by)
    VALUES (${key}, ${String(value)}, ${actorUserId}::uuid)
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`;

  cache = null;
  return value;
}

/** Test seam: forget cached values so the next read hits the database. */
export function clearSettingsCache(): void {
  cache = null;
}
