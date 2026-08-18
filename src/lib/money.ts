/**
 * Money. Always integer minor units (tetri) as bigint, never float.
 *
 * Every rounding decision in the marketplace goes through this module so that
 * "why is this 0.01 different" has exactly one place to look.
 */
export type Minor = bigint;

export const BPS = 10_000n;

/** Round-half-up division for non-negative bigints. */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("divRound: denominator must be positive");
  if (numerator < 0n) {
    return -((-numerator * 2n + denominator) / (denominator * 2n));
  }
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/** Apply a basis-point factor (10000 = 1.00x) with half-up rounding. */
export function applyBps(amount: Minor, bps: number | bigint): Minor {
  return divRound(amount * BigInt(bps), BPS);
}

/** Round to the nearest step (e.g. 50 tetri = 0.50 GEL). Step 0 or 1 = no-op. */
export function roundToStep(amount: Minor, step: number | bigint): Minor {
  const s = BigInt(step);
  if (s <= 1n) return amount;
  return divRound(amount, s) * s;
}

export const maxMinor = (...values: Minor[]): Minor =>
  values.reduce((a, b) => (b > a ? b : a));
export const minMinor = (...values: Minor[]): Minor =>
  values.reduce((a, b) => (b < a ? b : a));

/** Parse "12.50" → 1250n. Rejects anything that is not plain decimal money. */
export function parseMajor(input: string, decimals = 2): Minor {
  const trimmed = input.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Not a valid money amount: "${input}"`);
  const negative = trimmed.startsWith("-");
  const [whole = "0", frac = ""] = trimmed.replace("-", "").split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const value = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
  return negative ? -value : value;
}

/** 1250n → "12.50" */
export function toMajorString(amount: Minor, decimals = 2): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const unit = 10n ** BigInt(decimals);
  const whole = abs / unit;
  const frac = (abs % unit).toString().padStart(decimals, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

export function formatMoney(amount: Minor, currency = "GEL", locale = "en"): string {
  const value = Number(toMajorString(amount));
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency", currency, maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${toMajorString(amount)} ${currency}`;
  }
}

/** JSON-safe money for storage in immutable snapshots. */
export const serializeMinor = (v: Minor): string => v.toString();
export const deserializeMinor = (v: string | number | bigint): Minor => BigInt(v);
