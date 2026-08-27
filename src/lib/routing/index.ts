import "server-only";
/**
 * Directions provider behind an adapter.
 *
 * The default "haversine" provider needs no API key and no billing account,
 * which keeps Phase 0/1 runnable on day one. It is an estimate, not a road
 * route: swap in a real provider before taking public bookings, since quoted
 * distance is a price input and a customer-facing promise.
 */
import { createHash } from "node:crypto";
import { config } from "@/lib/config";

export interface LatLon { lat: number; lon: number }

export interface RouteEstimate {
  /** Hundredths of a km — integral, so pricing stays deterministic. */
  distanceKm100: number;
  driveMinutes: number;
  returnKm100: number;
  provider: string;
  computedAt: string;
  /** Hash of the ordered waypoints, so a stored quote can be traced back. */
  routeHash: string;
}

export interface RoutingProvider {
  readonly name: string;
  estimate(waypoints: LatLon[]): Promise<RouteEstimate>;
}

const EARTH_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function routeHashOf(waypoints: LatLon[]): string {
  const canonical = waypoints.map((w) => `${w.lat.toFixed(5)},${w.lon.toFixed(5)}`).join("|");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

/**
 * Georgian roads are mountainous and indirect. 1.35 is a deliberately blunt
 * detour factor and 52 km/h a deliberately conservative average; both are
 * tuning knobs to be replaced by measured provider data, not physics.
 */
const DETOUR_FACTOR = 1.35;
const AVERAGE_KMH = 52;

export const haversineProvider: RoutingProvider = {
  name: "haversine",
  async estimate(waypoints) {
    if (waypoints.length < 2) throw new Error("A route needs at least two waypoints.");
    let straight = 0;
    for (let i = 1; i < waypoints.length; i++) {
      straight += haversineKm(waypoints[i - 1]!, waypoints[i]!);
    }
    const roadKm = straight * DETOUR_FACTOR;
    const first = waypoints[0]!;
    const last = waypoints[waypoints.length - 1]!;
    const returnKm = haversineKm(last, first) * DETOUR_FACTOR;
    return {
      distanceKm100: Math.round(roadKm * 100),
      driveMinutes: Math.max(5, Math.round((roadKm / AVERAGE_KMH) * 60)),
      returnKm100: Math.round(returnKm * 100),
      provider: "haversine",
      computedAt: new Date().toISOString(),
      routeHash: routeHashOf(waypoints),
    };
  },
};

/**
 * OSRM over the public demo server: real road geometry, no key, no billing.
 *
 * Two requests per estimate — the loaded route with its stops, and the empty
 * return leg — because the two distances price differently. Any failure or
 * slow answer falls back to the haversine estimate: a quote that is a little
 * approximate beats a search page that 500s because a free community server
 * had a bad minute. The estimate records which provider actually answered.
 */
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const OSRM_TIMEOUT_MS = 4000;

async function osrmLeg(waypoints: LatLon[]): Promise<{ km: number; minutes: number } | null> {
  const coords = waypoints.map((w) => `${w.lon.toFixed(6)},${w.lat.toFixed(6)}`).join(";");
  try {
    const response = await fetch(`${OSRM_BASE}/${coords}?overview=false&alternatives=false`, {
      signal: AbortSignal.timeout(OSRM_TIMEOUT_MS),
      headers: { "User-Agent": "Route Planner/1.0 (routeplanner.ge)" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { code?: string; routes?: { distance: number; duration: number }[] };
    const route = data.code === "Ok" ? data.routes?.[0] : undefined;
    if (!route || !Number.isFinite(route.distance)) return null;
    return { km: route.distance / 1000, minutes: route.duration / 60 };
  } catch {
    return null;
  }
}

export const osrmProvider: RoutingProvider = {
  name: "osrm",
  async estimate(waypoints) {
    if (waypoints.length < 2) throw new Error("A route needs at least two waypoints.");
    const first = waypoints[0]!;
    const last = waypoints[waypoints.length - 1]!;

    const [loaded, returnLeg] = await Promise.all([
      osrmLeg(waypoints),
      osrmLeg([last, first]),
    ]);
    if (!loaded || !returnLeg) return haversineProvider.estimate(waypoints);

    return {
      distanceKm100: Math.round(loaded.km * 100),
      driveMinutes: Math.max(5, Math.round(loaded.minutes)),
      returnKm100: Math.round(returnLeg.km * 100),
      provider: "osrm",
      computedAt: new Date().toISOString(),
      routeHash: routeHashOf(waypoints),
    };
  },
};

/** Placeholder so the seam exists and the swap is a config change, not a refactor. */
const unimplemented = (name: string): RoutingProvider => ({
  name,
  async estimate() {
    throw new Error(
      `Routing provider "${name}" is not implemented yet. Set ROUTING_PROVIDER=haversine ` +
        `for local development, or implement src/lib/routing/index.ts before enabling it.`,
    );
  },
});

export function getRoutingProvider(): RoutingProvider {
  switch (config.routing.provider) {
    case "haversine": return haversineProvider;
    case "osrm":      return osrmProvider;
    case "google":    return unimplemented("google");
    case "mapbox":    return unimplemented("mapbox");
  }
}
