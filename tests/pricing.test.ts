import { describe, it, expect } from "vitest";
import {
  computeQuote, replayQuote, validatePlanAgainstBand,
  DEFAULT_RATE_FLOORS, ENGINE_VERSION, type QuoteInputs,
} from "@/lib/pricing/engine";

/** Tbilisi → Kazbegi on a 4x4: the case that breaks naive per-km pricing. */
const kazbegi = (over: Partial<QuoteInputs> = {}): QuoteInputs => ({
  engineVersion: ENGINE_VERSION,
  currency: "GEL",
  distanceKm100: 15_600,     // 156.00 km
  driveMinutes: 195,
  returnKm100: 15_600,
  deadheadRecoveryBps: 7500, // remote: 75% of the empty return is charged
  riskFactorBps: 12_500,     // mountain route
  routeMinFareMinor: "20000",
  extraStops: 0,
  nights: 0,
  plan: {
    ratePerKmMinor: "150", ratePerMinuteMinor: "0", perStopFeeMinor: "0",
    overnightFeeMinor: "0", minimumFareMinor: "0", seasonFactorBps: 10_000,
  },
  band: { minFareFloorMinor: "6000", maxFareCeilingMinor: "200000" },
  commissionRateBps: 1500,
  roundingStepMinor: 50,
  ...over,
});

describe("distance-tiered rate floors", () => {
  /**
   * The business rule: a short trip cannot be cheap per kilometre. Under
   * 100 km the effective rate is at least 1.00 GEL/km, under 200 km at least
   * 0.90, and so on — but only ever raising a rate, never cutting one.
   */
  const cheap = (km100: number) => kazbegi({
    distanceKm100: km100, returnKm100: 0, deadheadRecoveryBps: 0,
    driveMinutes: 60, riskFactorBps: 10_000, routeMinFareMinor: "0",
    plan: { ...kazbegi().plan, ratePerKmMinor: "50" }, // 0.50 GEL — below every tier
    band: { minFareFloorMinor: "0", maxFareCeilingMinor: "10000000" },
    rateFloors: DEFAULT_RATE_FLOORS,
  });

  it("lifts a 0.50 rate to 1.00 on a 50 km trip", () => {
    const q = computeQuote(cheap(5_000));
    // 50 km at the floored 1.00 GEL/km = 50.00 GEL
    expect(q.lines.find((l) => l.code === "distance")!.amountMinor).toBe("5000");
    expect(q.lines.some((l) => l.code === "ratefloor")).toBe(true);
  });

  it("lifts to 0.90 between 100 and 200 km", () => {
    const q = computeQuote(cheap(15_000));
    expect(q.lines.find((l) => l.code === "distance")!.amountMinor).toBe("13500"); // 150 × 0.90
  });

  it("lifts to 0.80 between 200 and 300 km", () => {
    const q = computeQuote(cheap(25_000));
    expect(q.lines.find((l) => l.code === "distance")!.amountMinor).toBe("20000"); // 250 × 0.80
  });

  it("uses the open-ended tail tier beyond the ladder", () => {
    const q = computeQuote(cheap(40_000));
    expect(q.lines.find((l) => l.code === "distance")!.amountMinor).toBe("28000"); // 400 × 0.70
  });

  it("never touches a driver whose own rate beats the tier", () => {
    const q = computeQuote(kazbegi({ rateFloors: DEFAULT_RATE_FLOORS })); // 1.50 GEL/km
    expect(q.lines.some((l) => l.code === "ratefloor")).toBe(false);
  });

  /** A wait-and-return doubles the driven distance, so the tier follows it. */
  it("chooses the tier by the total driven distance on a round trip", () => {
    const oneWay = computeQuote(cheap(8_000));                       // 80 km → 1.00 tier
    const round = computeQuote({ ...cheap(8_000), roundTrip: true }); // 160 km total → 0.90 tier
    expect(oneWay.lines.find((l) => l.code === "distance")!.amountMinor).toBe("8000");   // 80 × 1.00
    expect(round.lines.find((l) => l.code === "distance")!.amountMinor).toBe("14400");   // 160 × 0.90
  });

  it("applies the floored rate to the empty return leg too", () => {
    const q = computeQuote({ ...cheap(5_000), returnKm100: 5_000, deadheadRecoveryBps: 10_000 });
    // 50 km empty return at the floored 1.00 rate, fully recovered = 50.00
    expect(q.lines.find((l) => l.code === "deadhead")!.amountMinor).toBe("5000");
  });

  it("changes nothing when no ladder is supplied — historic replay stays intact", () => {
    const withOut = computeQuote({ ...cheap(5_000), rateFloors: undefined });
    expect(withOut.lines.find((l) => l.code === "distance")!.amountMinor).toBe("2500"); // 50 × 0.50
  });
});

describe("quote engine", () => {
  it("splits commission and driver net so they always sum to gross", () => {
    const q = computeQuote(kazbegi());
    expect(BigInt(q.commissionMinor) + BigInt(q.driverNetMinor)).toBe(BigInt(q.grossMinor));
  });

  it("charges the empty return leg as an explicit, visible line", () => {
    const q = computeQuote(kazbegi());
    const deadhead = q.lines.find((l) => l.code === "deadhead");
    expect(deadhead).toBeDefined();
    // 156 km * 1.50 GEL = 234.00, of which 75% = 175.50
    expect(deadhead!.amountMinor).toBe("17550");
  });

  it("prices a short city transfer and a long remote run coherently from ONE driver rate", () => {
    // This is the failure the source specification could not express: with a
    // single per-km rate and no deadhead model, whatever rate makes Kazbegi
    // viable makes the airport run absurd.
    const rate = "150";
    const airport = computeQuote(kazbegi({
      distanceKm100: 1_800, driveMinutes: 30, returnKm100: 1_800,
      deadheadRecoveryBps: 1000, riskFactorBps: 10_000, routeMinFareMinor: "3500",
      plan: { ...kazbegi().plan, ratePerKmMinor: rate },
      // An airport transfer is quoted against the economy band, not the 4x4 one.
      band: { minFareFloorMinor: "2500", maxFareCeilingMinor: "90000" },
    }));
    const mountain = computeQuote(kazbegi({ plan: { ...kazbegi().plan, ratePerKmMinor: rate } }));

    const airportGel = Number(airport.grossMinor) / 100;
    const mountainGel = Number(mountain.grossMinor) / 100;

    // Airport transfer lands in a believable band, not inflated by a rate
    // that had to absorb a 156 km empty return.
    expect(airportGel).toBeGreaterThan(25);
    expect(airportGel).toBeLessThan(45);
    // The mountain run still covers the return leg and the risk factor.
    expect(mountainGel).toBeGreaterThan(400);
  });

  it("is deterministic — identical inputs always produce an identical price", () => {
    const inputs = kazbegi();
    const runs = Array.from({ length: 50 }, () => computeQuote(inputs).grossMinor);
    expect(new Set(runs).size).toBe(1);
  });

  it("replays a stored quote and confirms the recorded total", () => {
    const inputs = kazbegi();
    const original = computeQuote(inputs);
    const { matches, recomputed } = replayQuote(inputs, original.grossMinor);
    expect(matches).toBe(true);
    expect(recomputed.lines).toEqual(original.lines);
  });

  it("refuses to replay a quote produced by a different engine version", () => {
    expect(() => computeQuote(kazbegi({ engineVersion: "0.9.0" }))).toThrow(/version mismatch/i);
  });

  it("applies the highest applicable floor and reports it", () => {
    const q = computeQuote(kazbegi({
      distanceKm100: 100, returnKm100: 0, driveMinutes: 5,
      riskFactorBps: 10_000, routeMinFareMinor: "9000",
      band: { minFareFloorMinor: "6000", maxFareCeilingMinor: "200000" },
    }));
    expect(q.grossMinor).toBe("9000");
    expect(q.clampedBy).toBe("floor");
    expect(q.lines.some((l) => l.code === "floor")).toBe(true);
  });

  it("applies the platform ceiling so no driver can produce a runaway price", () => {
    const q = computeQuote(kazbegi({
      distanceKm100: 500_000,
      band: { minFareFloorMinor: "6000", maxFareCeilingMinor: "200000" },
    }));
    expect(q.grossMinor).toBe("200000");
    expect(q.clampedBy).toBe("ceiling");
  });

  it("rounds the customer-facing total to the configured step", () => {
    const q = computeQuote(kazbegi());
    expect(BigInt(q.grossMinor) % 50n).toBe(0n);
  });

  it("never produces negative money", () => {
    const q = computeQuote(kazbegi({ distanceKm100: 0, returnKm100: 0, driveMinutes: 1, routeMinFareMinor: "0" }));
    expect(BigInt(q.grossMinor)).toBeGreaterThanOrEqual(0n);
    expect(BigInt(q.commissionMinor)).toBeGreaterThanOrEqual(0n);
    expect(BigInt(q.driverNetMinor)).toBeGreaterThanOrEqual(0n);
  });

  it("rejects a driver price plan that escapes its class band", () => {
    const band = {
      minRatePerKmMinor: 80n, maxRatePerKmMinor: 220n,
      minFareFloorMinor: 3500n, maxFareCeilingMinor: 120_000n,
      maxOvernightMinor: 15_000n, maxSeasonFactorBps: 13_000,
    };
    expect(validatePlanAgainstBand(
      { ratePerKmMinor: 20n, minimumFareMinor: 0n, overnightFeeMinor: 0n, seasonFactorBps: 10_000 }, band,
    )).toContainEqual(expect.stringMatching(/below the platform minimum/));

    expect(validatePlanAgainstBand(
      { ratePerKmMinor: 900n, minimumFareMinor: 0n, overnightFeeMinor: 0n, seasonFactorBps: 10_000 }, band,
    )).toContainEqual(expect.stringMatching(/above the platform maximum/));

    expect(validatePlanAgainstBand(
      { ratePerKmMinor: 150n, minimumFareMinor: 0n, overnightFeeMinor: 0n, seasonFactorBps: 19_000 }, band,
    )).toContainEqual(expect.stringMatching(/season factor exceeds/i));

    expect(validatePlanAgainstBand(
      { ratePerKmMinor: 150n, minimumFareMinor: 0n, overnightFeeMinor: 0n, seasonFactorBps: 10_000 }, band,
    )).toEqual([]);
  });
});

describe("round trips (wait-and-return)", () => {
  it("costs more than one way but less than two one-way trips", () => {
    const oneWay = BigInt(computeQuote(kazbegi()).grossMinor);
    const round  = BigInt(computeQuote(kazbegi({ roundTrip: true })).grossMinor);
    expect(round).toBeGreaterThan(oneWay);
    // Two one-way bookings each pay 75% of an empty return; the round trip
    // pays neither. That saving is the whole point of the product.
    expect(round).toBeLessThan(2n * oneWay);
  });

  it("drops the deadhead line entirely — the driver returns loaded", () => {
    const q = computeQuote(kazbegi({ roundTrip: true }));
    expect(q.lines.find((l) => l.code === "deadhead")).toBeUndefined();
    const distance = q.lines.find((l) => l.code === "distance");
    expect(distance!.detail).toContain("both directions");
    // 2 × 156 km × 1.50 GEL/km = 468.00 GEL
    expect(distance!.amountMinor).toBe("46800");
  });

  it("charges overnights when the return crosses calendar days", () => {
    const withNights = computeQuote(kazbegi({ roundTrip: true, nights: 1, plan: {
      ratePerKmMinor: "150", ratePerMinuteMinor: "0", perStopFeeMinor: "0",
      overnightFeeMinor: "5000", minimumFareMinor: "0", seasonFactorBps: 10_000,
    }}));
    const overnight = withNights.lines.find((l) => l.code === "overnight");
    expect(overnight?.amountMinor).toBe("5000");
  });

  it("keeps historic one-way snapshots byte-identical (no roundTrip field)", () => {
    const a = computeQuote(kazbegi());
    const b = computeQuote(JSON.parse(JSON.stringify(kazbegi())));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.lines.find((l) => l.code === "deadhead")).toBeDefined();
  });
});
