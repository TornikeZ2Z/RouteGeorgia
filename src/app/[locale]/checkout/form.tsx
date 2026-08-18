"use client";

import { useState } from "react";
import { Alert, Card, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { getTranslator, type Locale } from "@/lib/i18n";

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
  const t = getTranslator(locale);

  return (
    <form action="/api/bookings" method="post" className="space-y-6">
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="locale" value={locale} />

      <Card className="p-4 sm:p-6">
        <h2 className="mb-4 font-semibold text-ink-900">{t("checkout.whoT")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("checkout.leadName")} htmlFor="customerName" required>
            <Input id="customerName" name="customerName" autoComplete="name" required />
          </Field>
          <Field label={t("checkout.email")} htmlFor="customerEmail" hint={t("checkout.emailHint")} required>
            <Input id="customerEmail" name="customerEmail" type="email" autoComplete="email" required />
          </Field>
          <Field label={t("checkout.phone")} htmlFor="customerPhone" hint={t("checkout.phoneHint")} required>
            <Input id="customerPhone" name="customerPhone" type="tel" autoComplete="tel" placeholder="+995 …" required />
          </Field>
          <Field label={t("checkout.passengers")} htmlFor="passengers" required>
            <Input id="passengers" name="passengers" type="number" min={1} max={20} defaultValue={defaults.passengers} required />
          </Field>
          <Field label={t("checkout.children")} htmlFor="children">
            <Input id="children" name="children" type="number" min={0} max={20} defaultValue={0} />
          </Field>
          <Field label={t("checkout.bags")} htmlFor="luggage">
            <Input id="luggage" name="luggage" type="number" min={0} max={30} defaultValue={defaults.luggage} />
          </Field>
          <Field label={t("checkout.childSeats")} htmlFor="childSeats" hint={t("checkout.childSeatsHint")}>
            <Input id="childSeats" name="childSeats" type="number" min={0} max={6} defaultValue={0} />
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2 text-sm text-ink-700">
              <input type="checkbox" name="pets" className="size-4 rounded" /> {t("checkout.pet")}
            </label>
          </div>
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <h2 className="mb-1 font-semibold text-ink-900">{t("checkout.whereT")}</h2>
        <p className="mb-4 text-sm text-ink-600">
          {t("checkout.whereB")}
        </p>
        <div className="space-y-4">
          <Field label={t("checkout.pickup")} htmlFor="pickupAddress" required>
            <Input id="pickupAddress" name="pickupAddress" required />
          </Field>
          <Field label={t("checkout.dropoff")} htmlFor="dropoffAddress" required>
            <Input id="dropoffAddress" name="dropoffAddress" required />
          </Field>

          {isAirport && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("checkout.flight")} htmlFor="flightNumber"
                hint={t("checkout.flightHint")}
              >
                <Input id="flightNumber" name="flightNumber" placeholder="e.g. A9 601" />
              </Field>
              <Field label={t("checkout.signName")} htmlFor="pickupSignName">
                <Input id="pickupSignName" name="pickupSignName" />
              </Field>
            </div>
          )}

          <Field label={t("checkout.notes")} htmlFor="notes" hint={t("checkout.notesHint")}>
            <Textarea id="notes" name="notes" rows={3} />
          </Field>
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <h2 className="mb-4 font-semibold text-ink-900">{t("checkout.payT")}</h2>
        <fieldset className="space-y-3">
          <legend className="sr-only">How would you like to pay?</legend>

          <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${payment === "CASH" ? "border-wine-600 bg-wine-50" : "border-ink-200"} ${!cashAvailable ? "opacity-50" : ""}`}>
            <input
              type="radio" name="paymentMode" value="CASH" className="mt-1 size-4"
              checked={payment === "CASH"} disabled={!cashAvailable}
              onChange={() => setPayment("CASH")}
            />
            <span>
              <span className="block font-medium text-ink-900">{t("checkout.cashT")}</span>
              <span className="block text-sm text-ink-600">
                {t("checkout.cashB")}
              </span>
            </span>
          </label>

          <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${payment === "CARD" ? "border-wine-600 bg-wine-50" : "border-ink-200"}`}>
            <input
              type="radio" name="paymentMode" value="CARD" className="mt-1 size-4"
              checked={payment === "CARD"} onChange={() => setPayment("CARD")}
            />
            <span>
              <span className="block font-medium text-ink-900">{t("checkout.cardT")}</span>
              <span className="block text-sm text-ink-600">
                {t("checkout.cardB")}
              </span>
            </span>
          </label>
        </fieldset>

        <label className="mt-5 flex items-start gap-2 text-sm text-ink-700">
          <input type="checkbox" name="acceptTerms" className="mt-0.5 size-4 rounded" required />
          <span>
            {t("checkout.terms")}
          </span>
        </label>
      </Card>

      {error && <Alert tone="danger" title={t("checkout.errorT")}>{error}</Alert>}

      <SubmitButton>
        {payment === "CARD" ? t("checkout.submitCard") : t("checkout.submitCash")}
      </SubmitButton>
    </form>
  );
}
