"use client";

import { useActionState, useState } from "react";
import { Alert, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import {
  acknowledgeOrderAction, milestoneAction, declineOrderAction, confirmCashAction,
} from "./actions";

const INITIAL = { ok: false } as const;

const NEXT_STEP: Record<string, { value: string; label: string }> = {
  DRIVER_ACKNOWLEDGED: { value: "DRIVER_ARRIVED", label: "I have arrived at the pickup" },
  READY:               { value: "DRIVER_ARRIVED", label: "I have arrived at the pickup" },
  DRIVER_ARRIVED:      { value: "IN_PROGRESS",    label: "Passenger on board — start trip" },
  IN_PROGRESS:         { value: "COMPLETED",      label: "Trip finished" },
};

export function OrderActions({
  bookingId, status, paymentMode, cashConfirmed,
}: { bookingId: string; status: string; paymentMode: string; cashConfirmed: boolean }) {
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
            <SubmitButton>Confirm this order</SubmitButton>
          </form>
        )}

        {next && (
          <form action={step}>
            <input type="hidden" name="bookingId" value={bookingId} />
            <input type="hidden" name="milestone" value={next.value} />
            <SubmitButton>{next.label}</SubmitButton>
          </form>
        )}

        {status === "COMPLETED" && paymentMode === "CASH" && !cashConfirmed && (
          <form action={cash}>
            <input type="hidden" name="bookingId" value={bookingId} />
            <SubmitButton variant="secondary">Confirm I collected the cash</SubmitButton>
          </form>
        )}

        {["CONFIRMED", "DRIVER_ACKNOWLEDGED", "READY"].includes(status) && !declining && (
          <button
            onClick={() => setDeclining(true)}
            className="rounded-lg border border-ink-300 px-3 py-2 text-sm text-ink-600 hover:bg-ink-50"
          >
            I cannot do this trip
          </button>
        )}
      </div>

      {declining && (
        <form action={decline} className="space-y-2 rounded-lg border border-ink-200 p-3">
          <input type="hidden" name="bookingId" value={bookingId} />
          <p className="text-sm text-ink-700">
            Declining is recorded and affects your ranking. Operations will find the traveller
            another driver.
          </p>
          <Textarea name="reason" rows={2} required minLength={5} placeholder="Why can you not do this trip?" />
          <div className="flex gap-2">
            <SubmitButton variant="danger">Decline</SubmitButton>
            <button type="button" onClick={() => setDeclining(false)}
                    className="rounded-lg border border-ink-200 px-3 py-2 text-sm">Keep it</button>
          </div>
        </form>
      )}

      {message && <Alert tone={ok ? "success" : "danger"}>{message}</Alert>}
    </div>
  );
}
