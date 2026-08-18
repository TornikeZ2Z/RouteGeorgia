"use client";

import { useState } from "react";
import { Alert, Card, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import type { Locale } from "@/lib/i18n";

export function CheckoutForm({
  quoteId, locale, defaults, cashAvailable, isAirport, error,
}: {
  quoteId: string;
  locale: Locale;
  defaults: { passengers: number; luggage: number };
  cashAvailable: boolean;
  isAirport: boolean;
  error?: string;
}) {
  const [payment, setPayment] = useState<"CASH" | "CARD">(cashAvailable ? "CASH" : "CARD");

  return (
    <form action="/api/bookings" method="post" className="space-y-6">
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="locale" value={locale} />

      <Card className="p-4 sm:p-6">
        <h2 className="mb-4 font-semibold text-ink-900">Who is travelling</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lead traveller name" htmlFor="customerName" required>
            <Input id="customerName" name="customerName" autoComplete="name" required />
          </Field>
          <Field label="Email" htmlFor="customerEmail" hint="Your confirmation and driver details go here." required>
            <Input id="customerEmail" name="customerEmail" type="email" autoComplete="email" required />
          </Field>
          <Field label="Phone" htmlFor="customerPhone" hint="With country code. The driver may call on the day." required>
            <Input id="customerPhone" name="customerPhone" type="tel" autoComplete="tel" placeholder="+995 …" required />
          </Field>
          <Field label="Passengers" htmlFor="passengers" required>
            <Input id="passengers" name="passengers" type="number" min={1} max={20} defaultValue={defaults.passengers} required />
          </Field>
          <Field label="Of which children" htmlFor="children">
            <Input id="children" name="children" type="number" min={0} max={20} defaultValue={0} />
          </Field>
          <Field label="Large bags" htmlFor="luggage">
            <Input id="luggage" name="luggage" type="number" min={0} max={30} defaultValue={defaults.luggage} />
          </Field>
          <Field label="Child seats needed" htmlFor="childSeats" hint="Tell us now so the driver can bring them.">
            <Input id="childSeats" name="childSeats" type="number" min={0} max={6} defaultValue={0} />
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2 text-sm text-ink-700">
              <input type="checkbox" name="pets" className="size-4 rounded" /> Travelling with a pet
            </label>
          </div>
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <h2 className="mb-1 font-semibold text-ink-900">Where to meet</h2>
        <p className="mb-4 text-sm text-ink-600">
          Be specific. “Hotel reception, 12 Rustaveli Avenue” finds you; “Tbilisi” does not.
        </p>
        <div className="space-y-4">
          <Field label="Pickup address or meeting point" htmlFor="pickupAddress" required>
            <Input id="pickupAddress" name="pickupAddress" required />
          </Field>
          <Field label="Drop-off address" htmlFor="dropoffAddress" required>
            <Input id="dropoffAddress" name="dropoffAddress" required />
          </Field>

          {isAirport && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Flight number" htmlFor="flightNumber"
                hint="We track the arrival and move the pickup if it is delayed, at no extra cost."
              >
                <Input id="flightNumber" name="flightNumber" placeholder="e.g. A9 601" />
              </Field>
              <Field label="Name for the pickup sign" htmlFor="pickupSignName">
                <Input id="pickupSignName" name="pickupSignName" />
              </Field>
            </div>
          )}

          <Field label="Anything the driver should know" htmlFor="notes" hint="Stops, accessibility needs, extra luggage.">
            <Textarea id="notes" name="notes" rows={3} />
          </Field>
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <h2 className="mb-4 font-semibold text-ink-900">Payment</h2>
        <fieldset className="space-y-3">
          <legend className="sr-only">How would you like to pay?</legend>

          <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${payment === "CASH" ? "border-wine-600 bg-wine-50" : "border-ink-200"} ${!cashAvailable ? "opacity-50" : ""}`}>
            <input
              type="radio" name="paymentMode" value="CASH" className="mt-1 size-4"
              checked={payment === "CASH"} disabled={!cashAvailable}
              onChange={() => setPayment("CASH")}
            />
            <span>
              <span className="block font-medium text-ink-900">Cash to the driver</span>
              <span className="block text-sm text-ink-600">
                Pay the agreed amount in Georgian lari at the end of the trip. Nothing is charged now.
              </span>
            </span>
          </label>

          <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${payment === "CARD" ? "border-wine-600 bg-wine-50" : "border-ink-200"}`}>
            <input
              type="radio" name="paymentMode" value="CARD" className="mt-1 size-4"
              checked={payment === "CARD"} onChange={() => setPayment("CARD")}
            />
            <span>
              <span className="block font-medium text-ink-900">Card online</span>
              <span className="block text-sm text-ink-600">
                Paid securely on our provider's page. We never see your card number.
              </span>
            </span>
          </label>
        </fieldset>

        <label className="mt-5 flex items-start gap-2 text-sm text-ink-700">
          <input type="checkbox" name="acceptTerms" className="mt-0.5 size-4 rounded" required />
          <span>
            I accept the terms of service and privacy notice, and I understand that driving times
            exclude stops, traffic and weather delays.
          </span>
        </label>
      </Card>

      {error && <Alert tone="danger" title="We could not complete that">{error}</Alert>}

      <SubmitButton>
        {payment === "CARD" ? "Continue to payment" : "Confirm booking"}
      </SubmitButton>
    </form>
  );
}
