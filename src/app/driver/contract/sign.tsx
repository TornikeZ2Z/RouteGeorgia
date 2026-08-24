"use client";

import { useActionState } from "react";
import { Alert, Card, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { signContractAction } from "../actions";
import { getTranslator, type Locale } from "@/lib/i18n";

const INITIAL = { ok: false } as const;

/**
 * The signature block.
 *
 * Typing the name is deliberately required rather than offering a single
 * "I agree" button: it is the act that makes an electronic signature an
 * intentional one, and it is what the agreement itself says will happen.
 *
 * bodyHash travels with the form. If the document is revised, or the
 * commission rate changes, between this page rendering and the button being
 * pressed, the server refuses the stale signature rather than recording
 * agreement to text nobody is offering any more.
 */
export function SignContract({
  locale, bodyHash, suggestedName,
}: { locale: Locale; bodyHash: string; suggestedName: string }) {
  const [state, action] = useActionState(signContractAction, INITIAL);
  const t = getTranslator(locale);

  if (state.ok) {
    return (
      <Card className="p-5 sm:p-6">
        <Alert tone="success" title={t("contract.signedTitle")}>{state.message}</Alert>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg text-ink-900">{t("contract.signHeading")}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{t("contract.signIntro")}</p>

      <form action={action} className="mt-5 space-y-4">
        <input type="hidden" name="bodyHash" value={bodyHash} />

        <Field label={t("contract.nameLabel")} htmlFor="signedName" hint={t("contract.nameHint")} required>
          <Input
            id="signedName" name="signedName" required minLength={3} maxLength={160}
            autoComplete="name" placeholder={suggestedName || undefined}
          />
        </Field>

        <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-900">
          <input type="checkbox" name="confirmed" required className="mt-0.5 size-5 shrink-0 rounded border-ink-300" />
          <span>{t("contract.confirmLabel")}</span>
        </label>

        {state.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}

        <SubmitButton>{t("contract.submit")}</SubmitButton>
      </form>
    </Card>
  );
}
