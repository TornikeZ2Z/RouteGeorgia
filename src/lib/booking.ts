import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql } from "@db/client";
import { config } from "@/lib/config";
import { serviceWindow, roundTripWindow } from "@/lib/offers";
import { post, driverBalance } from "@/lib/ledger";
import * as notify from "@/lib/notifications";
import { writeAudit } from "@/lib/audit";
import type { Locale } from "@/lib/i18n";

/**
 * Booking lifecycle.
 *
 * Two rules govern everything here:
 *
 * 1. The commit is ATOMIC. Consuming the quote, blocking the driver's
 *    calendar, creating the booking and queueing notifications happen in one
 *    transaction. The calendar block is protected by the EXCLUDE constraint,
 *    so two travellers racing for the same driver produce exactly one booking
 *    and one clean failure — not two bookings or a half-created one.
 *
 * 2. The quote is FROZEN. A booking copies the price, the commission rate and
 *    the policy version at the moment of commit. Later changes to the driver's
 *    plan, the platform commission or the cancellation policy never rewrite
 *    what someone already agreed to.
 */

export class BookingConflictError extends Error {
  constructor(message = "That driver was just booked for this time. Please choose another.") {
    super(message);
    this.name = "BookingConflictError";
  }
}
export class QuoteExpiredError extends Error {
  constructor(message = "That price has expired. Please search again for a fresh quote.") {
    super(message);
    this.name = "QuoteExpiredError";
  }
}
export class CashUnavailableError extends Error {
  constructor(message = "This driver cannot accept cash bookings at the moment. Please pay by card.") {
    super(message);
    this.name = "CashUnavailableError";
  }
}

/** Human-facing booking code. Avoids vowels and lookalike characters. */
function bookingCode(): string {
  const alphabet = "23456789ACDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i]! % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export interface CheckoutDetails {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  contactLocale: Locale;
  pickupAddress: string;
  dropoffAddress: string;
  flightNumber?: string | null;
  pickupSignName?: string | null;
  passengers: number;
  children: number;
  luggage: number;
  childSeats: number;
  pets: boolean;
  notes?: string | null;
  paymentMode: "CASH" | "CARD";
  acceptedTerms: boolean;
  attribution?: Record<string, unknown>;
}

export interface CreatedBooking {
  id: string;
  code: string;
  manageToken: string;
  paymentMode: "CASH" | "CARD";
  grossMinor: bigint;
  currency: string;
}

/**
 * Place a short hold on a quote so the traveller can complete checkout without
 * the driver being sold to somebody else mid-form.
 */
export async function holdQuote(quoteId: string): Promise<{ heldUntil: Date }> {
  const heldUntil = new Date(Date.now() + config.policy.holdTtlSeconds * 1000);
  const rows = await sql<{ id: string }[]>`
    UPDATE quotes SET status = 'HELD', held_until = ${heldUntil.toISOString()}::timestamptz
    WHERE id = ${quoteId}::uuid
      AND status IN ('OPEN','HELD')
      AND expires_at > now()
    RETURNING id`;
  if (rows.length === 0) throw new QuoteExpiredError();
  return { heldUntil };
}

export async function createBooking(quoteId: string, details: CheckoutDetails): Promise<CreatedBooking> {
  if (!details.acceptedTerms) throw new Error("The terms must be accepted before booking.");

  const [quote] = await sql<QuoteRow[]>`
    SELECT q.id, q.driver_id, q.vehicle_id, q.gross_minor, q.currency,
           q.commission_rate_bps, q.commission_minor, q.driver_net_minor,
           q.status::text AS status, q.expires_at,
           s.travel_at, s.service_tz, s.itinerary, s.attribution,
           (q.inputs->>'driveMinutes')::int  AS drive_minutes,
           (q.inputs->>'distanceKm100')::int AS distance_km100,
           d.public_name AS driver_name, u.email AS driver_email, u.locale AS driver_locale,
           u.id AS driver_user_id,
           v.make, v.model, v.year, v.plate
    FROM quotes q
    JOIN route_searches s ON s.id = q.search_id
    JOIN driver_profiles d ON d.id = q.driver_id
    JOIN users u ON u.id = d.user_id
    JOIN vehicles v ON v.id = q.vehicle_id
    WHERE q.id = ${quoteId}::uuid`;

  if (!quote) throw new QuoteExpiredError("That quote no longer exists.");
  if (quote.status === "CONSUMED") throw new QuoteExpiredError("That quote has already been used.");
  if (new Date(quote.expires_at) <= new Date()) throw new QuoteExpiredError();

  // Cash creates commission debt, so a driver who is behind cannot take it.
  if (details.paymentMode === "CASH") {
    const balance = await driverBalance(quote.driver_id);
    if (balance.cashBlocked) throw new CashUnavailableError();
  }

  const travelAt = new Date(quote.travel_at);
  const itineraryEarly = quote.itinerary as { origin: string; stops?: string[]; destination: string; roundTrip?: boolean; returnAt?: string };
  const returnAt = itineraryEarly.roundTrip && itineraryEarly.returnAt ? new Date(itineraryEarly.returnAt) : null;
  const window = returnAt
    ? roundTripWindow(travelAt, returnAt, quote.drive_minutes ?? 0)
    : serviceWindow(travelAt, quote.drive_minutes ?? 0);
  const code = bookingCode();
  const manageToken = randomBytes(32).toString("base64url");
  // Child seats are a flat per-seat fee on top of the quoted fare. The driver
  // supplies and fits the seat, so the fee passes to the driver untouched —
  // commission applies only to the quoted fare. gross = commission + net holds.
  const childSeatFee = BigInt(details.childSeats) * BigInt(config.policy.childSeatFeeMinor);
  const gross = BigInt(quote.gross_minor) + childSeatFee;
  const commission = BigInt(quote.commission_minor);
  const net = BigInt(quote.driver_net_minor) + childSeatFee;
  const itinerary = itineraryEarly;
  const routeLabel =
    [itinerary.origin, ...(itinerary.stops ?? []), itinerary.destination].map(humanise).join(" → ") +
    (returnAt ? ` → ${humanise(itinerary.origin)}` : "");

  let bookingId = "";

  try {
    await sql.begin(async (tx) => {
      // Consume the quote. If another transaction got here first this
      // returns nothing and the whole booking is abandoned.
      const consumed = await tx<{ id: string }[]>`
        UPDATE quotes SET status = 'CONSUMED'
        WHERE id = ${quoteId}::uuid AND status IN ('OPEN','HELD')
        RETURNING id`;
      if (consumed.length === 0) throw new QuoteExpiredError("That quote has already been used.");

      const [booking] = await tx<{ id: string }[]>`
        INSERT INTO bookings (
          code, customer_email, customer_phone, customer_name, contact_locale,
          quote_id, driver_id, vehicle_id, status, payment_mode,
          service_start_at, service_tz, gross_minor, currency,
          commission_rate_bps, commission_minor, driver_net_minor, policy_version,
          attribution, pickup_address, dropoff_address, flight_number, pickup_sign_name,
          passengers, children, luggage, child_seats, pets, notes,
          drive_minutes, distance_km100)
        VALUES (
          ${code}, ${details.customerEmail}, ${details.customerPhone}, ${details.customerName},
          ${details.contactLocale},
          ${quoteId}::uuid, ${quote.driver_id}::uuid, ${quote.vehicle_id}::uuid,
          ${details.paymentMode === "CARD" ? "PENDING_PAYMENT" : "CONFIRMED"}::booking_status,
          ${details.paymentMode}::payment_mode,
          ${travelAt.toISOString()}::timestamptz, ${quote.service_tz},
          ${gross.toString()}::bigint, ${quote.currency},
          ${quote.commission_rate_bps}, ${commission.toString()}::bigint, ${net.toString()}::bigint,
          ${config.policy.version},
          ${JSON.stringify(details.attribution ?? quote.attribution ?? {})}::text::jsonb,
          ${details.pickupAddress}, ${details.dropoffAddress},
          ${details.flightNumber ?? null}, ${details.pickupSignName ?? null},
          ${details.passengers}, ${details.children}, ${details.luggage},
          ${details.childSeats}, ${details.pets}, ${details.notes ?? null},
          ${quote.drive_minutes ?? 0}, ${quote.distance_km100 ?? 0})
        RETURNING id`;
      bookingId = booking!.id;

      // Itinerary as first-class rows, so the driver sees ordered stops.
      // A round trip ends where it began: the return is a real leg with its
      // own day index, not a footnote.
      const points = [itinerary.origin, ...(itinerary.stops ?? []), itinerary.destination];
      if (returnAt) points.push(itinerary.origin);
      const returnDay = returnAt
        ? Math.floor((returnAt.getTime() - travelAt.getTime()) / 86_400_000)
        : 0;
      for (const [index, slug] of points.entries()) {
        const isReturn = returnAt !== null && index === points.length - 1;
        await tx`
          INSERT INTO booking_legs (booking_id, position, location_id, label, day_index)
          VALUES (${bookingId}::uuid, ${index},
                  (SELECT id FROM locations WHERE slug = ${slug}), ${humanise(slug)},
                  ${isReturn ? returnDay : 0})`;
      }

      // Block the calendar. The EXCLUDE constraint is what actually prevents
      // a double booking; this throwing is the expected race outcome.
      await tx`
        INSERT INTO availability_blocks (driver_id, period, kind, booking_id, reason_category)
        VALUES (${quote.driver_id}::uuid,
                tstzrange(${window.startsAt.toISOString()}::timestamptz,
                          ${window.endsAt.toISOString()}::timestamptz, '[)'),
                'BOOKING', ${bookingId}::uuid, 'confirmed booking')`;

      await tx`
        INSERT INTO booking_status_history (booking_id, from_status, to_status, reason)
        VALUES (${bookingId}::uuid, 'DRAFT'::booking_status,
                ${details.paymentMode === "CARD" ? "PENDING_PAYMENT" : "CONFIRMED"}::booking_status,
                'checkout completed')`;

      // Scoped, expiring access so a guest can manage the booking without an
      // account. Only the hash is stored, and nothing identifying goes in the URL.
      await tx`
        INSERT INTO booking_access_tokens (booking_id, token_hash, expires_at)
        VALUES (${bookingId}::uuid, ${hash(manageToken)},
                ${new Date(travelAt.getTime() + 30 * 86_400_000).toISOString()}::timestamptz)`;

      const summary = {
        code,
        customerName: details.customerName,
        driverName: quote.driver_name,
        vehicle: `${quote.make} ${quote.model} (${quote.year}), ${quote.plate}`,
        serviceStartAt: travelAt,
        route: routeLabel,
        grossMinor: gross,
        currency: quote.currency,
        paymentMode: details.paymentMode,
        manageUrl: `${config.appUrl}/${details.contactLocale}/booking/${code}?t=${manageToken}`,
      };

      // Cash is confirmed immediately; card waits for the provider.
      if (details.paymentMode === "CASH") {
        const message = notify.customerConfirmation(summary, details.contactLocale);
        await notify.queue(tx, {
          kind: "booking.confirmed.customer", to: details.customerEmail,
          locale: details.contactLocale, subject: message.subject, body: message.body,
          bookingId, dedupe: bookingId,
        });
        const driverMessage = notify.driverAssignment(summary, net, (quote.driver_locale ?? "ka") as Locale);
        await notify.queue(tx, {
          kind: "booking.confirmed.driver", to: quote.driver_email,
          locale: quote.driver_locale ?? "ka", subject: driverMessage.subject,
          body: driverMessage.body, bookingId, dedupe: bookingId,
          userId: quote.driver_user_id,
        });
      }
    });
  } catch (err) {
    if (isExclusionViolation(err)) throw new BookingConflictError();
    throw err;
  }

  await writeAudit({
    action: "booking.created", objectType: "booking", objectId: bookingId,
    after: { code, paymentMode: details.paymentMode, grossMinor: gross.toString() },
  });

  return {
    id: bookingId, code, manageToken,
    paymentMode: details.paymentMode, grossMinor: gross, currency: quote.currency,
  };
}

/**
 * Card payment succeeded. Confirms the booking and posts the money.
 * Idempotent: replaying the same provider event changes nothing.
 */
export async function confirmCardPayment(bookingId: string, paymentId: string): Promise<boolean> {
  let changed = false;

  await sql.begin(async (tx) => {
    const [booking] = await tx<BookingMoneyRow[]>`
      SELECT b.id, b.code, b.status::text AS status, b.driver_id, b.gross_minor,
             b.commission_minor, b.driver_net_minor, b.currency, b.customer_email,
             b.contact_locale, b.service_start_at, b.payment_mode::text AS payment_mode,
             d.public_name AS driver_name, u.email AS driver_email, u.locale AS driver_locale,
           u.id AS driver_user_id,
             v.make, v.model, v.year, v.plate
      FROM bookings b
      JOIN driver_profiles d ON d.id = b.driver_id
      JOIN users u ON u.id = d.user_id
      JOIN vehicles v ON v.id = b.vehicle_id
      WHERE b.id = ${bookingId}::uuid
      FOR UPDATE OF b`;
    if (!booking) return;
    if (booking.status !== "PENDING_PAYMENT") return; // already handled

    await tx`
      UPDATE bookings SET status='CONFIRMED', updated_at=now() WHERE id=${bookingId}::uuid`;
    await tx`
      INSERT INTO booking_status_history (booking_id, from_status, to_status, reason)
      VALUES (${bookingId}::uuid, 'PENDING_PAYMENT', 'CONFIRMED', 'card payment succeeded')`;

    // We hold the traveller's money; the driver's share becomes a payable and
    // our commission becomes revenue at the point the trip is paid for.
    await post(tx, [
      { account: "CARD_CLEARING", side: "DEBIT", amountMinor: BigInt(booking.gross_minor), memo: `Card payment ${booking.code}` },
      { account: "DRIVER_PAYABLE", driverId: booking.driver_id, side: "CREDIT",
        amountMinor: BigInt(booking.driver_net_minor), memo: `Fare owed to driver ${booking.code}` },
      { account: "PLATFORM_REVENUE", side: "CREDIT",
        amountMinor: BigInt(booking.commission_minor), memo: `Commission ${booking.code}` },
    ], { bookingId, paymentId, currency: booking.currency });

    const summary = summaryOf(booking);
    const message = notify.customerConfirmation(summary, booking.contact_locale as Locale);
    await notify.queue(tx, {
      kind: "booking.confirmed.customer", to: booking.customer_email,
      locale: booking.contact_locale, subject: message.subject, body: message.body,
      bookingId, dedupe: bookingId,
    });
    const driverMessage = notify.driverAssignment(summary, BigInt(booking.driver_net_minor), (booking.driver_locale ?? "ka") as Locale);
    await notify.queue(tx, {
      kind: "booking.confirmed.driver", to: booking.driver_email,
      locale: booking.driver_locale ?? "ka", subject: driverMessage.subject,
      body: driverMessage.body, bookingId, dedupe: bookingId,
      userId: booking.driver_user_id,
    });
    changed = true;
  });

  return changed;
}

/**
 * Trip completed. Posts settlement, and for cash raises the commission the
 * driver now owes us.
 */
export async function completeBooking(bookingId: string, actorUserId?: string): Promise<void> {
  let reviewToken: string | null = null;

  await sql.begin(async (tx) => {
    const [booking] = await tx<BookingMoneyRow[]>`
      SELECT b.id, b.code, b.status::text AS status, b.driver_id, b.gross_minor,
             b.commission_minor, b.driver_net_minor, b.currency, b.customer_email,
             b.contact_locale, b.service_start_at, b.payment_mode::text AS payment_mode,
             d.public_name AS driver_name, u.email AS driver_email, u.locale AS driver_locale,
           u.id AS driver_user_id,
             v.make, v.model, v.year, v.plate
      FROM bookings b
      JOIN driver_profiles d ON d.id = b.driver_id
      JOIN users u ON u.id = d.user_id
      JOIN vehicles v ON v.id = b.vehicle_id
      WHERE b.id = ${bookingId}::uuid FOR UPDATE OF b`;
    if (!booking) throw new Error("Booking not found.");
    if (booking.status === "COMPLETED" || booking.status === "CLOSED") return;

    await tx`
      UPDATE bookings SET status='COMPLETED', completed_at=now(), updated_at=now()
      WHERE id=${bookingId}::uuid`;
    await tx`
      INSERT INTO booking_status_history (booking_id, from_status, to_status, actor_id, reason)
      VALUES (${bookingId}::uuid, ${booking.status}::booking_status, 'COMPLETED',
              ${actorUserId ?? null}::uuid, 'trip completed')`;
    await tx`
      UPDATE driver_profiles SET completed_trips = completed_trips + 1
      WHERE id = ${booking.driver_id}::uuid`;

    if (booking.payment_mode === "CASH") {
      // The driver collected the whole fare, so they owe us the commission.
      await post(tx, [
        { account: "CASH_WITH_DRIVER", side: "DEBIT", amountMinor: BigInt(booking.gross_minor),
          memo: `Cash collected by driver ${booking.code}` },
        { account: "DRIVER_PAYABLE", driverId: booking.driver_id, side: "CREDIT",
          amountMinor: BigInt(booking.gross_minor), memo: `Fare retained by driver ${booking.code}` },
      ], { bookingId, currency: booking.currency });

      await post(tx, [
        { account: "DRIVER_RECEIVABLE", driverId: booking.driver_id, side: "DEBIT",
          amountMinor: BigInt(booking.commission_minor), memo: `Commission owed on ${booking.code}` },
        { account: "PLATFORM_REVENUE", side: "CREDIT",
          amountMinor: BigInt(booking.commission_minor), memo: `Commission earned ${booking.code}` },
      ], { bookingId, currency: booking.currency });
    }

    // One-time review invitation.
    reviewToken = randomBytes(24).toString("base64url");
    await tx`
      INSERT INTO review_tokens (booking_id, token_hash, expires_at)
      VALUES (${bookingId}::uuid, ${hash(reviewToken)},
              ${new Date(Date.now() + 30 * 86_400_000).toISOString()}::timestamptz)
      ON CONFLICT (booking_id) DO NOTHING`;

    const summary = summaryOf(booking);
    const invite = notify.reviewInvitation(
      summary,
      `${config.appUrl}/${booking.contact_locale}/review/${reviewToken}`,
      booking.contact_locale as Locale,
    );
    await notify.queue(tx, {
      kind: "review.invitation", to: booking.customer_email, locale: booking.contact_locale,
      subject: invite.subject, body: invite.body, bookingId, dedupe: bookingId,
    });
  });

  await writeAudit({
    actorUserId, action: "booking.completed", objectType: "booking", objectId: bookingId,
  });
}

export interface CancellationOutcome {
  feeMinor: bigint;
  refundMinor: bigint;
  freeOfCharge: boolean;
  hoursBefore: number;
}

/** What cancelling now would cost, under the policy frozen on the booking. */
export function cancellationOutcome(
  serviceStartAt: Date, grossMinor: bigint,
  policy: { freeCutoffHours: number; lateFeeBps: number },
  paid: boolean,
): CancellationOutcome {
  const hoursBefore = (serviceStartAt.getTime() - Date.now()) / 3_600_000;
  const free = hoursBefore >= policy.freeCutoffHours || policy.lateFeeBps === 0;
  const feeMinor = free ? 0n : (grossMinor * BigInt(policy.lateFeeBps)) / 10_000n;
  return {
    feeMinor,
    refundMinor: paid ? grossMinor - feeMinor : 0n,
    freeOfCharge: free,
    hoursBefore,
  };
}

const CANCELLABLE = new Set(["CONFIRMED", "DRIVER_ACKNOWLEDGED", "READY", "PENDING_PAYMENT", "REASSIGNING"]);

export async function cancelBooking(
  bookingId: string,
  by: "CUSTOMER" | "DRIVER" | "STAFF",
  reason: string,
  actorUserId?: string,
): Promise<CancellationOutcome> {
  let outcome: CancellationOutcome = { feeMinor: 0n, refundMinor: 0n, freeOfCharge: true, hoursBefore: 0 };

  await sql.begin(async (tx) => {
    const [booking] = await tx<BookingMoneyRow[]>`
      SELECT b.id, b.code, b.status::text AS status, b.driver_id, b.gross_minor,
             b.commission_minor, b.driver_net_minor, b.currency, b.customer_email,
             b.contact_locale, b.service_start_at, b.payment_mode::text AS payment_mode,
             d.public_name AS driver_name, u.email AS driver_email, u.locale AS driver_locale,
           u.id AS driver_user_id,
             v.make, v.model, v.year, v.plate
      FROM bookings b
      JOIN driver_profiles d ON d.id = b.driver_id
      JOIN users u ON u.id = d.user_id
      JOIN vehicles v ON v.id = b.vehicle_id
      WHERE b.id = ${bookingId}::uuid FOR UPDATE OF b`;
    if (!booking) throw new Error("Booking not found.");
    if (!CANCELLABLE.has(booking.status)) {
      throw new Error(`A booking that is ${booking.status.toLowerCase().replaceAll("_", " ")} cannot be cancelled here.`);
    }

    const [policy] = await tx<{ free_cutoff_hours: number; late_fee_bps: number }[]>`
      SELECT free_cutoff_hours, late_fee_bps FROM cancellation_policies
      WHERE version = ${config.policy.version}`;

    const wasPaid = booking.payment_mode === "CARD" && booking.status !== "PENDING_PAYMENT";
    outcome = cancellationOutcome(
      new Date(booking.service_start_at), BigInt(booking.gross_minor),
      { freeCutoffHours: policy?.free_cutoff_hours ?? 24, lateFeeBps: policy?.late_fee_bps ?? 0 },
      wasPaid,
    );

    await tx`
      UPDATE bookings
      SET status='CANCELLED', cancelled_at=now(), cancelled_by=${by},
          cancellation_reason=${reason},
          cancellation_fee_minor=${outcome.feeMinor.toString()}::bigint, updated_at=now()
      WHERE id=${bookingId}::uuid`;
    await tx`
      INSERT INTO booking_status_history (booking_id, from_status, to_status, actor_id, reason)
      VALUES (${bookingId}::uuid, ${booking.status}::booking_status, 'CANCELLED',
              ${actorUserId ?? null}::uuid, ${`${by}: ${reason}`})`;

    // Release the driver's calendar so they can take other work.
    await tx`DELETE FROM availability_blocks WHERE booking_id = ${bookingId}::uuid`;

    // Reverse the money if we were holding any.
    if (wasPaid && outcome.refundMinor > 0n) {
      await post(tx, [
        { account: "DRIVER_PAYABLE", driverId: booking.driver_id, side: "DEBIT",
          amountMinor: BigInt(booking.driver_net_minor), memo: `Reversed on cancellation ${booking.code}` },
        { account: "PLATFORM_REVENUE", side: "DEBIT",
          amountMinor: BigInt(booking.commission_minor), memo: `Commission reversed ${booking.code}` },
        { account: "CARD_CLEARING", side: "CREDIT",
          amountMinor: BigInt(booking.gross_minor), memo: `Refund issued ${booking.code}` },
      ], { bookingId, currency: booking.currency });
    }

    if (by === "DRIVER") {
      await tx`UPDATE driver_profiles SET driver_cancels = driver_cancels + 1 WHERE id = ${booking.driver_id}::uuid`;
    }

    const summary = summaryOf(booking);
    const message = notify.cancellationNotice(summary, reason, booking.contact_locale as Locale);
    await notify.queue(tx, {
      kind: "booking.cancelled.customer", to: booking.customer_email,
      locale: booking.contact_locale, subject: message.subject, body: message.body,
      bookingId, dedupe: `${bookingId}:${by}`,
    });
    await notify.queue(tx, {
      kind: "booking.cancelled.driver", to: booking.driver_email,
      locale: booking.driver_locale ?? "ka", subject: message.subject, body: message.body,
      bookingId, dedupe: `${bookingId}:${by}:driver`,
    });
  });

  await writeAudit({
    actorUserId, action: "booking.cancelled", objectType: "booking", objectId: bookingId,
    reason: `${by}: ${reason}`, after: { feeMinor: outcome.feeMinor.toString() },
  });
  return outcome;
}

/** Verify a manage-booking magic link without putting anything in the URL that identifies a person. */
export async function verifyManageToken(code: string, token: string): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    UPDATE booking_access_tokens t
    SET last_used_at = now()
    FROM bookings b
    WHERE t.booking_id = b.id
      AND b.code = ${code}
      AND t.token_hash = ${hash(token)}
      AND t.expires_at > now()
      AND t.revoked_at IS NULL
    RETURNING b.id`;
  return rows[0]?.id ?? null;
}

export const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

export const humanise = (slug: string): string =>
  slug.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");

function summaryOf(b: BookingMoneyRow) {
  return {
    code: b.code, customerName: null, driverName: b.driver_name,
    vehicle: `${b.make} ${b.model} (${b.year}), ${b.plate}`,
    serviceStartAt: new Date(b.service_start_at),
    route: b.code, grossMinor: BigInt(b.gross_minor), currency: b.currency,
    paymentMode: b.payment_mode as "CASH" | "CARD",
  };
}

const isExclusionViolation = (e: unknown): boolean =>
  typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "23P01";

interface QuoteRow {
  driver_user_id: string | null;
  id: string; driver_id: string; vehicle_id: string; gross_minor: string; currency: string;
  commission_rate_bps: number; commission_minor: string; driver_net_minor: string;
  status: string; expires_at: Date; travel_at: Date; service_tz: string;
  itinerary: unknown; attribution: unknown; drive_minutes: number | null; distance_km100: number | null;
  driver_name: string; driver_email: string; driver_locale: string | null;
  make: string; model: string; year: number; plate: string;
}

interface BookingMoneyRow {
  driver_user_id: string | null;
  id: string; code: string; status: string; driver_id: string; gross_minor: string;
  commission_minor: string; driver_net_minor: string; currency: string;
  customer_email: string; contact_locale: string; service_start_at: Date; payment_mode: string;
  driver_name: string; driver_email: string; driver_locale: string | null;
  make: string; model: string; year: number; plate: string;
}
