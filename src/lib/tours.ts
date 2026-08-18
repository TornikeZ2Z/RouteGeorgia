import "server-only";
import { sql } from "@db/client";
import { computeQuote, ENGINE_VERSION } from "@/lib/pricing/engine";
import { config } from "@/lib/config";
import type { Locale } from "@/lib/i18n";

/**
 * Curated tours.
 *
 * A tour is a route family with an itinerary and editorial copy attached. It
 * prices through the same engine as any other trip — there is no second
 * pricing path to keep in step — and it returns to its origin, so the whole
 * return leg is part of the loop rather than a deadhead recovery.
 */
export interface TourStop {
  name: string;
  dayIndex: number;
  position: number;
  legKm: number | null;
  notes: string | null;
}

export interface Tour {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  originSlug: string;
  originName: string;
  durationDays: number;
  distanceKm: number;
  driveMinutes: number;
  requires4x4: boolean;
  heroImageKey: string | null;
  stops: TourStop[];
}

const NAME_COLUMN: Record<Locale, string> = { en: "name_en", ka: "name_ka", ru: "name_ru" };

export async function listTours(locale: Locale = "en"): Promise<Tour[]> {
  const rows = await sql<TourRow[]>`
    SELECT t.id, t.slug, t.duration_days, t.distance_km, t.drive_minutes,
           t.requires_4x4, t.hero_image_key,
           o.slug AS origin_slug, coalesce(${sql.unsafe(`o.${NAME_COLUMN[locale]}`)}, o.name_en) AS origin_name,
           coalesce(tr.title, en.title) AS title,
           coalesce(tr.summary, en.summary) AS summary,
           coalesce(tr.body, en.body) AS body
    FROM tours t
    JOIN locations o ON o.id = t.origin_id
    LEFT JOIN tour_translations tr ON tr.tour_id = t.id AND tr.locale = ${locale}
    LEFT JOIN tour_translations en ON en.tour_id = t.id AND en.locale = 'en'
    WHERE t.active
    ORDER BY t.duration_days, t.distance_km`;
  return rows.map((r) => ({ ...map(r), stops: [] }));
}

export async function getTour(slug: string, locale: Locale = "en"): Promise<Tour | null> {
  const [row] = await sql<TourRow[]>`
    SELECT t.id, t.slug, t.duration_days, t.distance_km, t.drive_minutes,
           t.requires_4x4, t.hero_image_key,
           o.slug AS origin_slug, coalesce(${sql.unsafe(`o.${NAME_COLUMN[locale]}`)}, o.name_en) AS origin_name,
           coalesce(tr.title, en.title) AS title,
           coalesce(tr.summary, en.summary) AS summary,
           coalesce(tr.body, en.body) AS body
    FROM tours t
    JOIN locations o ON o.id = t.origin_id
    LEFT JOIN tour_translations tr ON tr.tour_id = t.id AND tr.locale = ${locale}
    LEFT JOIN tour_translations en ON en.tour_id = t.id AND en.locale = 'en'
    WHERE t.slug = ${slug} AND t.active`;
  if (!row) return null;

  const stops = await sql<StopRow[]>`
    SELECT coalesce(${sql.unsafe(`l.${NAME_COLUMN[locale]}`)}, l.name_en) AS name,
           s.day_index, s.position, s.leg_km, s.notes
    FROM tour_stops s JOIN locations l ON l.id = s.location_id
    WHERE s.tour_id = ${row.id}::uuid ORDER BY s.position`;

  return {
    ...map(row),
    stops: stops.map((s) => ({
      name: s.name, dayIndex: s.day_index, position: s.position,
      legKm: s.leg_km === null ? null : Number(s.leg_km), notes: s.notes,
    })),
  };
}

/** Cheapest published price for a tour, for the "from" label. */
export async function tourPriceFrom(slug: string): Promise<{ fromMinor: bigint; vehicles: number } | null> {
  const [tour] = await sql<{
    distance_km: string; drive_minutes: number; return_km: string;
    deadhead_recovery_bps: number; risk_factor_bps: number; min_fare_minor: bigint;
    requires_4x4: boolean; duration_days: number;
  }[]>`
    SELECT distance_km, drive_minutes, return_km, deadhead_recovery_bps,
           risk_factor_bps, min_fare_minor, requires_4x4, duration_days
    FROM tours WHERE slug = ${slug} AND active`;
  if (!tour) return null;

  const plans = await sql<PlanRow[]>`
    SELECT p.rate_per_km_minor, p.rate_per_minute_minor, p.per_stop_fee_minor,
           p.overnight_fee_minor, p.minimum_fare_minor, p.season_factor_bps, p.currency,
           b.min_fare_floor_minor, b.max_fare_ceiling_minor
    FROM driver_profiles d
    JOIN vehicles v    ON v.driver_id = d.id AND v.published AND v.status = 'APPROVED'
    JOIN price_plans p ON p.vehicle_id = v.id AND p.status = 'ACTIVE'
    JOIN price_bands b ON b.class = v.class AND b.active
    WHERE d.published AND d.status = 'APPROVED'
      AND (${tour.requires_4x4} = false OR (v.capabilities->>'four_wheel_drive')::boolean IS TRUE)`;
  if (plans.length === 0) return null;

  let cheapest: bigint | null = null;
  for (const p of plans) {
    const { grossMinor } = computeQuote({
      engineVersion: ENGINE_VERSION,
      currency: p.currency,
      distanceKm100: Math.round(Number(tour.distance_km) * 100),
      driveMinutes: tour.drive_minutes,
      returnKm100: Math.round(Number(tour.return_km) * 100),
      deadheadRecoveryBps: tour.deadhead_recovery_bps,
      riskFactorBps: tour.risk_factor_bps,
      routeMinFareMinor: (tour.min_fare_minor ?? 0n).toString(),
      extraStops: 0,
      nights: Math.max(0, tour.duration_days - 1),
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
  return { fromMinor: cheapest!, vehicles: plans.length };
}

interface TourRow {
  id: string; slug: string; duration_days: number; distance_km: string; drive_minutes: number;
  requires_4x4: boolean; hero_image_key: string | null;
  origin_slug: string; origin_name: string; title: string; summary: string; body: string;
}
interface StopRow { name: string; day_index: number; position: number; leg_km: string | null; notes: string | null }
interface PlanRow {
  rate_per_km_minor: bigint; rate_per_minute_minor: bigint; per_stop_fee_minor: bigint;
  overnight_fee_minor: bigint; minimum_fare_minor: bigint; season_factor_bps: number;
  currency: string; min_fare_floor_minor: bigint; max_fare_ceiling_minor: bigint;
}

const map = (r: TourRow) => ({
  id: r.id, slug: r.slug, title: r.title, summary: r.summary, body: r.body,
  originSlug: r.origin_slug, originName: r.origin_name,
  durationDays: r.duration_days, distanceKm: Number(r.distance_km),
  driveMinutes: r.drive_minutes, requires4x4: r.requires_4x4, heroImageKey: r.hero_image_key,
});
