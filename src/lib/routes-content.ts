import "server-only";
import { sql } from "@db/client";
import type { Locale } from "@/lib/i18n";

/**
 * Route landing pages.
 *
 * These are acquisition infrastructure, not decoration: a traveller searching
 * "Tbilisi to Kazbegi taxi" should land on a page that answers the question
 * and can be indexed. Slugs are stable and derived from the route family, so
 * a URL never changes once published.
 */
export interface RouteSummary {
  slug: string;
  originSlug: string;
  destinationSlug: string;
  originName: string;
  destinationName: string;
  distanceKm: number;
  driveMinutes: number;
  requires4x4: boolean;
  seasonalNote: string | null;
}

const NAME_COLUMN: Record<Locale, string> = { en: "name_en", ka: "name_ka", ru: "name_ru" };

export async function listRoutes(locale: Locale = "en"): Promise<RouteSummary[]> {
  const col = NAME_COLUMN[locale];
  const rows = await sql<RouteRow[]>`
    SELECT rf.slug,
           o.slug AS origin_slug, d.slug AS destination_slug,
           coalesce(${sql.unsafe(`o.${col}`)}, o.name_en) AS origin_name,
           coalesce(${sql.unsafe(`d.${col}`)}, d.name_en) AS destination_name,
           rf.distance_km, rf.drive_minutes, rf.requires_4x4, rf.seasonal_note
    FROM route_families rf
    JOIN locations o ON o.id = rf.origin_id
    JOIN locations d ON d.id = rf.destination_id
    WHERE rf.active
    ORDER BY rf.distance_km`;
  return rows.map(map);
}

export async function getRoute(slug: string, locale: Locale = "en"): Promise<RouteSummary | null> {
  const col = NAME_COLUMN[locale];
  const rows = await sql<RouteRow[]>`
    SELECT rf.slug,
           o.slug AS origin_slug, d.slug AS destination_slug,
           coalesce(${sql.unsafe(`o.${col}`)}, o.name_en) AS origin_name,
           coalesce(${sql.unsafe(`d.${col}`)}, d.name_en) AS destination_name,
           rf.distance_km, rf.drive_minutes, rf.requires_4x4, rf.seasonal_note
    FROM route_families rf
    JOIN locations o ON o.id = rf.origin_id
    JOIN locations d ON d.id = rf.destination_id
    WHERE rf.slug = ${slug} AND rf.active`;
  return rows[0] ? map(rows[0]) : null;
}

/** Other routes sharing an endpoint, for internal linking. */
export async function relatedRoutes(slug: string, locale: Locale = "en"): Promise<RouteSummary[]> {
  const all = await listRoutes(locale);
  const current = all.find((r) => r.slug === slug);
  if (!current) return [];
  return all
    .filter((r) =>
      r.slug !== slug &&
      (r.originSlug === current.originSlug || r.destinationSlug === current.destinationSlug ||
       r.originSlug === current.destinationSlug || r.destinationSlug === current.originSlug))
    .slice(0, 6);
}

interface RouteRow {
  slug: string; origin_slug: string; destination_slug: string;
  origin_name: string; destination_name: string;
  distance_km: string; drive_minutes: number; requires_4x4: boolean; seasonal_note: string | null;
}

const map = (r: RouteRow): RouteSummary => ({
  slug: r.slug,
  originSlug: r.origin_slug,
  destinationSlug: r.destination_slug,
  originName: r.origin_name,
  destinationName: r.destination_name,
  distanceKm: Number(r.distance_km),
  driveMinutes: r.drive_minutes,
  requires4x4: r.requires_4x4,
  seasonalNote: r.seasonal_note,
});
