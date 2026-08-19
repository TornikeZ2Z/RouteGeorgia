/**
 * Operations invariants: reassignment must respect the WHOLE service window.
 *
 * The regression this guards: replacementOptions()/reassignBooking() used to
 * recompute a one-way window from drive_minutes. For a round trip (blocked
 * out-stay-return) that offered replacement drivers who were free for the
 * outbound but busy during the return — a double-sell waiting to happen.
 */
import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";
import { searchOffers } from "@/lib/offers";
import { createBooking } from "@/lib/booking";
import { replacementOptions, reassignBooking } from "@/lib/operations";

const sql = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {}, connect_timeout: 3 });

let reachable = false;
try {
  await sql`SELECT 1 FROM bookings LIMIT 1`;
  reachable = true;
} catch {
  console.warn("[operations.test] No seeded database — skipping.");
}
afterAll(async () => { await sql.end({ timeout: 5 }).catch(() => {}); });
const t = () => (reachable ? it : it.skip);

const DAY = 86_400_000;

describe("round-trip reassignment", () => {
  t()("excludes drivers busy during the return leg and reassigns the full span", async () => {
    const travelAt = new Date(Date.now() + 40 * DAY);
    travelAt.setUTCHours(5, 0, 0, 0); // 09:00 Tbilisi
    const returnAt = new Date(travelAt.getTime() + DAY + 9 * 3600_000); // next day, 18:00

    const result = await searchOffers({
      originSlug: "tbilisi", destinationSlug: "kazbegi",
      travelAt, returnAt, passengers: 2, luggage: 1,
    });
    expect(result.offers.length).toBeGreaterThan(2);
    const [first, second] = result.offers;

    const booking = await createBooking(first!.quoteId, {
      customerName: "Ops Test", customerEmail: "ops-test@example.com", customerPhone: "+995500000001",
      contactLocale: "en", pickupAddress: "Test 1", dropoffAddress: "Test 2",
      passengers: 2, children: 0, luggage: 1, childSeats: 0, pets: false,
      paymentMode: "CASH", acceptedTerms: true,
    });

    const [bk] = await sql<{ id: string }[]>`SELECT id FROM bookings WHERE code = ${booking.code}`;
    const bookingId = bk!.id;

    try {
      // Driver B is free for the whole outbound day but busy for two hours
      // in the middle of the RETURN day.
      const busyStart = new Date(travelAt.getTime() + DAY + 5 * 3600_000);
      const busyEnd = new Date(busyStart.getTime() + 2 * 3600_000);
      await sql`
        INSERT INTO availability_blocks (driver_id, period, kind, reason_category)
        VALUES (${second!.driverId}::uuid,
                tstzrange(${busyStart.toISOString()}::timestamptz, ${busyEnd.toISOString()}::timestamptz, '[)'),
                'BUSY', 'operations test')`;

      const options = await replacementOptions(bookingId);
      expect(options.length).toBeGreaterThan(0);
      expect(options.some((o) => o.driverId === second!.driverId)).toBe(false);

      // Reassign to the first genuinely free option: the new driver's block
      // must span the ORIGINAL period, through the return.
      const [before] = await sql<{ e: Date }[]>`
        SELECT upper(period) AS e FROM availability_blocks WHERE booking_id = ${bookingId}::uuid`;
      const [admin] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = 'admin@example.com'`;
      const target = options[0]!;
      await reassignBooking({
        bookingId, driverId: target.driverId, vehicleId: target.vehicleId,
        reason: "operations regression test", actorUserId: admin!.id,
      });
      const [after] = await sql<{ driver_id: string; e: Date }[]>`
        SELECT driver_id, upper(period) AS e FROM availability_blocks WHERE booking_id = ${bookingId}::uuid`;
      expect(after!.driver_id).toBe(target.driverId);
      expect(new Date(after!.e).getTime()).toBe(new Date(before!.e).getTime());
      expect(new Date(after!.e).getTime()).toBeGreaterThan(returnAt.getTime());
    } finally {
      // A booking with an audit trail cannot be hard-deleted (append-only
      // trigger — correctly). Cancel it and free the calendar instead.
      await sql`DELETE FROM availability_blocks WHERE booking_id = ${bookingId}::uuid`;
      await sql`DELETE FROM availability_blocks WHERE reason_category = 'operations test'`;
      await sql`UPDATE bookings SET status = 'CANCELLED', updated_at = now() WHERE id = ${bookingId}::uuid`;
    }
  });
});
