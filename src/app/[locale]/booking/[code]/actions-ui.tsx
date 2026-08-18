"use client";

import { useActionState, useState } from "react";
import { Alert, Card, Field, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { cancelBookingAction, sendMessageAction } from "./actions";

const INITIAL = { ok: false } as const;

export function CancelBooking({ code, token }: { code: string; token: string }) {
  const [state, action] = useActionState(cancelBookingAction, INITIAL);
  const [confirming, setConfirming] = useState(false);

  if (state.ok) return <Alert tone="success">{state.message}</Alert>;

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="w-full rounded-lg border border-ink-300 px-4 py-2 text-sm text-ink-700 hover:bg-ink-50"
      >
        Cancel this booking
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="token" value={token} />
      <Field label="Why are you cancelling?" htmlFor="reason" hint="This helps us improve, and is shared with your driver." required>
        <Textarea id="reason" name="reason" rows={2} required minLength={3} />
      </Field>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <div className="flex gap-2">
        <SubmitButton variant="danger">Confirm cancellation</SubmitButton>
        <button type="button" onClick={() => setConfirming(false)}
                className="rounded-lg border border-ink-200 px-3 py-2 text-sm">Keep booking</button>
      </div>
    </form>
  );
}

export function MessageThread({
  bookingId, code, token, messages,
}: {
  bookingId: string; code: string; token: string;
  messages: { id: string; sender: string; body: string; created_at: Date }[];
}) {
  const [state, action] = useActionState(sendMessageAction, INITIAL);

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="font-semibold text-ink-900">Message your driver</h2>
      <p className="mt-1 text-sm text-ink-600">
        Keep arrangements here so our support team can see them if anything changes.
      </p>

      {messages.length > 0 && (
        <ul className="mt-4 space-y-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-lg px-3 py-2 text-sm ${m.sender === "CUSTOMER" ? "ml-8 bg-wine-50" : "mr-8 bg-ink-100"}`}
            >
              <p className="text-xs text-ink-500">
                {m.sender === "CUSTOMER" ? "You" : m.sender === "DRIVER" ? "Driver" : "Support"}
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
        <Field label="Your message" htmlFor="body">
          <Textarea id="body" name="body" rows={3} placeholder="e.g. We will have two large suitcases and a folding pushchair." />
        </Field>
        {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
        <SubmitButton>Send</SubmitButton>
      </form>
    </Card>
  );
}
