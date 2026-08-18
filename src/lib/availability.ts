/**
 * Availability.
 *
 * A driver's calendar is a set of time INTERVALS, not day flags, and
 * non-overlap is enforced by a Postgres EXCLUDE constraint rather than by
 * application checks. Two concurrent bookings therefore cannot both win a
 * driver even under a race — one transaction simply fails.
 */
import { sql } from "@db/client";

export type BlockKind = "BOOKING" | "BUSY" | "TIME_OFF" | "REST_BUFFER";

export interface AvailabilityBlock {
  id: string;
  driverId: string;
  startsAt: Date;
  endsAt: Date;
  kind: BlockKind;
  bookingId: string | null;
  reasonCategory: string | null;
}

export class AvailabilityConflictError extends Error {
  constructor(message = "This time overlaps an existing block on the driver's calendar.") {
    super(message);
    this.name = "AvailabilityConflictError";
  }
}

/** Postgres error code for exclusion_violation. */
const EXCLUSION_VIOLATION = "23P01";

export async function createBlock(input: {
  driverId: string;
  startsAt: Date;
  endsAt: Date;
  kind: BlockKind;
  bookingId?: string | null;
  reasonCategory?: string | null;
}): Promise<AvailabilityBlock> {
  if (input.endsAt <= input.startsAt) {
    throw new Error("Block end must be after its start.");
  }
  try {
    const [row] = await sql<AvailabilityBlockRow[]>`
      INSERT INTO availability_blocks (driver_id, period, kind, booking_id, reason_category)
      VALUES (
        ${input.driverId}::uuid,
        tstzrange(${input.startsAt.toISOString()}::timestamptz, ${input.endsAt.toISOString()}::timestamptz, '[)'),
        ${input.kind}::block_kind,
        ${input.bookingId ?? null}::uuid,
        ${input.reasonCategory ?? null}
      )
      RETURNING id, driver_id, lower(period) AS starts_at, upper(period) AS ends_at,
                kind, booking_id, reason_category`;
    return mapRow(row!);
  } catch (err) {
    if (isPgError(err) && err.code === EXCLUSION_VIOLATION) throw new AvailabilityConflictError();
    throw err;
  }
}

export async function listBlocks(driverId: string, from: Date, to: Date): Promise<AvailabilityBlock[]> {
  const rows = await sql<AvailabilityBlockRow[]>`
    SELECT id, driver_id, lower(period) AS starts_at, upper(period) AS ends_at,
           kind, booking_id, reason_category
    FROM availability_blocks
    WHERE driver_id = ${driverId}::uuid
      AND period && tstzrange(${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz, '[)')
    ORDER BY lower(period)`;
  return rows.map(mapRow);
}

/**
 * A driver-initiated calendar change must never silently cancel work that is
 * already confirmed, so BOOKING blocks are not deletable from the driver UI.
 */
export async function deleteBlock(driverId: string, blockId: string): Promise<boolean> {
  const rows = await sql`
    DELETE FROM availability_blocks
    WHERE id = ${blockId}::uuid AND driver_id = ${driverId}::uuid AND kind <> 'BOOKING'
    RETURNING id`;
  return rows.length > 0;
}

/** True when the driver has no conflicting block for the whole window. */
export async function isFree(driverId: string, startsAt: Date, endsAt: Date): Promise<boolean> {
  const rows = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM availability_blocks
    WHERE driver_id = ${driverId}::uuid
      AND period && tstzrange(${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz, '[)')`;
  return (rows[0]?.n ?? 0) === 0;
}

/**
 * Drivers eligible for a service window: approved, published, free, and with
 * every mandatory document still valid ON THE SERVICE DATE — not merely today.
 */
export async function eligibleDriverIds(startsAt: Date, endsAt: Date, seats: number): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    SELECT DISTINCT d.id
    FROM driver_profiles d
    JOIN vehicles v ON v.driver_id = d.id AND v.published = true AND v.status = 'APPROVED'
    WHERE d.published = true
      AND d.status = 'APPROVED'
      AND v.seats >= ${seats}
      AND NOT EXISTS (
        SELECT 1 FROM availability_blocks b
        WHERE b.driver_id = d.id
          AND b.period && tstzrange(${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz, '[)')
      )
      AND NOT EXISTS (
        SELECT 1 FROM driver_documents dd
        WHERE dd.driver_id = d.id
          AND dd.is_mandatory
          AND (dd.state <> 'APPROVED'
               OR (dd.expires_on IS NOT NULL AND dd.expires_on < ${startsAt.toISOString()}::date))
      )`;
  return rows.map((r) => r.id);
}

interface AvailabilityBlockRow {
  id: string; driver_id: string; starts_at: Date; ends_at: Date;
  kind: BlockKind; booking_id: string | null; reason_category: string | null;
}

const mapRow = (r: AvailabilityBlockRow): AvailabilityBlock => ({
  id: r.id, driverId: r.driver_id, startsAt: r.starts_at, endsAt: r.ends_at,
  kind: r.kind, bookingId: r.booking_id, reasonCategory: r.reason_category,
});

function isPgError(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e;
}
