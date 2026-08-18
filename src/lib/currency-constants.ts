/**
 * Currency constants and pure helpers.
 *
 * Deliberately free of `server-only` and `next/headers` so client components
 * (the header switcher) can import them. Anything that reads a cookie or the
 * database belongs in currency.ts instead.
 */
import { divRound, type Minor } from "@/lib/money";

export const DISPLAY_CURRENCIES = ["GEL", "USD", "EUR"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

/** The currency everything is priced, charged and accounted in. */
export const CANONICAL: DisplayCurrency = "GEL";

export interface RateSnapshot {
  currency: DisplayCurrency;
  /** 1 GEL = rateMicro / 1e6 of `currency`. Always 1e6 for GEL itself. */
  rateMicro: bigint;
  asOf: Date | null;
}

export function isDisplayCurrency(v: string | undefined): v is DisplayCurrency {
  return !!v && (DISPLAY_CURRENCIES as readonly string[]).includes(v);
}

/** Convert canonical GEL minor units into the display currency's minor units. */
export function convert(amountGelMinor: Minor, rate: RateSnapshot): Minor {
  if (rate.currency === CANONICAL) return amountGelMinor;
  return divRound(amountGelMinor * rate.rateMicro, 1_000_000n);
}
