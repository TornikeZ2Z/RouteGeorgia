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

export const SETTING_KEYS = [
  "commission_rate_bps",
  "minimum_day_fare_minor",
  // Terms the two agreements leave blank. They are commercial decisions, not
  // legal drafting, so they live here and are substituted into the contract
  // text at render time — a change of settlement cycle must not need a lawyer.
  "settlement_period_days",
  "termination_notice_days",
  "school_cancel_free_hours",
  "school_cancel_tier_a_pct",
  "school_cancel_tier_b_pct",
  "school_cancel_tier_c_pct",
  // Driver agreement 4.7 — how long a driver waits at a planned stop before
  // more time has to be agreed through us. It exists because the agreement
  // needs a number to cap an obligation against: without one, "waiting is
  // included" is an unbounded promise made to travellers and never agreed to
  // by the driver who has to honour it.
  "waiting_included_minutes",
] as const;
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

  // Driver agreement 6.5 — how often the driver is paid out. Held in days so
  // the cycle can be tuned without a new enum: 1 daily, 7 weekly, 30 monthly.
  settlement_period_days: { min: 1, max: 31, fallback: () => 7 },
  // Driver agreement 14.2 / school agreement 16.2 — notice to walk away.
  termination_notice_days: { min: 1, max: 180, fallback: () => 30 },

  // School agreement 11.2, the cancellation ladder. Hours of notice that
  // attract no charge, then three tiers of forfeited prepayment.
  school_cancel_free_hours: { min: 0, max: 720, fallback: () => 72 },
  // 72h-24h before departure.
  school_cancel_tier_a_pct: { min: 0, max: 100, fallback: () => 25 },
  // Under 24h.
  school_cancel_tier_b_pct: { min: 0, max: 100, fallback: () => 50 },
  // On the day itself.
  school_cancel_tier_c_pct: { min: 0, max: 100, fallback: () => 100 },

  // 0 to eight hours, per planned stop. Sixty minutes is the default because
  // it covers what the FAQ actually describes — photographs, a meal, a look
  // around — without binding a driver to an open-ended afternoon.
  waiting_included_minutes: { min: 0, max: 480, fallback: () => 60 },
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
 * The settlement cycle as a word rather than a number, because that is how it
 * reads in the agreement. Anything that is not a recognised cycle is described
 * by its length, so an operator who sets 10 days gets a contract that says
 * "every 10 days" rather than a blank.
 */
export function settlementPeriodLabel(days: number, locale: "ka" | "en"): string {
  const known: Record<number, { ka: string; en: string }> = {
    1: { ka: "ყოველდღიურად", en: "daily" },
    7: { ka: "ყოველკვირეულად", en: "weekly" },
    14: { ka: "ორ კვირაში ერთხელ", en: "every two weeks" },
    30: { ka: "თვეში ერთხელ", en: "monthly" },
    31: { ka: "თვეში ერთხელ", en: "monthly" },
  };
  const hit = known[days];
  if (hit) return hit[locale];
  return locale === "ka" ? `ყოველ ${days} დღეში ერთხელ` : `every ${days} days`;
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
