/**
 * Integration tests against a real Postgres.
 *
 * These verify constraints the application must NOT be trusted to enforce on
 * its own. They skip cleanly when no database is reachable, so `npm test`
 * still works before you have run `npm run db:start`.
 */
import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {}, connect_timeout: 3 });

/**
 * Probe at module load: vitest decides skip/run at collection time, which
 * happens before beforeAll, so the check cannot live in a hook.
 */
let reachable = false;
let driverA = "";
let driverB = "";

try {
  const rows = await sql<{ id: string }[]>`SELECT id FROM driver_profiles ORDER BY created_at LIMIT 2`;
  if (rows.length === 2) {
    driverA = rows[0]!.id;
    driverB = rows[1]!.id;
    reachable = true;
  } else {
    console.warn("[db.test] Database reachable but not seeded — run `npm run db:seed`. Skipping.");
  }
} catch {
  console.warn("[db.test] No database reachable — run `npm run db:start && npm run db:migrate && npm run db:seed`. Skipping.");
}

afterAll(async () => { await sql.end({ timeout: 5 }).catch(() => {}); });

const t = () => (reachable ? it : it.skip);

describe("database invariants", () => {
  t()("prevents two overlapping blocks for the same driver", async () => {
    const start = new Date(Date.UTC(2027, 0, 10, 8));
    const end = new Date(Date.UTC(2027, 0, 10, 14));

    await sql`DELETE FROM availability_blocks WHERE driver_id = ${driverA}::uuid AND lower(period) >= ${start}`;

    await sql`
      INSERT INTO availability_blocks (driver_id, period, kind)
      VALUES (${driverA}::uuid, tstzrange(${start}::timestamptz, ${end}::timestamptz, '[)'), 'BUSY')`;

    // Overlapping by one hour must be rejected by the EXCLUDE constraint.
    const overlap = new Date(Date.UTC(2027, 0, 10, 13));
    const overlapEnd = new Date(Date.UTC(2027, 0, 10, 18));
    await expect(sql`
      INSERT INTO availability_blocks (driver_id, period, kind)
      VALUES (${driverA}::uuid, tstzrange(${overlap}::timestamptz, ${overlapEnd}::timestamptz, '[)'), 'BOOKING')
    `).rejects.toMatchObject({ code: "23P01" });

    // A different driver at the same time is fine.
    await sql`
      INSERT INTO availability_blocks (driver_id, period, kind)
      VALUES (${driverB}::uuid, tstzrange(${start}::timestamptz, ${end}::timestamptz, '[)'), 'BUSY')`;

    // Adjacent, non-overlapping is fine: ranges are half-open '[)'.
    await sql`
      INSERT INTO availability_blocks (driver_id, period, kind)
      VALUES (${driverA}::uuid, tstzrange(${end}::timestamptz, ${overlapEnd}::timestamptz, '[)'), 'BUSY')`;

    await sql`DELETE FROM availability_blocks
              WHERE driver_id IN (${driverA}::uuid, ${driverB}::uuid) AND lower(period) >= ${start}`;
  });

  t()("simulates a booking race: only one transaction can win a driver", async () => {
    const start = new Date(Date.UTC(2027, 1, 2, 9));
    const end = new Date(Date.UTC(2027, 1, 2, 15));
    await sql`DELETE FROM availability_blocks WHERE driver_id = ${driverA}::uuid AND lower(period) >= ${start}`;

    const attempt = () =>
      sql.begin(async (tx) => {
        await tx`
          INSERT INTO availability_blocks (driver_id, period, kind)
          VALUES (${driverA}::uuid, tstzrange(${start}::timestamptz, ${end}::timestamptz, '[)'), 'BOOKING')`;
        return "won";
      });

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    await sql`DELETE FROM availability_blocks WHERE driver_id = ${driverA}::uuid AND lower(period) >= ${start}`;
  });

  t()("refuses to update or delete an audit log entry", async () => {
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO audit_logs (action, object_type, object_id, reason)
      VALUES ('test.append_only', 'test', 'x', 'immutability check') RETURNING id`;

    await expect(sql`UPDATE audit_logs SET reason = 'tampered' WHERE id = ${row!.id}`)
      .rejects.toThrow(/append-only/i);
    await expect(sql`DELETE FROM audit_logs WHERE id = ${row!.id}`)
      .rejects.toThrow(/append-only/i);
  });

  t()("refuses a quote whose commission and net do not sum to gross", async () => {
    await expect(sql`
      INSERT INTO quotes (search_id, driver_id, vehicle_id, price_plan_id, engine_version,
                          inputs, breakdown, gross_minor, commission_rate_bps,
                          commission_minor, driver_net_minor, expires_at)
      SELECT gen_random_uuid(), ${driverA}::uuid, gen_random_uuid(), gen_random_uuid(), '1.0.0',
             '{}'::jsonb, '{}'::jsonb, 10000, 1500, 1500, 9000, now() + interval '1 hour'
    `).rejects.toThrow();
  });

  t()("refuses to publish a driver who is not approved", async () => {
    await expect(sql`
      INSERT INTO driver_profiles (user_id, handle, public_name, status, published)
      SELECT id, 'constraint-test-handle', 'Constraint Test', 'DRAFT', true
      FROM users LIMIT 1
    `).rejects.toThrow();
  });

  t()("stores money as exact integers with no floating point drift", async () => {
    // Beyond Number.MAX_SAFE_INTEGER: the value must survive the round trip
    // exactly. db/client.ts installs a bigint parser; the raw driver used here
    // returns the digits as a string, which BigInt reads without loss.
    const big = "99999999999999999";
    const [row] = await sql<{ v: string }[]>`
      SELECT v FROM (VALUES (${big}::bigint)) AS t(v)`;
    expect(BigInt(row!.v)).toBe(BigInt(big));
    // The same value through a float would have drifted.
    expect(String(Number(big))).not.toBe(big);
  });

  /**
   * Regression: passing JSON.stringify(x) to a jsonb parameter stores a JSON
   * *string* rather than an object, so every ->> lookup silently returns NULL.
   * That broke vehicle capability filtering without any error being raised.
   */
  t()("stores jsonb columns as objects, not as encoded strings", async () => {
    const rows = await sql<{ table: string; bad: number }[]>`
      SELECT 'vehicles.capabilities' AS table,
             count(*) FILTER (WHERE jsonb_typeof(capabilities) <> 'object')::int AS bad FROM vehicles
      UNION ALL
      SELECT 'vehicles.amenities',
             count(*) FILTER (WHERE jsonb_typeof(amenities) <> 'object')::int FROM vehicles`;
    for (const row of rows) expect({ [row.table]: row.bad }).toEqual({ [row.table]: 0 });

    // And the keys must actually be readable through the operators the
    // eligibility query relies on.
    const [probe] = await sql<{ readable: number }[]>`
      SELECT count(*)::int AS readable FROM vehicles
      WHERE capabilities ? 'four_wheel_drive' AND amenities ? 'air_conditioning'`;
    const [total] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM vehicles`;
    expect(probe!.readable).toBe(total!.n);
  });

  t()("has 4x4 supply for the routes that require it", async () => {
    // Mountain route families are unbookable without it, so an empty result
    // here means the seed or the capability flag has regressed.
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM vehicles v JOIN driver_profiles d ON d.id = v.driver_id
      WHERE v.published AND d.published
        AND (v.capabilities->>'four_wheel_drive')::boolean IS TRUE`;
    expect(row!.n).toBeGreaterThan(0);
  });

  t()("keeps mandatory document expiry queryable without opening any file", async () => {
    const rows = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM driver_documents
      WHERE is_mandatory AND state = 'APPROVED' AND expires_on < current_date + 30`;
    expect(typeof rows[0]!.n).toBe("number");
  });
});
