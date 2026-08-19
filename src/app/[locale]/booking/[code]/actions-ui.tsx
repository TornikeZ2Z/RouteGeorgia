"use client";

import { useActionState, useState } from "react";
import { Alert, Card, Field, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { cancelBookingAction, sendMessageAction } from "./actions";
import { getTranslator, isLocale, type Locale } from "@/lib/i18n";

const INITIAL = { ok: false } as const;

export function CancelBooking({ code, token, locale }: { code: string; token: string; locale: string }) {
  const [state, action] = useActionState(cancelBookingAction, INITIAL);
  const [confirming, setConfirming] = useState(false);
  const t = getTranslator(isLocale(locale) ? (locale as Locale) : "en");

  if (state.ok) return <Alert tone="success">{state.message}</Alert>;

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="w-full rounded-lg border border-ink-300 px-4 py-2 text-sm text-ink-700 hover:bg-ink-50"
      >
        {t("booking.cancelBtn")}
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="token" value={token} />
      <Field label={t("booking.whyCancel")} htmlFor="reason" hint={t("booking.whyCancelHint")} required>
        <Textarea id="reason" name="reason" rows={2} required minLength={3} />
      </Field>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <div className="flex gap-2">
        <SubmitButton variant="danger">{t("booking.confirmCancel")}</SubmitButton>
        <button type="button" onClick={() => setConfirming(false)}
                className="rounded-lg border border-ink-200 px-3 py-2 text-sm">{t("booking.keep")}</button>
      </div>
    </form>
  );
}

export function MessageThread({
  bookingId, code, token, locale, messages,
}: {
  bookingId: string; code: string; token: string; locale: string;
  messages: { id: string; sender: string; body: string; created_at: Date }[];
}) {
  const [state, action] = useActionState(sendMessageAction, INITIAL);
  const t = getTranslator(isLocale(locale) ? (locale as Locale) : "en");

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="font-semibold text-ink-900">{t("booking.msgT")}</h2>
      <p className="mt-1 text-sm text-ink-600">
        {t("booking.msgB")}
      </p>

      {messages.length > 0 && (
        <ul className="mt-4 space-y-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-lg px-3 py-2 text-sm ${m.sender === "CUSTOMER" ? "ml-8 bg-ink-100" : "mr-8 bg-ink-100"}`}
            >
              <p className="text-xs text-ink-500">
                {m.sender === "CUSTOMER" ? t("booking.you") : m.sender === "DRIVER" ? t("booking.driver") : t("booking.support")}
                {" · "}
                {new Date(m.created_at).toLocaleString()}
              </p>
              <p className="mt-1 text-ink-800">{m.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="token" value={token} />
        <Field label={t("booking.msgLabel")} htmlFor="body">
          <Textarea id="body" name="body" rows={3} placeholder={t("booking.msgPlaceholder")} />
        </Field>
        {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
        <SubmitButton>{t("booking.send")}</SubmitButton>
      </form>
    </Card>
  );
}
