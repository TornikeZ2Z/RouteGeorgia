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

describe("child seat fee", () => {
  t()("adds the flat fee to gross and passes it to the driver in full", async () => {
    const travelAt = new Date(Date.now() + 45 * 86_400_000);
    travelAt.setUTCHours(6, 0, 0, 0);
    const result = await searchOffers({
      originSlug: "tbilisi", destinationSlug: "mtskheta",
      travelAt, passengers: 2, luggage: 1,
    });
    expect(result.offers.length).toBeGreaterThan(0);
    const offer = result.offers[0]!;

    const booking = await createBooking(offer.quoteId, {
      customerName: "Seat Test", customerEmail: "seats@example.com", customerPhone: "+995500000002",
      contactLocale: "en", pickupAddress: "A", dropoffAddress: "B",
      passengers: 2, children: 2, luggage: 1, childSeats: 2, pets: false,
      paymentMode: "CASH", acceptedTerms: true,
    });

    const [row] = await sql<{ gross: string; commission: string; net: string; id: string }[]>`
      SELECT gross_minor::text AS gross, commission_minor::text AS commission,
             driver_net_minor::text AS net, id
      FROM bookings WHERE code = ${booking.code}`;
    try {
      // 2 seats x 20 GEL = 4000 tetri on top of the quote, all to the driver.
      expect(BigInt(row!.gross)).toBe(offer.grossMinor + 4000n);
      expect(BigInt(row!.commission)).toBe(BigInt(offer.breakdown.commissionMinor));
      expect(BigInt(row!.commission) + BigInt(row!.net)).toBe(BigInt(row!.gross));
    } finally {
      await sql`DELETE FROM availability_blocks WHERE booking_id = ${row!.id}::uuid`;
      await sql`UPDATE bookings SET status = 'CANCELLED', updated_at = now() WHERE id = ${row!.id}::uuid`;
    }
  });
});
