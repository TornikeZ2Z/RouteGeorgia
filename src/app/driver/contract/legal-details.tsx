"use client";

import { useActionState } from "react";
import { Alert, Card, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { saveDriverLegalDetailsAction } from "../actions";
import { getTranslator, type Locale } from "@/lib/i18n";

const INITIAL = { ok: false } as const;

/**
 * The identity details the agreement names the driver by.
 *
 * This is a separate step before the signature rather than fields inside the
 * signing form, and deliberately so: the personal number and address are
 * printed in the contract itself, so they have to be settled before there is
 * a document to hash. Folding them into the signing form would mean the text
 * being signed changed as the form was filled in, and the stale-hash guard
 * that protects the signature would have nothing stable to compare against.
 */
export function LegalDetails({
  locale, personalNumber, legalAddress,
}: { locale: Locale; personalNumber: string | null; legalAddress: string | null }) {
  const [state, action] = useActionState(saveDriverLegalDetailsAction, INITIAL);
  const t = getTranslator(locale);

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg text-ink-900">{t("contract.detailsTitle")}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{t("contract.detailsBody")}</p>

      <form action={action} className="mt-5 space-y-4">
        <Field
          label={t("contract.personalNumberLabel")} htmlFor="personalNumber"
          hint={t("contract.personalNumberHint")} required
        >
          <Input
            id="personalNumber" name="personalNumber" required
            inputMode="numeric" pattern="[0-9]{11}" maxLength={11}
            defaultValue={personalNumber ?? ""}
          />
        </Field>

        <Field
          label={t("contract.legalAddressLabel")} htmlFor="legalAddress"
          hint={t("contract.legalAddressHint")} required
        >
          <Input
            id="legalAddress" name="legalAddress" required minLength={6} maxLength={240}
            autoComplete="street-address" defaultValue={legalAddress ?? ""}
          />
        </Field>

        {state.message && (
          <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
        )}

        <SubmitButton>{t("contract.detailsSubmit")}</SubmitButton>
      </form>
    </Card>
  );
}
