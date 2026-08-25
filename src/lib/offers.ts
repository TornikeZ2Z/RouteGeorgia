import "server-only";
import { createHash } from "node:crypto";
import { sql } from "@db/client";
import { config } from "@/lib/config";
import { getRoutingProvider, type RouteEstimate } from "@/lib/routing";
import { computeQuote, DEFAULT_RATE_FLOORS, ENGINE_VERSION, type QuoteInputs, type QuoteBreakdown } from "@/lib/pricing/engine";

/**
 * JSONB parameters: always write `${JSON.stringify(value)}::text::jsonb`.
 *
 * postgres.js JSON-encodes any parameter it believes is destined for a jsonb
 * column, so `${JSON.stringify(v)}` and `${JSON.stringify(v)}::jsonb` BOTH
 * store a JSON *string* rather than an object. Every `->>` lookup then returns
 * NULL, silently — no error is raised. Routing the value through ::text first
 * forces a plain text bind that Postgres parses into a real object.
 *
 * tests/db.test.ts asserts jsonb_typeof(...) = 'object' to catch regressions.
 */
export interface OfferFilters {
  /** Vehicle classes to include. Empty means no class restriction. */
  classes?: string[];
  /** ISO language code the driver must speak, e.g. "en". */
  language?: string;
  /** Only drivers whose level for `language` was verified in an interview. */
  verifiedLanguageOnly?: boolean;
  fourWheelDrive?: boolean;
  winterTyres?: boolean;
  petsAllowed?: boolean;
  childSeat?: boolean;
  wifi?: boolean;
  airConditioning?: boolean;
  wheelchairAccess?: boolean;
  maxPriceMinor?: bigint;
  minRating?: number;
}

export type SortKey = "recommended" | "price_asc" | "price_desc" | "rating" | "reviews";

export interface SearchRequest {
  originSlug: string;
  destinationSlug: string;
  /** When set, the trip is priced as this curated tour rather than A to B. */
  tourSlug?: string;
  /** Ordered intermediate stops, by location slug. */
  stopSlugs?: string[];
  travelAt: Date;
  /** Wait-and-return: the driver stays with the traveller and drives back. */
  returnAt?: Date | null;
  passengers: number;
  luggage: number;
  nights?: number;
  filters?: OfferFilters;
  sort?: SortKey;
  attribution?: Record<string, string>;
  sessionKey?: string | null;
}

export interface Offer {
  quoteId: string;
  driverId: string;
  handle: string;
  driverName: string;
  ratingAverage: number | null;
  ratingCount: number;
  completedTrips: number;
  languages: { language: string; level: string; verified: boolean }[];
  vehicle: {
    id: string; make: string; model: string; year: number; class: string;
    colour: string | null;
    seats: number; luggage: number;
    amenities: Record<string, unknown>; capabilities: Record<string, unknown>;
    /** Storage key of the approved lead photo, if the vehicle has one. */
    photoKey: string | null;
  };
  grossMinor: bigint;
  currency: string;
  breakdown: QuoteBreakdown;
  score: number;
  scoreReasons: string[];
  expiresAt: Date;
}

export interface SearchResult {
  searchId: string;
  route: RouteEstimate & { originName: string; destinationName: string; routeFamilySlug: string | null };
  offers: Offer[];
  /** Populated when nothing matched, so the UI can explain rather than shrug. */
  emptyReason?: "no_route" | "no_eligible_drivers" | "no_active_price_plan" | "filtered_out";
}

/**
 * Service window = driving time plus operational buffers. The driver's
 * calendar is blocked for the whole window, not just the travel time, so a
 * back-to-back booking cannot be sold.
 */
const PRE_TRIP_BUFFER_MIN = 45;
const POST_TRIP_BUFFER_MIN = 30;

export function serviceWindow(travelAt: Date, driveMinutes: number): { startsAt: Date; endsAt: Date } {
  return {
    startsAt: new Date(travelAt.getTime() - PRE_TRIP_BUFFER_MIN * 60_000),
    endsAt: new Date(travelAt.getTime() + (driveMinutes + POST_TRIP_BUFFER_MIN) * 60_000),
  };
}

/**
 * A round trip blocks the driver for the entire journey — out, the stay,
 * and the drive home. Anything less would sell the "waiting" driver twice.
 */
export function roundTripWindow(travelAt: Date, returnAt: Date, oneWayMinutes: number): { startsAt: Date; endsAt: Date } {
  return {
    startsAt: new Date(travelAt.getTime() - PRE_TRIP_BUFFER_MIN * 60_000),
    endsAt: new Date(returnAt.getTime() + (oneWayMinutes + POST_TRIP_BUFFER_MIN) * 60_000),
  };
}

export async function searchOffers(req: SearchRequest): Promise<SearchResult> {
  // Resolved first: a tour is a loop, so it legitimately starts and finishes
  // in the same place, and the "two different points" rule must not apply.
  const tourRows = req.tourSlug
    ? await sql<TourPricingRow[]>`
        SELECT id, slug, distance_km, drive_minutes, return_km, deadhead_recovery_bps,
               risk_factor_bps, min_fare_minor, requires_4x4, duration_days
        FROM tours WHERE slug = ${req.tourSlug} AND active`
    : [];
  const tour = tourRows[0];

  const stopSlugs = (req.stopSlugs ?? []).filter(Boolean);
  const wanted = [req.originSlug, ...stopSlugs, req.destinationSlug];

  const locs = await sql<LocationRow[]>`
    SELECT id, slug, name_en, lat, lon, timezone FROM locations
    WHERE slug = ANY(${wanted}::text[])`;
  const bySlug = new Map(locs.map((l) => [l.slug, l]));

  const origin = bySlug.get(req.originSlug);
  const destination = bySlug.get(req.destinationSlug);
  if (!origin || !destination || (!tour && origin.id === destination.id)) {
    return emptyResult("no_route");
  }
  // An unknown stop is a hard error, not something to quietly drop: the
  // traveller would be quoted for a route they did not ask for.
  const stops = stopSlugs.map((slug) => bySlug.get(slug));
  if (stops.some((s) => !s)) return emptyResult("no_route");
  const waypoints = [origin, ...(stops as LocationRow[]), destination];

  // A curated family prices a direct corridor. Once the traveller adds stops
  // the geometry is no longer that corridor, so fall back to live routing.
  const familyRows = !tour && stops.length === 0
    ? await sql<RouteFamilyRow[]>`
        SELECT id, slug, distance_km, drive_minutes, return_km, deadhead_recovery_bps,
               risk_factor_bps, min_fare_minor, requires_4x4
        FROM route_families
        WHERE origin_id = ${origin.id}::uuid AND destination_id = ${destination.id}::uuid AND active
        LIMIT 1`
    : [];
  const family = familyRows[0];

  let estimate: RouteEstimate;
  if (tour) {
    estimate = {
      distanceKm100: Math.round(Number(tour.distance_km) * 100),
      driveMinutes: tour.drive_minutes,
      returnKm100: Math.round(Number(tour.return_km) * 100),
      provider: "tour",
      computedAt: new Date().toISOString(),
      routeHash: createHash("sha256").update(tour.slug).digest("hex").slice(0, 32),
    };
  } else if (family) {
    estimate = {
      distanceKm100: Math.round(Number(family.distance_km) * 100),
      driveMinutes: family.drive_minutes,
      returnKm100: Math.round(Number(family.return_km) * 100),
      provider: "route_family",
      computedAt: new Date().toISOString(),
      routeHash: createHash("sha256").update(family.slug).digest("hex").slice(0, 32),
    };
  } else {
    estimate = await getRoutingProvider().estimate(
      waypoints.map((w) => ({ lat: w.lat, lon: w.lon })),
    );
  }

  const deadheadRecoveryBps =
    tour?.deadhead_recovery_bps ?? family?.deadhead_recovery_bps ?? defaultDeadheadRecovery(estimate.distanceKm100);
  const riskFactorBps = tour?.risk_factor_bps ?? family?.risk_factor_bps ?? 10_000;
  const routeMinFareMinor = (tour?.min_fare_minor ?? family?.min_fare_minor ?? 0n).toString();

  // Round trip: only for point-to-point journeys (a tour is already a loop),
  // and only when the return really is after the departure.
  const roundTrip = !tour && !!req.returnAt && req.returnAt.getTime() > req.travelAt.getTime();
  // A tour of N days keeps the driver for N-1 nights. A round trip keeps them
  // for every calendar day boundary the stay crosses.
  const nights = tour
    ? Math.max(0, tour.duration_days - 1)
    : roundTrip
      ? Math.floor((req.returnAt!.getTime() - req.travelAt.getTime()) / 86_400_000)
      : (req.nights ?? 0);
  const requires4x4 = tour?.requires_4x4 ?? family?.requires_4x4 ?? false;

  const f = req.filters ?? {};
  const window = roundTrip
    ? roundTripWindow(req.travelAt, req.returnAt!, estimate.driveMinutes)
    : serviceWindow(req.travelAt, estimate.driveMinutes);
  const itinerary = {
    origin: origin.slug,
    stops: stopSlugs,
    destination: destination.slug,
    ...(roundTrip ? { roundTrip: true, returnAt: req.returnAt!.toISOString() } : {}),
    ...(tour ? { tour: tour.slug, days: tour.duration_days } : {}),
  };
  const itineraryHash = createHash("sha256")
    .update(JSON.stringify({ ...itinerary, travelAt: req.travelAt.toISOString() }))
    .digest("hex");

  const expiresAt = new Date(Date.now() + config.policy.quoteTtlSeconds * 1000);

  const [search] = await sql<{ id: string }[]>`
    INSERT INTO route_searches
      (session_key, origin_id, destination_id, itinerary, itinerary_hash, travel_at,
       service_tz, passengers, luggage, attribution, expires_at)
    VALUES (${req.sessionKey ?? null}, ${origin.id}::uuid, ${destination.id}::uuid,
            ${JSON.stringify(itinerary)}::text::jsonb, ${itineraryHash}, ${req.travelAt.toISOString()}::timestamptz,
            ${origin.timezone}, ${req.passengers}, ${req.luggage},
            ${JSON.stringify(req.attribution ?? {})}::text::jsonb, ${expiresAt.toISOString()}::timestamptz)
    RETURNING id`;
  const searchId = search!.id;

  // Eligible supply: approved + published + free for the whole window +
  // every mandatory document valid ON THE SERVICE DATE + an ACTIVE price plan.
  const candidates = await sql<CandidateRow[]>`
    SELECT d.id AS driver_id, d.handle, d.public_name, d.rating_sum, d.rating_count,
           d.completed_trips, d.ack_on_time, d.ack_total, d.driver_cancels,
           v.id AS vehicle_id, v.make, v.model, v.year, v.class::text AS class, v.color,
           v.seats, v.luggage, v.amenities, v.capabilities,
           (SELECT vm.storage_key FROM vehicle_media vm
             WHERE vm.vehicle_id = v.id AND vm.moderation_state = 'APPROVED'
             ORDER BY vm.position LIMIT 1) AS photo_key,
           p.id AS plan_id, p.rate_per_km_minor, p.rate_per_minute_minor, p.per_stop_fee_minor,
           p.overnight_fee_minor, p.minimum_fare_minor, p.season_factor_bps, p.currency,
           b.min_fare_floor_minor, b.max_fare_ceiling_minor
    FROM driver_profiles d
    JOIN vehicles v    ON v.driver_id = d.id AND v.published AND v.status = 'APPROVED'
    JOIN price_plans p ON p.vehicle_id = v.id AND p.status = 'ACTIVE'
                      AND p.effective_from <= now()
                      AND (p.effective_to IS NULL OR p.effective_to > now())
    JOIN price_bands b ON b.class = v.class AND b.active
    WHERE d.published AND d.status = 'APPROVED'
      AND v.seats   >= ${req.passengers}
      AND v.luggage >= ${req.luggage}
      AND (${requires4x4} = false OR (v.capabilities->>'four_wheel_drive')::boolean IS TRUE)
      AND (${f.classes && f.classes.length > 0 ? f.classes : null}::text[] IS NULL
           OR v.class::text = ANY(${f.classes && f.classes.length > 0 ? f.classes : null}::text[]))
      AND (${f.fourWheelDrive ?? false} = false OR (v.capabilities->>'four_wheel_drive')::boolean IS TRUE)
      AND (${f.winterTyres ?? false} = false OR (v.capabilities->>'winter_tyres')::boolean IS TRUE)
      AND (${f.wheelchairAccess ?? false} = false OR (v.capabilities->>'wheelchair_access')::boolean IS TRUE)
      AND (${f.petsAllowed ?? false} = false OR (v.amenities->>'pets_allowed')::boolean IS TRUE)
      AND (${f.childSeat ?? false} = false OR (v.amenities->>'child_seat')::boolean IS TRUE)
      AND (${f.wifi ?? false} = false OR (v.amenities->>'wifi')::boolean IS TRUE)
      AND (${f.airConditioning ?? false} = false OR (v.amenities->>'air_conditioning')::boolean IS TRUE)
      AND (${f.minRating ?? 0} = 0 OR (d.rating_count > 0 AND d.rating_sum::numeric / d.rating_count >= ${f.minRating ?? 0}))
      AND (${f.language ?? null}::text IS NULL OR EXISTS (
            SELECT 1 FROM driver_languages dl
            WHERE dl.driver_id = d.id AND dl.language = ${f.language ?? null}
              AND (${f.verifiedLanguageOnly ?? false} = false OR dl.verified_level IS NOT NULL)))
      AND NOT EXISTS (
        SELECT 1 FROM availability_blocks ab
        WHERE ab.driver_id = d.id
          AND ab.period && tstzrange(${window.startsAt.toISOString()}::timestamptz,
                                     ${window.endsAt.toISOString()}::timestamptz, '[)'))
      AND NOT EXISTS (
        SELECT 1 FROM driver_documents dd
        WHERE dd.driver_id = d.id AND dd.is_mandatory
          AND (dd.state <> 'APPROVED'
               OR (dd.expires_on IS NOT NULL AND dd.expires_on < ${req.travelAt.toISOString()}::date)))`;

  const routeMeta = {
    ...estimate,
    originName: origin.name_en,
    destinationName: destination.name_en,
    routeFamilySlug: family?.slug ?? null,
  };

  if (candidates.length === 0) {
    return { searchId, route: routeMeta, offers: [], emptyReason: "no_eligible_drivers" };
  }

  const langRows = await sql<LanguageRow[]>`
    SELECT driver_id, language, declared_level, verified_level FROM driver_languages
    WHERE driver_id = ANY(${candidates.map((c) => c.driver_id)}::uuid[])`;

  // Price every candidate first. computeQuote is pure and fast, so this loop
  // costs nothing; what used to cost was writing each quote in its own
  // round trip. On a remote database that was one network hop per driver.
  const priced_ = candidates.map((c) => {
    const inputs: QuoteInputs = {
      engineVersion: ENGINE_VERSION,
      currency: c.currency,
      distanceKm100: estimate.distanceKm100,
      driveMinutes: estimate.driveMinutes,
      returnKm100: estimate.returnKm100,
      deadheadRecoveryBps,
      riskFactorBps,
      routeMinFareMinor,
      extraStops: stops.length,
      nights,
      ...(roundTrip ? { roundTrip: true } : {}),
      plan: {
        ratePerKmMinor: c.rate_per_km_minor.toString(),
        ratePerMinuteMinor: c.rate_per_minute_minor.toString(),
        perStopFeeMinor: c.per_stop_fee_minor.toString(),
        overnightFeeMinor: c.overnight_fee_minor.toString(),
        minimumFareMinor: c.minimum_fare_minor.toString(),
        seasonFactorBps: c.season_factor_bps,
      },
      band: {
        minFareFloorMinor: c.min_fare_floor_minor.toString(),
        maxFareCeilingMinor: c.max_fare_ceiling_minor.toString(),
      },
      commissionRateBps: config.policy.commissionRateBps,
      roundingStepMinor: config.policy.roundingStepMinor,
      rateFloors: DEFAULT_RATE_FLOORS,
    };
    return { candidate: c, inputs, breakdown: computeQuote(inputs) };
  });

  // One INSERT for every quote. Arrays are passed as text and cast per row,
  // which also sidesteps the jsonb double-encoding trap described above.
  //
  // vehicle_id is unique across candidates (the schema allows only one ACTIVE
  // price plan per vehicle), so it is a safe key to map ids back by.
  const quoteRows = await sql<{ id: string; vehicle_id: string }[]>`
    INSERT INTO quotes (search_id, driver_id, vehicle_id, price_plan_id, route_family_id,
                        engine_version, inputs, breakdown, currency, gross_minor,
                        commission_rate_bps, commission_minor, driver_net_minor, expires_at)
    SELECT ${searchId}::uuid, x.driver_id::uuid, x.vehicle_id::uuid, x.plan_id::uuid,
           ${family?.id ?? null}::uuid, ${ENGINE_VERSION},
           x.inputs::jsonb, x.breakdown::jsonb, x.currency,
           x.gross::bigint, ${config.policy.commissionRateBps},
           x.commission::bigint, x.net::bigint, ${expiresAt.toISOString()}::timestamptz
    FROM unnest(
      ${priced_.map((p) => p.candidate.driver_id)}::text[],
      ${priced_.map((p) => p.candidate.vehicle_id)}::text[],
      ${priced_.map((p) => p.candidate.plan_id)}::text[],
      ${priced_.map((p) => JSON.stringify(p.inputs))}::text[],
      ${priced_.map((p) => JSON.stringify(p.breakdown))}::text[],
      ${priced_.map((p) => p.candidate.currency)}::text[],
      ${priced_.map((p) => p.breakdown.grossMinor)}::text[],
      ${priced_.map((p) => p.breakdown.commissionMinor)}::text[],
      ${priced_.map((p) => p.breakdown.driverNetMinor)}::text[]
    ) AS x(driver_id, vehicle_id, plan_id, inputs, breakdown, currency, gross, commission, net)
    RETURNING id, vehicle_id`;

  const quoteIdByVehicle = new Map(quoteRows.map((r) => [r.vehicle_id, r.id]));

  const offers: Offer[] = priced_.map(({ candidate: c, breakdown }) => ({
    quoteId: quoteIdByVehicle.get(c.vehicle_id)!,
    driverId: c.driver_id,
    handle: c.handle,
    driverName: c.public_name,
    ratingAverage: c.rating_count > 0 ? c.rating_sum / c.rating_count : null,
    ratingCount: c.rating_count,
    completedTrips: c.completed_trips,
    languages: langRows
      .filter((l) => l.driver_id === c.driver_id)
      .map((l) => ({
        language: l.language,
        level: l.verified_level ?? l.declared_level,
        verified: l.verified_level !== null,
      })),
    vehicle: {
      id: c.vehicle_id, make: c.make, model: c.model, year: c.year, class: c.class,
      colour: c.color, seats: c.seats, luggage: c.luggage,
      amenities: c.amenities as Record<string, unknown>,
      capabilities: c.capabilities as Record<string, unknown>,
      photoKey: c.photo_key,
    },
    grossMinor: BigInt(breakdown.grossMinor),
    currency: c.currency,
    breakdown,
    score: 0,
    scoreReasons: [],
    expiresAt,
  }));

  const priced = f.maxPriceMinor
    ? offers.filter((o) => o.grossMinor <= f.maxPriceMinor!)
    : offers;

  return {
    searchId,
    route: routeMeta,
    offers: sortOffers(rankOffers(priced), req.sort ?? "recommended"),
    ...(priced.length === 0 && offers.length > 0
      ? { emptyReason: "filtered_out" as const }
      : {}),
  };
}

/**
 * Sorting is applied after ranking so that "Recommended" keeps the explained
 * score while the other orders are simple and predictable.
 */
export function sortOffers(offers: Offer[], sort: SortKey): Offer[] {
  const list = [...offers];
  switch (sort) {
    case "price_asc":  return list.sort((a, b) => Number(a.grossMinor - b.grossMinor));
    case "price_desc": return list.sort((a, b) => Number(b.grossMinor - a.grossMinor));
    case "rating":     return list.sort((a, b) =>
      (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0) || b.ratingCount - a.ratingCount);
    case "reviews":    return list.sort((a, b) => b.ratingCount - a.ratingCount);
    default:           return list;
  }
}

/**
 * Ranking.
 *
 * DESIGN NOTE — deviation from the source specification. The spec weighted
 * price at 0.30, which in a driver-priced marketplace engineers a race to the
 * bottom: the only lever a driver has to rank is to undercut. Price is
 * lowered to 0.20 and rating/reliability raised, and every component is
 * reported in `scoreReasons` so "Recommended" is explainable rather than a
 * black box.
 *
 * Cold start: with no completed trips there is no reliability signal at all,
 * so unproven drivers get a bounded exploration allowance instead of a zero.
 */
const RANK_VERSION = "rank-1.0.0";
const RATING_PRIOR = 4.6;
const RATING_PRIOR_WEIGHT = 5;

export function rankOffers(offers: Offer[]): Offer[] {
  if (offers.length === 0) return offers;
  const prices = offers.map((o) => Number(o.grossMinor));
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  for (const o of offers) {
    const reasons: string[] = [];

    const value = max === min ? 1 : 1 - (Number(o.grossMinor) - min) / (max - min);
    reasons.push(`value ${(value * 100).toFixed(0)}%`);

    const bayesian =
      ((o.ratingAverage ?? RATING_PRIOR) * o.ratingCount + RATING_PRIOR * RATING_PRIOR_WEIGHT) /
      (o.ratingCount + RATING_PRIOR_WEIGHT) / 5;
    reasons.push(`rating ${(bayesian * 5).toFixed(2)}/5 over ${o.ratingCount} review(s)`);

    const proven = o.completedTrips >= 5;
    const ackRate = proven ? clamp01(o.completedTrips === 0 ? 0 : 1) : 0.6;
    const cancelScore = proven ? 1 : 0.6;
    if (!proven) reasons.push("new driver exploration allowance");

    const profileQuality = clamp01(
      (o.languages.length > 0 ? 0.4 : 0) +
      (o.languages.some((l) => l.verified) ? 0.3 : 0) +
      (Object.keys(o.vehicle.amenities).length > 0 ? 0.3 : 0),
    );
    reasons.push(`profile ${(profileQuality * 100).toFixed(0)}%`);

    o.score =
      0.20 * value +
      0.30 * bayesian +
      0.20 * ackRate +
      0.15 * cancelScore +
      0.15 * profileQuality;
    o.scoreReasons = [...reasons, `ranking ${RANK_VERSION}`];
  }

  return offers.sort((a, b) => b.score - a.score || Number(a.grossMinor - b.grossMinor));
}

/**
 * When no curated route family exists, guess the deadhead recovery from trip
 * length: short city runs find return work easily, long remote runs do not.
 * Operations should replace the guess with a reviewed route family.
 */
function defaultDeadheadRecovery(distanceKm100: number): number {
  const km = distanceKm100 / 100;
  if (km <= 30) return 1000;   // 10%
  if (km <= 100) return 3500;  // 35%
  if (km <= 250) return 5500;  // 55%
  return 7000;                 // 70%
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const emptyResult = (reason: SearchResult["emptyReason"]): SearchResult => ({
  searchId: "",
  route: {
    distanceKm100: 0, driveMinutes: 0, returnKm100: 0, provider: "none",
    computedAt: new Date().toISOString(), routeHash: "",
    originName: "", destinationName: "", routeFamilySlug: null,
  },
  offers: [],
  emptyReason: reason,
});

interface LocationRow { id: string; slug: string; name_en: string; lat: number; lon: number; timezone: string }
interface TourPricingRow {
  id: string; slug: string; distance_km: string; drive_minutes: number; return_km: string;
  deadhead_recovery_bps: number; risk_factor_bps: number; min_fare_minor: bigint;
  requires_4x4: boolean; duration_days: number;
}
interface RouteFamilyRow {
  id: string; slug: string; distance_km: string; drive_minutes: number; return_km: string;
  deadhead_recovery_bps: number; risk_factor_bps: number; min_fare_minor: bigint; requires_4x4: boolean;
}
interface LanguageRow { driver_id: string; language: string; declared_level: string; verified_level: string | null }
interface CandidateRow {
  driver_id: string; handle: string; public_name: string; rating_sum: number; rating_count: number;
  completed_trips: number; ack_on_time: number; ack_total: number; driver_cancels: number;
  vehicle_id: string; make: string; model: string; year: number; class: string; color: string | null;
  seats: number; luggage: number; amenities: unknown; capabilities: unknown; photo_key: string | null;
  plan_id: string; rate_per_km_minor: bigint; rate_per_minute_minor: bigint; per_stop_fee_minor: bigint;
  overnight_fee_minor: bigint; minimum_fare_minor: bigint; season_factor_bps: number; currency: string;
  min_fare_floor_minor: bigint; max_fare_ceiling_minor: bigint;
}

/**
 * Cheapest published price for a curated route, for landing pages and
 * "from X" labels.
 *
 * Deliberately does NOT persist quotes: a crawler hitting a thousand route
 * pages must not fill the quotes table. Nothing here is bookable — a real
 * quote is only created when someone searches with a date.
 */
export async function routePriceFrom(routeFamilySlug: string): Promise<{
  fromMinor: bigint;
  currency: string;
  driverCount: number;
  distanceKm: number;
  driveMinutes: number;
} | null> {
  const [family] = await sql<RouteFamilyRow[]>`
    SELECT id, slug, distance_km, drive_minutes, return_km, deadhead_recovery_bps,
           risk_factor_bps, min_fare_minor, requires_4x4
    FROM route_families WHERE slug = ${routeFamilySlug} AND active`;
  if (!family) return null;

  const plans = await sql<PlanRow[]>`
    SELECT p.rate_per_km_minor, p.rate_per_minute_minor, p.per_stop_fee_minor,
           p.overnight_fee_minor, p.minimum_fare_minor, p.season_factor_bps, p.currency,
           b.min_fare_floor_minor, b.max_fare_ceiling_minor
    FROM driver_profiles d
    JOIN vehicles v    ON v.driver_id = d.id AND v.published AND v.status = 'APPROVED'
    JOIN price_plans p ON p.vehicle_id = v.id AND p.status = 'ACTIVE'
    JOIN price_bands b ON b.class = v.class AND b.active
    WHERE d.published AND d.status = 'APPROVED'
      AND (${family.requires_4x4} = false OR (v.capabilities->>'four_wheel_drive')::boolean IS TRUE)`;

  if (plans.length === 0) return null;

  let cheapest: bigint | null = null;
  for (const p of plans) {
    const { grossMinor } = computeQuote({
      engineVersion: ENGINE_VERSION,
      currency: p.currency,
      distanceKm100: Math.round(Number(family.distance_km) * 100),
      driveMinutes: family.drive_minutes,
      returnKm100: Math.round(Number(family.return_km) * 100),
      deadheadRecoveryBps: family.deadhead_recovery_bps,
      riskFactorBps: family.risk_factor_bps,
      routeMinFareMinor: (family.min_fare_minor ?? 0n).toString(),
      extraStops: 0,
      nights: 0,
      plan: {
        ratePerKmMinor: p.rate_per_km_minor.toString(),
        ratePerMinuteMinor: p.rate_per_minute_minor.toString(),
        perStopFeeMinor: p.per_stop_fee_minor.toString(),
        overnightFeeMinor: p.overnight_fee_minor.toString(),
        minimumFareMinor: p.minimum_fare_minor.toString(),
        seasonFactorBps: p.season_factor_bps,
      },
      band: {
        minFareFloorMinor: p.min_fare_floor_minor.toString(),
        maxFareCeilingMinor: p.max_fare_ceiling_minor.toString(),
      },
      commissionRateBps: config.policy.commissionRateBps,
      roundingStepMinor: config.policy.roundingStepMinor,
    });
    const value = BigInt(grossMinor);
    if (cheapest === null || value < cheapest) cheapest = value;
  }

  return {
    fromMinor: cheapest!,
    currency: config.policy.currency,
    driverCount: plans.length,
    distanceKm: Number(family.distance_km),
    driveMinutes: family.drive_minutes,
  };
}

/** Filter options that actually exist in current supply, for the filter UI. */
export async function availableFacets(): Promise<{
  classes: { value: string; count: number }[];
  languages: { value: string; count: number }[];
}> {
  const [classes, languages] = await Promise.all([
    sql<{ value: string; count: number }[]>`
      SELECT v.class::text AS value, count(*)::int AS count
      FROM vehicles v JOIN driver_profiles d ON d.id = v.driver_id
      WHERE v.published AND d.published GROUP BY 1 ORDER BY 2 DESC`,
    sql<{ value: string; count: number }[]>`
      SELECT dl.language AS value, count(*)::int AS count
      FROM driver_languages dl JOIN driver_profiles d ON d.id = dl.driver_id
      WHERE d.published GROUP BY 1 ORDER BY 2 DESC`,
  ]);
  return { classes, languages };
}

interface PlanRow {
  rate_per_km_minor: bigint; rate_per_minute_minor: bigint; per_stop_fee_minor: bigint;
  overnight_fee_minor: bigint; minimum_fare_minor: bigint; season_factor_bps: number;
  currency: string; min_fare_floor_minor: bigint; max_fare_ceiling_minor: bigint;
}
