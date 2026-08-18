import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@db/client";
import { isLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { getDisplayCurrency, getRate, convert, CANONICAL } from "@/lib/currency";
import { driverBalance } from "@/lib/ledger";
import { humanise } from "@/lib/booking";
import { Alert, Card, EmptyState } from "@/components/ui";
import { CheckoutForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ quote?: string; error?: string }>;
}

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { quote: quoteId, error } = await searchParams;
  if (!quoteId) return <EmptyState title="No quote selected">Choose a driver from your search results.</EmptyState>;

  const [quote] = await sql<QuoteRow[]>`
    SELECT q.id, q.gross_minor, q.currency, q.expires_at, q.status::text AS status,
           q.breakdown, q.driver_id,
           s.travel_at, s.passengers, s.luggage, s.itinerary,
           d.public_name AS driver_name, d.handle,
           v.make, v.model, v.year, v.seats, v.luggage AS vehicle_luggage, v.class::text AS class,
           (q.inputs->>'driveMinutes')::int AS drive_minutes,
           (q.inputs->>'distanceKm100')::int AS distance_km100
    FROM quotes q
    JOIN route_searches s ON s.id = q.search_id
    JOIN driver_profiles d ON d.id = q.driver_id
    JOIN vehicles v ON v.id = q.vehicle_id
    WHERE q.id = ${quoteId}::uuid`;

  if (!quote) return <EmptyState title="That quote could not be found">Please search again.</EmptyState>;

  const expired = new Date(quote.expires_at) <= new Date() || quote.status === "CONSUMED";
  if (expired) {
    return (
      <EmptyState title="This price has expired">
        <p>Quotes are held for 15 minutes so drivers are not double-sold.</p>
        <Link href={`/${locale}`} className="mt-3 inline-block text-wine-700 underline">Start a new search</Link>
      </EmptyState>
    );
  }

  const [currency, balance] = await Promise.all([
    getDisplayCurrency(),
    driverBalance(quote.driver_id),
  ]);
  const rate = await getRate(currency);

  const itinerary = quote.itinerary as { origin: string; stops?: string[]; destination: string };
  const points = [itinerary.origin, ...(itinerary.stops ?? []), itinerary.destination];
  const travelAt = new Date(quote.travel_at);
  const gross = BigInt(quote.gross_minor);
  const breakdown = quote.breakdown as { lines: { label: string; detail?: string; amountMinor: string }[] };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        <h1 className="font-display text-3xl text-ink-900">Complete your booking</h1>
        <p className="mt-1 text-sm text-ink-600">
          Your driver is held for you while you fill this in.
        </p>

        {balance.cashBlocked && (
          <div className="mt-4">
            <Alert tone="warning" title="Card payment only for this driver">
              This driver cannot take cash bookings right now. You can still book them by card.
            </Alert>
          </div>
        )}

        <div className="mt-6">
          <CheckoutForm
            quoteId={quote.id}
            locale={locale as Locale}
            defaults={{ passengers: quote.passengers, luggage: quote.luggage }}
            cashAvailable={!balance.cashBlocked}
            isAirport={points.some((p) => p.includes("airport"))}
            error={error}
          />
        </div>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <Card className="p-4">
          <h2 className="font-semibold text-ink-900">Your trip</h2>

          <ol className="mt-3 space-y-1 text-sm text-ink-700">
            {points.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="text-ink-400">{i === 0 ? "●" : i === points.length - 1 ? "◆" : "○"}</span>
                {humanise(p)}
              </li>
            ))}
          </ol>

          <dl className="mt-4 space-y-1 border-t border-ink-100 pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Departure</dt>
              <dd className="text-right">{travelAt.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Driving time</dt>
              <dd>{Math.floor((quote.drive_minutes ?? 0) / 60)} h {(quote.drive_minutes ?? 0) % 60} min</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Distance</dt>
              <dd>{Math.round((quote.distance_km100 ?? 0) / 100)} km</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Driver</dt>
              <dd>{quote.driver_name}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Vehicle</dt>
              <dd className="text-right">{quote.make} {quote.model} ({quote.year})</dd></div>
          </dl>

          <div className="mt-4 border-t border-ink-100 pt-3">
            <div className="flex items-baseline justify-between">
              <span className="font-medium text-ink-900">Total</span>
              <span className="font-display text-2xl text-ink-900">
                {formatMoney(gross, CANONICAL, locale)}
              </span>
            </div>
            {rate.currency !== CANONICAL && (
              <p className="text-right text-sm text-ink-500">
                ≈ {formatMoney(convert(gross, rate), rate.currency, locale)}
              </p>
            )}
            <p className="mt-1 text-xs text-ink-500">
              For the whole vehicle, not per person. Charged in Georgian lari.
            </p>
          </div>

          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-ink-500">How this price is built</summary>
            <ul className="mt-2 space-y-1 text-ink-600">
              {breakdown.lines?.map((line, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span>{line.label}</span>
                  <span className="tabular-nums">{formatMoney(BigInt(line.amountMinor), CANONICAL, locale)}</span>
                </li>
              ))}
            </ul>
          </details>

          <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
            Free cancellation. We ask for at least 24 hours' notice where possible.
          </p>
        </Card>
      </aside>
    </div>
  );
}

interface QuoteRow {
  id: string; gross_minor: string; currency: string; expires_at: Date; status: string;
  breakdown: unknown; driver_id: string; travel_at: Date; passengers: number; luggage: number;
  itinerary: unknown; driver_name: string; handle: string;
  make: string; model: string; year: number; seats: number; vehicle_luggage: number; class: string;
  drive_minutes: number | null; distance_km100: number | null;
}
