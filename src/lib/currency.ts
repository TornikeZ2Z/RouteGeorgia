import "server-only";
import { cookies } from "next/headers";
import { sql } from "@db/client";
import {
  CANONICAL, DISPLAY_CURRENCIES, isDisplayCurrency,
  type DisplayCurrency, type RateSnapshot,
} from "@/lib/currency-constants";

/**
 * Display currency.
 *
 * GEL is the charge currency and the ledger currency. Everything else is a
 * presentational convenience computed from a timestamped snapshot, and the UI
 * must always say so — a traveller who thinks they are being charged in USD
 * and then sees a GEL card statement will open a dispute.
 */
export { CANONICAL, DISPLAY_CURRENCIES, isDisplayCurrency, convert } from "@/lib/currency-constants";
export type { DisplayCurrency, RateSnapshot } from "@/lib/currency-constants";

const COOKIE = "gt_currency";

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
  // No snapshot: show GEL rather than invent a number.
  if (!row) return { currency: CANONICAL, rateMicro: 1_000_000n, asOf: null };
  return { currency, rateMicro: BigInt(row.rate_micro), asOf: row.as_of };
}

void DISPLAY_CURRENCIES;
