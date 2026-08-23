import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "@db/client";
import {
  createBooking, BookingConflictError, QuoteExpiredError, CashUnavailableError,
} from "@/lib/booking";
import { getPaymentProvider } from "@/lib/payments";
import { dispatchPending } from "@/lib/notifications";
import { config } from "@/lib/config";
import type { Locale } from "@/lib/i18n";
import { assertSameOrigin, rateLimit, clientKey, CrossOriginError, seeOther } from "@/lib/security";

/**
 * Checkout submission.
 *
 * A plain form POST rather than a server action, so booking works with
 * JavaScript disabled and can be exercised by any HTTP client. Validation
 * failures come back on the checkout page as `?error=`.
 */
const Schema = z.object({
  quoteId: z.string().uuid(),
  locale: z.enum(["en", "ka", "ru"]).default("en"),
  customerName: z.string().min(2, "Enter the name of the lead traveller.").max(120),
  customerEmail: z.string().email("Enter a valid email address — your confirmation goes there."),
  customerPhone: z.string().min(6, "Enter a phone number including the country code.").max(32),
  pickupAddress: z.string().min(3, "Enter the exact pickup address or meeting point.").max(300),
  dropoffAddress: z.string().min(3, "Enter the exact drop-off address.").max(300),
  flightNumber: z.string().max(16).optional(),
  pickupSignName: z.string().max(80).optional(),
  passengers: z.coerce.number().int().min(1).max(20),
  children: z.coerce.number().int().min(0).max(20).default(0),
  luggage: z.coerce.number().int().min(0).max(30).default(0),
  childSeats: z.coerce.number().int().min(0).max(6).default(0),
  notes: z.string().max(1000).optional(),
  paymentMode: z.enum(["CASH", "CARD"]),
});

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
  } catch (err) {
    if (err instanceof CrossOriginError) return NextResponse.json({ error: "invalid" }, { status: 403 });
    throw err;
  }

  // Bookings hold a real driver's calendar, so a script hammering this would
  // take live supply off the market.
  const limit = rateLimit(await clientKey("booking"), 12, 600);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many booking attempts. Please wait a few minutes." }, {
      status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const form = await request.formData();
  const raw = Object.fromEntries(form) as Record<string, string>;
  const locale = (["en", "ka", "ru"].includes(raw.locale ?? "") ? raw.locale : "en") as Locale;

  const back = (message: string, quoteId?: string) =>
    seeOther(`/${locale}/checkout?quote=${quoteId ?? raw.quoteId ?? ""}&error=${encodeURIComponent(message)}`);

  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return back(parsed.error.issues.map((i) => i.message).join(" "));
  if (form.get("acceptTerms") !== "on") {
    return back("Please accept the terms and privacy notice to continue.");
  }
  const v = parsed.data;

  try {
    const booking = await createBooking(v.quoteId, {
      customerName: v.customerName,
      customerEmail: v.customerEmail,
      customerPhone: v.customerPhone,
      contactLocale: locale,
      pickupAddress: v.pickupAddress,
      dropoffAddress: v.dropoffAddress,
      flightNumber: v.flightNumber || null,
      pickupSignName: v.pickupSignName || null,
      passengers: v.passengers,
      children: v.children,
      luggage: v.luggage,
      childSeats: v.childSeats,
      pets: form.get("pets") === "on",
      notes: v.notes || null,
      paymentMode: v.paymentMode,
      acceptedTerms: true,
    });

    if (v.paymentMode === "CARD") {
      const provider = getPaymentProvider();
      const session = await provider.createCheckout({
        bookingCode: booking.code,
        amountMinor: booking.grossMinor,
        currency: booking.currency,
        customerEmail: v.customerEmail,
        returnUrl: `${config.appUrl}/${locale}/booking/${booking.code}?t=${booking.manageToken}`,
      });

      await sql`
        INSERT INTO payments (booking_id, kind, state, provider, provider_ref, amount_minor,
                              currency, idempotency_key)
        VALUES (${booking.id}::uuid, 'AUTHORIZATION', 'PENDING', ${provider.name},
                ${session.providerRef}, ${booking.grossMinor.toString()}::bigint,
                ${booking.currency}, ${`checkout:${booking.id}`})
        ON CONFLICT (idempotency_key) DO NOTHING`;

      // Payment-provider URLs stay absolute; our own URLs re-base onto the
      // incoming request so redirects work on any host (localhost, previews, prod).
      const target = new URL(session.redirectUrl, request.url);
      const ownHost = new URL(config.appUrl).host;
      return target.host === ownHost
        ? seeOther(target.pathname + target.search)
        : NextResponse.redirect(target, { status: 303 });
    }

    await dispatchPending().catch(() => {});
    return seeOther(`/${locale}/booking/${booking.code}?t=${booking.manageToken}`);
  } catch (err) {
    if (err instanceof BookingConflictError || err instanceof QuoteExpiredError || err instanceof CashUnavailableError) {
      return back(err.message, v.quoteId);
    }
    throw err;
  }
}
