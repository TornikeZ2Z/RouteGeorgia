/**
 * Quote engine.
 *
 * DESIGN NOTE — deviation from the source specification.
 * ------------------------------------------------------
 * The original spec priced every trip as:
 *
 *     route_cost = max(min, distance_km * rate_per_km + minutes * rate_per_min)
 *     gross      = route_cost * vehicle_factor * risk * season + addons
 *
 * That cannot express Georgian intercity economics. On a one-way A→B run the
 * driver must return empty, and the empty return is often the single largest
 * cost. With one per-km rate a driver can only cover it by inflating the rate,
 * which then massively overprices short trips (Tbilisi→Mtskheta) using the
 * same number that makes long trips (Tbilisi→Batumi) viable.
 *
 * So the return leg is modelled explicitly:
 *
 *     return_km  — how far the driver must deadhead back, per route family
 *     recovery   — what share of that the customer pays (basis points)
 *
 * A city transfer sets recovery near 0 (the driver picks up other work).
 * A remote mountain run sets it near 10000 (nobody is going to hire them in
 * Ushguli for the trip home). Both use the driver's honest per-km rate.
 *
 * `vehicle_factor` was also dropped: the price plan is attached to a specific
 * vehicle and the driver already sets their rate for that vehicle, so applying
 * a class multiplier on top double-counts. Class instead selects the price
 * BAND that constrains what the driver may charge.
 *
 * DETERMINISM CONTRACT
 * --------------------
 * computeQuote() is pure. Given identical QuoteInputs it must return an
 * identical QuoteBreakdown forever, for any ENGINE_VERSION it claims to
 * support. Quotes persist their inputs so support can replay a disputed price
 * months later. tests/pricing.test.ts enforces this.
 */
import { applyBps, divRound, maxMinor, minMinor, roundToStep, type Minor } from "@/lib/money";

export const ENGINE_VERSION = "1.2.0";

/**
 * Distance-tiered minimum per-km rates (engine 1.1.0).
 *
 * A short trip cannot be cheap per kilometre: the driver still had to get to
 * the pickup, wait, and find the next job. So the shorter the trip, the
 * higher the floor under the per-km rate. A driver whose own rate is higher
 * is untouched — this only lifts rates that would undercut the tier.
 *
 * Tiers are chosen by the TOTAL loaded distance (both directions on a
 * wait-and-return), in ascending order; the first tier whose maxKm100 exceeds
 * the trip applies. The last tier is the open-ended tail.
 */
export const DEFAULT_RATE_FLOORS: { maxKm100: number; minRatePerKmMinor: string }[] = [
  { maxKm100: 10_000, minRatePerKmMinor: "100" }, // under 100 km: at least 1.00 GEL/km
  { maxKm100: 20_000, minRatePerKmMinor: "90" },  // under 200 km: at least 0.90
  { maxKm100: 30_000, minRatePerKmMinor: "80" },  // under 300 km: at least 0.80
  { maxKm100: Number.MAX_SAFE_INTEGER, minRatePerKmMinor: "70" },
];

/** All money fields are decimal strings so the snapshot survives JSON. */
export interface QuoteInputs {
  engineVersion: string;
  currency: string;
  /** Route geometry, in hundredths of a km to stay integral. */
  distanceKm100: number;
  driveMinutes: number;
  returnKm100: number;
  deadheadRecoveryBps: number;
  riskFactorBps: number;
  routeMinFareMinor: string;
  extraStops: number;
  nights: number;
  /**
   * Days of the driver's time this booking occupies, for day-based work —
   * tours and multi-day hire. 0 (or absent) means the booking is a transfer:
   * it is priced by distance and the day floor never applies to it.
   */
  days?: number;
  /**
   * Floor under ONE day of a driver's time, in minor units, independent of
   * distance. A driver who gives up a day to sit in Ushguli has earned a day
   * whether the itinerary drove 40 km or 300. 0 disables it.
   */
  minimumDayFareMinor?: string;
  /**
   * Wait-and-return trip: both directions are billed at the driver's rate and
   * the deadhead line disappears (the driver comes home loaded). Optional and
   * absent from every pre-existing snapshot, so historic quotes replay
   * byte-identically under the same engine version.
   */
  roundTrip?: boolean;
  plan: {
    ratePerKmMinor: string;
    ratePerMinuteMinor: string;
    perStopFeeMinor: string;
    overnightFeeMinor: string;
    minimumFareMinor: string;
    seasonFactorBps: number;
  };
  band: {
    minFareFloorMinor: string;
    maxFareCeilingMinor: string;
  };
  commissionRateBps: number;
  roundingStepMinor: number;
  /**
   * Distance-tiered floors under the per-km rate. Optional and snapshotted
   * with the quote, so a stored price replays with the ladder that priced it,
   * not whatever the ladder says today.
   */
  rateFloors?: { maxKm100: number; minRatePerKmMinor: string }[];
}

export interface QuoteLine {
  code: "distance" | "deadhead" | "time" | "stops" | "overnight" | "risk" | "season" | "floor" | "ceiling" | "rounding" | "ratefloor";
  label: string;
  amountMinor: string;
  /** Human-readable justification shown to drivers and support, not customers. */
  detail?: string;
}

export interface QuoteBreakdown {
  engineVersion: string;
  currency: string;
  lines: QuoteLine[];
  subtotalMinor: string;
  grossMinor: string;
  commissionRateBps: number;
  commissionMinor: string;
  driverNetMinor: string;
  /** True when a floor or ceiling changed the computed price. */
  clampedBy: "none" | "floor" | "ceiling";
}

const B = (v: string | number): Minor => BigInt(v);

export function computeQuote(inputs: QuoteInputs): QuoteBreakdown {
  if (inputs.engineVersion !== ENGINE_VERSION) {
    throw new Error(
      `Quote engine version mismatch: snapshot is ${inputs.engineVersion}, this build is ${ENGINE_VERSION}. ` +
        `Historic quotes must be replayed with the engine that produced them.`,
    );
  }

  const lines: QuoteLine[] = [];
  const directions = inputs.roundTrip ? 2n : 1n;

  // Distance tier first: the floor under the per-km rate depends on how far
  // the whole trip actually goes.
  const driverRate = B(inputs.plan.ratePerKmMinor);
  const billedKm100 = Number(directions) * inputs.distanceKm100;
  const tier = (inputs.rateFloors ?? []).find((f) => billedKm100 < f.maxKm100);
  const tierRate = tier ? B(tier.minRatePerKmMinor) : 0n;
  const ratePerKm = driverRate >= tierRate ? driverRate : tierRate;
  if (ratePerKm !== driverRate) {
    lines.push({
      code: "ratefloor",
      label: "Distance minimum rate",
      amountMinor: "0",
      detail: `rate raised from ${inputs.plan.ratePerKmMinor} to ${ratePerKm} minor/km for a ${(billedKm100 / 100).toFixed(0)} km trip`,
    });
  }

  // 1. Loaded distance. km100 is hundredths of a km, so divide it back out.
  //    A round trip drives the route twice with the customer aboard.
  const distance = divRound(directions * BigInt(inputs.distanceKm100) * ratePerKm, 100n);
  lines.push({
    code: "distance",
    label: "Distance",
    amountMinor: distance.toString(),
    detail: `${(inputs.distanceKm100 / 100).toFixed(2)} km at driver rate${inputs.roundTrip ? ", both directions" : ""}`,
  });

  // 2. Empty return leg, at the recovery share configured for this corridor.
  //    On a round trip there is no empty return — the driver comes home paid —
  //    which is exactly why wait-and-return beats two one-way bookings.
  const deadheadFull = inputs.roundTrip ? 0n : divRound(BigInt(inputs.returnKm100) * ratePerKm, 100n);
  const deadhead = applyBps(deadheadFull, inputs.deadheadRecoveryBps);
  if (deadhead > 0n) {
    lines.push({
      code: "deadhead",
      label: "Return leg",
      amountMinor: deadhead.toString(),
      detail: `${(inputs.returnKm100 / 100).toFixed(2)} km empty return, ${(inputs.deadheadRecoveryBps / 100).toFixed(0)}% recovered`,
    });
  }

  // 3. Driving time (covers slow mountain roads that distance alone misses).
  const time = directions * BigInt(inputs.driveMinutes) * B(inputs.plan.ratePerMinuteMinor);
  if (time > 0n) {
    lines.push({
      code: "time", label: "Driving time", amountMinor: time.toString(),
      detail: `${inputs.roundTrip ? inputs.driveMinutes * 2 : inputs.driveMinutes} min`,
    });
  }

  // 4. Extra stops and overnight stays.
  const stops = BigInt(inputs.extraStops) * B(inputs.plan.perStopFeeMinor);
  if (stops > 0n) {
    lines.push({ code: "stops", label: "Extra stops", amountMinor: stops.toString(), detail: `${inputs.extraStops} stop(s)` });
  }
  const overnight = BigInt(inputs.nights) * B(inputs.plan.overnightFeeMinor);
  if (overnight > 0n) {
    lines.push({ code: "overnight", label: "Overnight", amountMinor: overnight.toString(), detail: `${inputs.nights} night(s)` });
  }

  const subtotal = distance + deadhead + time + stops + overnight;

  // 5. Route risk (mountain, winter, border) then seasonal demand.
  const afterRisk = applyBps(subtotal, inputs.riskFactorBps);
  if (afterRisk !== subtotal) {
    lines.push({
      code: "risk",
      label: "Route conditions",
      amountMinor: (afterRisk - subtotal).toString(),
      detail: `${(inputs.riskFactorBps / 100).toFixed(2)}% of subtotal`,
    });
  }
  const afterSeason = applyBps(afterRisk, inputs.plan.seasonFactorBps);
  if (afterSeason !== afterRisk) {
    lines.push({
      code: "season",
      label: "Season",
      amountMinor: (afterSeason - afterRisk).toString(),
      detail: `${(inputs.plan.seasonFactorBps / 100).toFixed(2)}% of subtotal`,
    });
  }

  // 6. Floors: driver minimum, route minimum, platform band floor, and — for
  //    day-based work only — the per-day floor, which ignores distance
  //    entirely. A three-day tour that barely moves still owes three days.
  const days = Math.max(0, Math.trunc(inputs.days ?? 0));
  const dayFloor = days > 0 ? BigInt(days) * B(inputs.minimumDayFareMinor ?? "0") : 0n;
  const floor = maxMinor(
    B(inputs.plan.minimumFareMinor),
    B(inputs.routeMinFareMinor),
    B(inputs.band.minFareFloorMinor),
    dayFloor,
  );
  const ceiling = B(inputs.band.maxFareCeilingMinor);

  let clampedBy: QuoteBreakdown["clampedBy"] = "none";
  let clamped = afterSeason;
  if (clamped < floor) {
    const byDay = dayFloor === floor && dayFloor > 0n;
    lines.push({
      code: "floor",
      label: byDay ? "Minimum per day" : "Minimum fare",
      amountMinor: (floor - clamped).toString(),
      detail: byDay
        ? `${days} day(s) at the platform day minimum, distance not counted`
        : "platform or driver minimum applied",
    });
    clamped = floor;
    clampedBy = "floor";
  } else if (ceiling > 0n && clamped > ceiling) {
    lines.push({ code: "ceiling", label: "Price ceiling", amountMinor: (ceiling - clamped).toString(), detail: "platform maximum applied" });
    clamped = ceiling;
    clampedBy = "ceiling";
  }

  // 7. Round the customer-facing number to a clean step.
  const gross = roundToStep(clamped, inputs.roundingStepMinor);
  if (gross !== clamped) {
    lines.push({ code: "rounding", label: "Rounding", amountMinor: (gross - clamped).toString() });
  }

  // 8. Split. commission + net === gross by construction, never recomputed.
  const commission = applyBps(gross, inputs.commissionRateBps);
  const driverNet = gross - commission;

  return {
    engineVersion: ENGINE_VERSION,
    currency: inputs.currency,
    lines,
    subtotalMinor: subtotal.toString(),
    grossMinor: gross.toString(),
    commissionRateBps: inputs.commissionRateBps,
    commissionMinor: commission.toString(),
    driverNetMinor: driverNet.toString(),
    clampedBy,
  };
}

/**
 * Replay a stored quote and confirm it still produces the recorded total.
 * Support uses this to answer "was this customer charged correctly?".
 */
export function replayQuote(
  inputs: QuoteInputs,
  recordedGrossMinor: string,
): { matches: boolean; recomputed: QuoteBreakdown } {
  const recomputed = computeQuote(inputs);
  return { matches: recomputed.grossMinor === recordedGrossMinor, recomputed };
}

/** Guardrail check used before a driver's price plan may become ACTIVE. */
export function validatePlanAgainstBand(
  plan: { ratePerKmMinor: Minor; minimumFareMinor: Minor; overnightFeeMinor: Minor; seasonFactorBps: number },
  band: {
    minRatePerKmMinor: Minor; maxRatePerKmMinor: Minor;
    minFareFloorMinor: Minor; maxFareCeilingMinor: Minor;
    maxOvernightMinor: Minor; maxSeasonFactorBps: number;
  },
): string[] {
  const errors: string[] = [];
  if (plan.ratePerKmMinor < band.minRatePerKmMinor) errors.push("Rate per km is below the platform minimum for this vehicle class.");
  if (plan.ratePerKmMinor > band.maxRatePerKmMinor) errors.push("Rate per km is above the platform maximum for this vehicle class.");
  if (plan.minimumFareMinor > band.maxFareCeilingMinor) errors.push("Minimum fare exceeds the platform price ceiling.");
  if (plan.overnightFeeMinor > band.maxOvernightMinor) errors.push("Overnight fee exceeds the platform maximum.");
  if (plan.seasonFactorBps > band.maxSeasonFactorBps) errors.push("Season factor exceeds the platform maximum.");
  if (plan.seasonFactorBps < 8000) errors.push("Season factor cannot discount below 80%.");
  return errors;
}

export const clampToBand = minMinor;
