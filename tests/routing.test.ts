import { describe, it, expect } from "vitest";
import { haversineKm, haversineProvider, routeHashOf } from "@/lib/routing";

const TBILISI = { lat: 41.7151, lon: 44.8271 };
const BATUMI = { lat: 41.6168, lon: 41.6367 };
const AIRPORT = { lat: 41.6692, lon: 44.9547 };

describe("routing", () => {
  it("computes great-circle distance within a sensible tolerance", () => {
    // Tbilisi to Batumi is roughly 265 km straight line.
    expect(haversineKm(TBILISI, BATUMI)).toBeGreaterThan(255);
    expect(haversineKm(TBILISI, BATUMI)).toBeLessThan(275);
    expect(haversineKm(TBILISI, TBILISI)).toBe(0);
  });

  it("returns integral hundredths of a km so pricing stays deterministic", async () => {
    const e = await haversineProvider.estimate([AIRPORT, TBILISI]);
    expect(Number.isInteger(e.distanceKm100)).toBe(true);
    expect(Number.isInteger(e.returnKm100)).toBe(true);
    expect(e.driveMinutes).toBeGreaterThan(0);
  });

  it("produces a stable route hash for the same waypoints", () => {
    expect(routeHashOf([TBILISI, BATUMI])).toBe(routeHashOf([TBILISI, BATUMI]));
    expect(routeHashOf([TBILISI, BATUMI])).not.toBe(routeHashOf([BATUMI, TBILISI]));
  });

  it("refuses a route with fewer than two waypoints", async () => {
    await expect(haversineProvider.estimate([TBILISI])).rejects.toThrow();
  });
});
