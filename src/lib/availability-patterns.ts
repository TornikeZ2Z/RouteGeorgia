import "server-only";
/**
 * Recurring days off.
 *
 * A driver who never works Sundays should say so once, not file a block every
 * week forever. But availability_blocks stays the single source of truth —
 * the EXCLUDE constraint, every search and the whole booking path depend on
 * concrete rows — so a weekly pattern is *materialised* into real TIME_OFF
 * blocks rather than consulted at search time.
 *
 * That makes the blocks a derived artefact, which is only safe under two
 * rules, both enforced here:
 *
 *   1. Regeneration deletes only what a pattern created (`from_pattern`) and
 *      only in the future. A block the driver set by hand, and any BOOKING,
 *      is never touched.
 *   2. A generated day that would collide with something real is skipped, not
 *      forced. A confirmed booking always outranks a rule written last month.
 *
 * The horizon is finite, so the pattern is re-materialised whenever the driver
 * opens the availability page. That keeps the window rolling without a cron.
 */
import { sql } from "@db/client";

/** How far ahead a pattern is written into concrete blocks. */
export const PATTERN_HORIZON_DAYS = 120;

/** Georgia is UTC+4 all year — no daylight saving to reason about. */
const TZ_OFFSET = "+04:00";

export async function getPattern(driverId: string): Promise<number[]> {
  const rows = await sql<{ weekday: number }[]>`
    SELECT weekday FROM availability_patterns
    WHERE driver_id = ${driverId}::uuid ORDER BY weekday`;
  return rows.map((r) => r.weekday);
}

/**
 * Replace the driver's weekly pattern and rebuild the blocks it owns.
 * Returns how many days were actually blocked out.
 */
export async function savePattern(driverId: string, weekdays: number[]): Promise<number> {
  const clean = [...new Set(weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];

  await sql.begin(async (tx) => {
    await tx`DELETE FROM availability_patterns WHERE driver_id = ${driverId}::uuid`;
    for (const weekday of clean) {
      await tx`
        INSERT INTO availability_patterns (driver_id, weekday)
        VALUES (${driverId}::uuid, ${weekday})`;
    }
  });

  return materialisePattern(driverId);
}

/**
 * Write the pattern into concrete blocks across the horizon.
 *
 * Idempotent: it clears the future blocks it previously created and lays them
 * down again, so calling it twice changes nothing. Past blocks are left alone
 * — a day off that already happened is history, not a rule.
 */
export async function materialisePattern(driverId: string): Promise<number> {
  const weekdays = await getPattern(driverId);

  // Always clear first: an emptied pattern must release its days.
  await sql`
    DELETE FROM availability_blocks
    WHERE driver_id = ${driverId}::uuid
      AND from_pattern
      AND lower(period) > now()`;

  if (weekdays.length === 0) return 0;

  // One statement rather than 120 round trips. generate_series walks the
  // horizon day by day; the LEFT JOIN drops any day already spoken for, so a
  // booking or a hand-made block silently wins.
  const inserted = await sql<{ id: string }[]>`
    INSERT INTO availability_blocks (driver_id, period, kind, reason_category, from_pattern)
    SELECT ${driverId}::uuid,
           tstzrange(d.day, d.day + interval '1 day', '[)'),
           'TIME_OFF'::block_kind,
           'weekly_pattern',
           true
    FROM (
      SELECT generate_series(
        date_trunc('day', now() AT TIME ZONE ${TZ_OFFSET}) + interval '1 day',
        date_trunc('day', now() AT TIME ZONE ${TZ_OFFSET}) + ${`${PATTERN_HORIZON_DAYS} days`}::interval,
        interval '1 day'
      ) AT TIME ZONE ${TZ_OFFSET} AS day
    ) d
    WHERE EXTRACT(DOW FROM d.day AT TIME ZONE ${TZ_OFFSET})::int = ANY(${weekdays}::int[])
      AND NOT EXISTS (
        SELECT 1 FROM availability_blocks b
        WHERE b.driver_id = ${driverId}::uuid
          AND b.period && tstzrange(d.day, d.day + interval '1 day', '[)')
      )
    RETURNING id`;

  return inserted.length;
}

/**
 * Free a whole span by removing the driver's own blocks inside it.
 *
 * Only TIME_OFF and BUSY are removable. A BOOKING is not the driver's to
 * delete from here, and a REST_BUFFER exists to stop them driving twenty
 * hours straight.
 */
export async function freeRange(driverId: string, from: Date, to: Date): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    DELETE FROM availability_blocks
    WHERE driver_id = ${driverId}::uuid
      AND kind IN ('TIME_OFF', 'BUSY')
      AND period && tstzrange(${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz, '[)')
    RETURNING id`;
  return rows.length;
}

/**
 * Block a whole span, one row per day.
 *
 * Per-day rather than one long range so that freeing a single day later does
 * not require splitting a block, and so a booking mid-span only costs that
 * one day instead of rejecting the whole request.
 */
export async function blockRange(
  driverId: string,
  from: Date,
  to: Date,
  reason: "TIME_OFF" | "BUSY",
): Promise<{ blocked: number; skipped: number }> {
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));

  const inserted = await sql<{ id: string }[]>`
    INSERT INTO availability_blocks (driver_id, period, kind, reason_category, from_pattern)
    SELECT ${driverId}::uuid,
           tstzrange(d.day, d.day + interval '1 day', '[)'),
           ${reason}::block_kind,
           'range',
           false
    FROM (
      SELECT generate_series(
        ${from.toISOString()}::timestamptz,
        ${to.toISOString()}::timestamptz - interval '1 second',
        interval '1 day'
      ) AS day
    ) d
    WHERE NOT EXISTS (
      SELECT 1 FROM availability_blocks b
      WHERE b.driver_id = ${driverId}::uuid
        AND b.period && tstzrange(d.day, d.day + interval '1 day', '[)')
    )
    RETURNING id`;

  return { blocked: inserted.length, skipped: days - inserted.length };
}
