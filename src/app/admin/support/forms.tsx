"use client";

import { useActionState, useState } from "react";
import { Alert, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { openTicketAction, updateTicketAction } from "@/app/admin/actions";

const INITIAL = { ok: false } as const;

function Result({ state }: { state: { ok: boolean; message?: string; errors?: string[] } }) {
  if (!state.message && !state.errors?.length) return null;
  return (
    <div className="mt-3">
      <Alert tone={state.ok ? "success" : "danger"}>
        {state.message}
        {state.errors?.length ? (
          <ul className="mt-1 list-inside list-disc">{state.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        ) : null}
      </Alert>
    </div>
  );
}

export function OpenTicketForm({ bookings }: { bookings: { id: string; code: string }[] }) {
  const [state, action] = useActionState(openTicketAction, INITIAL);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
              className="rounded-lg bg-wine-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-wine-700">
        Open a ticket
      </button>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-ink-900">Open a ticket</h2>
      <form action={action} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Subject" htmlFor="subject" required>
            <Input id="subject" name="subject" minLength={5} required
                   placeholder="e.g. Driver unreachable, pickup in 3 hours" />
          </Field>
          <Field label="Category" htmlFor="category" required>
            <Select id="category" name="category" defaultValue="booking">
              <option value="booking">Booking problem</option>
              <option value="driver">Driver conduct or availability</option>
              <option value="safety">Safety incident</option>
              <option value="payment">Payment or refund</option>
              <option value="document">Documents or verification</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Severity" htmlFor="severity" required>
            <Select id="severity" name="severity" defaultValue="SEV3">
              <option value="SEV1">SEV-1 — safety or data exposure</option>
              <option value="SEV2">SEV-2 — upcoming trip at risk</option>
              <option value="SEV3">SEV-3 — single booking</option>
              <option value="SEV4">SEV-4 — minor</option>
            </Select>
          </Field>
          <Field label="Related booking" htmlFor="bookingId">
            <Select id="bookingId" name="bookingId" defaultValue="">
              <option value="">Not about one booking</option>
              {bookings.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="What happened?" htmlFor="note">
          <Textarea id="note" name="note" rows={3} />
        </Field>
        <div className="flex gap-2">
          <SubmitButton>Open ticket</SubmitButton>
          <button type="button" onClick={() => setOpen(false)}
                  className="rounded-lg border border-ink-200 px-3 py-2 text-sm">Cancel</button>
        </div>
      </form>
      <Result state={state} />
    </Card>
  );
}

export function TicketActions({ ticketId }: { ticketId: string }) {
  const [state, action] = useActionState(updateTicketAction, INITIAL);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Set state" htmlFor={`state-${ticketId}`}>
          <Select id={`state-${ticketId}`} name="state" defaultValue="OPEN">
            <option value="OPEN">Open</option>
            <option value="WAITING">Waiting on someone</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </Select>
        </Field>
        <Field label="Resolution" htmlFor={`res-${ticketId}`} hint="Required to resolve or close.">
          <Input id={`res-${ticketId}`} name="resolution" />
        </Field>
      </div>
      <Field label="Add a note" htmlFor={`note-${ticketId}`}>
        <Textarea id={`note-${ticketId}`} name="note" rows={2} />
      </Field>
      <SubmitButton variant="secondary">Update</SubmitButton>
      <Result state={state} />
    </form>
  );
}
