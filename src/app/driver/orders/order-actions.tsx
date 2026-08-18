"use client";

import { useActionState, useState } from "react";
import { Alert, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import {
  acknowledgeOrderAction, milestoneAction, declineOrderAction, confirmCashAction,
} from "./actions";
import { getTranslator, isLocale, type Locale, type MessageKey } from "@/lib/i18n";

const INITIAL = { ok: false } as const;

const NEXT_STEP: Record<string, { value: string; label: MessageKey }> = {
  DRIVER_ACKNOWLEDGED: { value: "DRIVER_ARRIVED", label: "console.actArrived" },
  READY:               { value: "DRIVER_ARRIVED", label: "console.actArrived" },
  DRIVER_ARRIVED:      { value: "IN_PROGRESS",    label: "console.actStart" },
  IN_PROGRESS:         { value: "COMPLETED",      label: "console.actComplete" },
};

export function OrderActions({
  bookingId, status, paymentMode, cashConfirmed, locale = "ka",
}: { bookingId: string; status: string; paymentMode: string; cashConfirmed: boolean; locale?: string }) {
  const t = getTranslator(isLocale(locale) ? (locale as Locale) : "ka");
  const [ackState, ack] = useActionState(acknowledgeOrderAction, INITIAL);
  const [stepState, step] = useActionState(milestoneAction, INITIAL);
  const [declineState, decline] = useActionState(declineOrderAction, INITIAL);
  const [cashState, cash] = useActionState(confirmCashAction, INITIAL);
  const [declining, setDeclining] = useState(false);

  const message = ackState.message ?? stepState.message ?? declineState.message ?? cashState.message;
  const ok = ackState.ok || stepState.ok || declineState.ok || cashState.ok;
  const next = NEXT_STEP[status];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "CONFIRMED" && (
          <form action={ack}>
            <input type="hidden" name="bookingId" value={bookingId} />
            <SubmitButton>{t("console.actConfirm")}</SubmitButton>
          </form>
        )}

        {next && (
          <form action={step}>
            <input type="hidden" name="bookingId" value={bookingId} />
            <input type="hidden" name="milestone" value={next.value} />
            <SubmitButton>{t(next.label)}</SubmitButton>
          </form>
        )}

        {status === "COMPLETED" && paymentMode === "CASH" && !cashConfirmed && (
          <form action={cash}>
            <input type="hidden" name="bookingId" value={bookingId} />
            <SubmitButton variant="secondary">{t("console.actCashCollected")}</SubmitButton>
          </form>
        )}

        {["CONFIRMED", "DRIVER_ACKNOWLEDGED", "READY"].includes(status) && !declining && (
          <button
            onClick={() => setDeclining(true)}
            className="rounded-lg border border-ink-300 px-3 py-2 text-sm text-ink-600 hover:bg-ink-50"
          >
            {t("console.actDecline")}
          </button>
        )}
      </div>

      {declining && (
        <form action={decline} className="space-y-2 rounded-lg border border-ink-200 p-3">
          <input type="hidden" name="bookingId" value={bookingId} />
          <p className="text-sm text-ink-700">
            {t("console.declineWarn")}
          </p>
          <Textarea name="reason" rows={2} required minLength={5} placeholder={t("console.declineWhy")} />
          <div className="flex gap-2">
            <SubmitButton variant="danger">{t("console.declineBtn")}</SubmitButton>
            <button type="button" onClick={() => setDeclining(false)}
                    className="rounded-lg border border-ink-200 px-3 py-2 text-sm">{t("console.keepIt")}</button>
          </div>
        </form>
      )}

      {message && <Alert tone={ok ? "success" : "danger"}>{message}</Alert>}
    </div>
  );
}
