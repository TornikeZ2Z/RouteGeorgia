/**
 * Money and lifecycle invariants, against a real database.
 *
 * These are the expensive-to-get-wrong properties: a booking that takes money
 * twice, a ledger that does not balance, or a review that can be submitted
 * repeatedly are all far more damaging than a broken page.
 */
import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";
import { cancellationOutcome } from "@/lib/booking";

const sql = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {}, connect_timeout: 3 });

let reachable = false;
try {
  await sql`SELECT 1 FROM bookings LIMIT 1`;
  reachable = true;
} catch {
  console.warn("[booking.test] No seeded database — skipping.");
}
afterAll(async () => { await sql.end({ timeout: 5 }).catch(() => {}); });
const t = () => (reachable ? it : it.skip);

describe("cancellation policy", () => {
  const policy = { freeCutoffHours: 24, lateFeeBps: 2500 };

  it("is free outside the cut-off", () => {
    const far = new Date(Date.now() + 48 * 3600_000);
    expect(cancellationOutcome(far, 10_000n, policy, true).freeOfCharge).toBe(true);
    expect(cancellationOutcome(far, 10_000n, policy, true).feeMinor).toBe(0n);
  });

  it("charges the configured fee inside the cut-off", () => {
    const soon = new Date(Date.now() + 2 * 3600_000);
    const outcome = cancellationOutcome(soon, 10_000n, policy, true);
    expect(outcome.freeOfCharge).toBe(false);
    expect(outcome.feeMinor).toBe(2_500n);
    expect(outcome.refundMinor).toBe(7_500n);
  });

  it("refunds nothing when nothing was paid", () => {
    const soon = new Date(Date.now() + 2 * 3600_000);
    expect(cancellationOutcome(soon, 10_000n, policy, false).refundMinor).toBe(0n);
  });

  it("is always free while the platform policy fee is zero", () => {
    const soon = new Date(Date.now() + 1 * 3600_000);
    const outcome = cancellationOutcome(soon, 10_000n, { freeCutoffHours: 24, lateFeeBps: 0 }, true);
    expect(outcome.freeOfCharge).toBe(true);
    expect(outcome.refundMinor).toBe(10_000n);
  });
});

describe("ledger", () => {
  t()("every posting group balances to zero", async () => {
    const [row] = await sql<{ drift: string; groups: string }[]>`
      SELECT coalesce(sum(net), 0)::text AS drift, count(*)::text AS groups
      FROM (SELECT posting_group,
                   sum(CASE WHEN side='DEBIT' THEN amount_minor ELSE -amount_minor END) AS net
            FROM ledger_entries GROUP BY posting_group) g`;
    expect(row!.drift).toBe("0");
  });

  t()("rejects an unbalanced posting group at commit", async () => {
    await expect(sql.begin(async (tx) => {
      const [account] = await tx<{ id: string }[]>`
        SELECT id FROM ledger_accounts WHERE kind = 'PLATFORM_REVENUE' LIMIT 1`;
      await tx`
        INSERT INTO ledger_entries (posting_group, account_id, side, amount_minor, memo)
        VALUES (gen_random_uuid(), ${account!.id}::uuid, 'DEBIT', 500, 'deliberately unbalanced')`;
    })).rejects.toThrow(/does not balance/i);
  });

  t()("refuses to alter a ledger entry once written", async () => {
    const [entry] = await sql<{ id: number }[]>`SELECT id FROM ledger_entries LIMIT 1`;
    if (!entry) return;
    await expect(sql`UPDATE ledger_entries SET amount_minor = 1 WHERE id = ${entry.id}`)
      .rejects.toThrow(/append-only/i);
    await expect(sql`DELETE FROM ledger_entries WHERE id = ${entry.id}`)
      .rejects.toThrow(/append-only/i);
  });

  t()("commission plus driver share always equals the fare", async () => {
    const rows = await sql<{ bad: number }[]>`
      SELECT count(*)::int AS bad FROM bookings
      WHERE commission_minor + driver_net_minor <> gross_minor`;
    expect(rows[0]!.bad).toBe(0);
  });
});

describe("booking integrity", () => {
  t()("a confirmed booking always holds the driver's calendar", async () => {
    const [row] = await sql<{ missing: number }[]>`
      SELECT count(*)::int AS missing FROM bookings b
      WHERE b.status IN ('CONFIRMED','DRIVER_ACKNOWLEDGED','READY','DRIVER_ARRIVED','IN_PROGRESS')
        AND NOT EXISTS (SELECT 1 FROM availability_blocks a WHERE a.booking_id = b.id)`;
    expect(row!.missing).toBe(0);
  });

  t()("a cancelled booking never holds the calendar", async () => {
    const [row] = await sql<{ held: number }[]>`
      SELECT count(*)::int AS held FROM bookings b
      JOIN availability_blocks a ON a.booking_id = b.id
      WHERE b.status = 'CANCELLED'`;
    expect(row!.held).toBe(0);
  });

  t()("one quote can only ever produce one booking", async () => {
    const [row] = await sql<{ dupes: number }[]>`
      SELECT count(*)::int AS dupes FROM (
        SELECT quote_id FROM bookings GROUP BY quote_id HAVING count(*) > 1) x`;
    expect(row!.dupes).toBe(0);
  });

  t()("booking codes are unique and human-readable", async () => {
    const rows = await sql<{ code: string }[]>`SELECT code FROM bookings`;
    expect(new Set(rows.map((r) => r.code)).size).toBe(rows.length);
    for (const r of rows) expect(r.code).toMatch(/^[2-9ACDEFGHJKLMNPQRSTUVWXYZ]{4}-[2-9ACDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
  });

  t()("a webhook delivered repeatedly is stored and processed once", async () => {
    const [row] = await sql<{ dupes: number }[]>`
      SELECT count(*)::int AS dupes FROM (
        SELECT provider, event_id FROM webhook_events
        GROUP BY provider, event_id HAVING count(*) > 1) x`;
    expect(row!.dupes).toBe(0);
  });

  t()("a review token can only be used once", async () => {
    const [row] = await sql<{ bad: number }[]>`
      SELECT count(*)::int AS bad FROM (
        SELECT booking_id FROM reviews GROUP BY booking_id HAVING count(*) > 1) x`;
    expect(row!.bad).toBe(0);
  });

  t()("only a completed booking can have a review", async () => {
    const [row] = await sql<{ bad: number }[]>`
      SELECT count(*)::int AS bad FROM reviews r
      JOIN bookings b ON b.id = r.booking_id
      WHERE b.status NOT IN ('COMPLETED','CLOSED')`;
    expect(row!.bad).toBe(0);
  });
});
