import "server-only";
import { cookies } from "next/headers";
import { sql } from "@db/client";
import { divRound, type Minor } from "@/lib/money";

/**
 * Display currency.
 *
 * GEL is the charge currency and the ledger currency. Everything else is a
 * presentational convenience computed from a timestamped snapshot, and the UI
 * must always say so — a traveller who thinks they are being charged in USD
 * and then sees a GEL card statement will open a dispute.
 */
export const DISPLAY_CURRENCIES = ["GEL", "USD", "EUR"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];
export const CANONICAL: DisplayCurrency = "GEL";

const COOKIE = "gt_currency";

export interface RateSnapshot {
  currency: DisplayCurrency;
  /** 1 GEL = rateMicro / 1e6 of `currency`. Always 1e6 for GEL itself. */
  rateMicro: bigint;
  asOf: Date | null;
}

export function isDisplayCurrency(v: string | undefined): v is DisplayCurrency {
  return !!v && (DISPLAY_CURRENCIES as readonly string[]).includes(v);
}

export async function getDisplayCurrency(): Promise<DisplayCurrency> {
  const value = (await cookies()).get(COOKIE)?.value;
  return isDisplayCurrency(value) ? value : CANONICAL;
}

/** Most recent rate for the chosen currency. Falls back to GEL if missing. */
export async function getRate(currency: DisplayCurrency): Promise<RateSnapshot> {
  if (currency === CANONICAL) return { currency, rateMicro: 1_000_000n, asOf: null };

  const rows = await sql<{ rate_micro: bigint; as_of: Date }[]>`
    SELECT rate_micro, as_of FROM exchange_rates
    WHERE base = 'GEL' AND quote = ${currency}
    ORDER BY as_of DESC LIMIT 1`;

  const row = rows[0];
  if (!row) {
    // No snapshot: show GEL rather than invent a number.
    return { currency: CANONICAL, rateMicro: 1_000_000n, asOf: null };
  }
  return { currency, rateMicro: BigInt(row.rate_micro), asOf: row.as_of };
}

/** Convert canonical GEL minor units into the display currency's minor units. */
export function convert(amountGelMinor: Minor, rate: RateSnapshot): Minor {
  if (rate.currency === CANONICAL) return amountGelMinor;
  return divRound(amountGelMinor * rate.rateMicro, 1_000_000n);
}
