"use client";

import { useActionState, useState } from "react";
import { Alert, Badge, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import {
  reassignBookingAction, cancelBookingAdminAction, refundBookingAction,
  editBookingAction, supportMessageAction, resendNotificationAction,
} from "@/app/admin/actions";

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

interface Option {
  driverId: string; vehicleId: string; driverName: string; vehicle: string;
  seats: number; luggage: number; ratingAverage: number | null; ratingCount: number;
  languages: string[]; fourWheelDrive: boolean;
}

export function ReassignPanel({ bookingId, options }: { bookingId: string; options: Option[] }) {
  const [state, action] = useActionState(reassignBookingAction, INITIAL);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(options[0] ? `${options[0].driverId}|${options[0].vehicleId}` : "");

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-ink-900">Reassign</h2>
      <p className="mt-1 text-sm text-ink-600">
        {options.length === 0
          ? "No other driver is free and eligible for this window."
          : `${options.length} eligible driver(s) — free for the whole window, documents valid on the travel date, and at least as much capacity.`}
      </p>

      {options.length > 0 && !open && (
        <button onClick={() => setOpen(true)}
                className="mt-3 w-full rounded-lg border border-ink-300 px-4 py-2.5 text-sm hover:bg-ink-50">
          Find a replacement
        </button>
      )}

      {open && (
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="driverId" value={choice.split("|")[0]} />
          <input type="hidden" name="vehicleId" value={choice.split("|")[1]} />

          <Field label="Replacement driver" htmlFor="replacement" required>
            <Select id="replacement" value={choice} onChange={(e) => setChoice(e.target.value)}>
              {options.map((o) => (
                <option key={o.vehicleId} value={`${o.driverId}|${o.vehicleId}`}>
                  {o.driverName} — {o.vehicle}, {o.seats} seats
                  {o.ratingCount > 0 ? `, ${o.ratingAverage?.toFixed(1)}★` : ", new"}
                  {o.fourWheelDrive ? ", 4x4" : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Alert tone="info">
            The traveller keeps the price they agreed. If the replacement charges more, the platform
            absorbs the difference.
          </Alert>

          <Field label="Reason" htmlFor="reassignReason" required>
            <Textarea id="reassignReason" name="reason" rows={2} required minLength={10}
                      placeholder="e.g. Original driver reported a mechanical fault" />
          </Field>

          <div className="flex gap-2">
            <SubmitButton>Reassign</SubmitButton>
            <button type="button" onClick={() => setOpen(false)}
                    className="rounded-lg border border-ink-200 px-3 py-2 text-sm">Cancel</button>
          </div>
        </form>
      )}
      <Result state={state} />
    </Card>
  );
}

export function CancelPanel({ bookingId }: { bookingId: string }) {
  const [state, action] = useActionState(cancelBookingAdminAction, INITIAL);
  const [open, setOpen] = useState(false);

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-ink-900">Cancel booking</h2>
      <p className="mt-1 text-sm text-ink-600">
        Releases the driver's calendar and notifies both parties. Any refund is a separate step.
      </p>
      {!open ? (
        <button onClick={() => setOpen(true)}
                className="mt-3 w-full rounded-lg border border-ink-300 px-4 py-2.5 text-sm hover:bg-ink-50">
          Cancel this booking
        </button>
      ) : (
        <form action={action} className="mt-3 space-y-3">
          <input type="hidden" name="bookingId" value={bookingId} />
          <Field label="Reason" htmlFor="cancelReason" required>
            <Textarea id="cancelReason" name="reason" rows={2} required minLength={10} />
          </Field>
          <div className="flex gap-2">
            <SubmitButton variant="danger">Confirm cancellation</SubmitButton>
            <button type="button" onClick={() => setOpen(false)}
                    className="rounded-lg border border-ink-200 px-3 py-2 text-sm">Keep it</button>
          </div>
        </form>
      )}
      <Result state={state} />
    </Card>
  );
}

export function RefundPanel({
  bookingId, maxMinor, currency, paymentMode,
}: { bookingId: string; maxMinor: string; currency: string; paymentMode: string }) {
  const [state, action] = useActionState(refundBookingAction, INITIAL);
  const max = (Number(maxMinor) / 100).toFixed(2);

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-ink-900">Refund</h2>
      <p className="mt-1 text-sm text-ink-600">
        Up to {max} {currency} can still be returned.
      </p>
      {paymentMode === "CASH" && (
        <div className="mt-3">
          <Alert tone="warning">
            This was paid in cash to the driver, so we never held the money. Recording a refund here
            reverses the commission and creates an obligation to pay the traveller directly.
          </Alert>
        </div>
      )}
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="bookingId" value={bookingId} />
        <Field label={`Amount (${currency})`} htmlFor="refundAmount" required>
          <Input id="refundAmount" name="amount" inputMode="decimal" defaultValue={max} required />
        </Field>
        <Field label="Reason" htmlFor="refundReason" required>
          <Textarea id="refundReason" name="reason" rows={2} required minLength={10}
                    placeholder="e.g. Driver arrived 90 minutes late, agreed partial refund" />
        </Field>
        <SubmitButton variant="danger">Issue refund</SubmitButton>
      </form>
      <Result state={state} />
    </Card>
  );
}

export function EditBookingPanel({ booking }: {
  booking: {
    id: string; pickupAddress: string; dropoffAddress: string;
    flightNumber: string | null; pickupSignName: string | null;
    customerPhone: string | null; notes: string | null;
  };
}) {
  const [state, action] = useActionState(editBookingAction, INITIAL);
  const [open, setOpen] = useState(false);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink-900">Correct the details</h2>
          <p className="mt-1 text-sm text-ink-600">
            Meeting points, flight number and phone. The price, driver and date are not editable here —
            those change what the traveller agreed and go through reassignment or a re-quote.
          </p>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)}
                  className="shrink-0 rounded-lg border border-ink-300 px-3 py-2 text-sm hover:bg-ink-50">
            Edit
          </button>
        )}
      </div>

      {open && (
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="bookingId" value={booking.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pickup address" htmlFor="pickupAddress" required>
              <Input id="pickupAddress" name="pickupAddress" defaultValue={booking.pickupAddress} required />
            </Field>
            <Field label="Drop-off address" htmlFor="dropoffAddress" required>
              <Input id="dropoffAddress" name="dropoffAddress" defaultValue={booking.dropoffAddress} required />
            </Field>
            <Field label="Flight number" htmlFor="flightNumber">
              <Input id="flightNumber" name="flightNumber" defaultValue={booking.flightNumber ?? ""} />
            </Field>
            <Field label="Name for the pickup sign" htmlFor="pickupSignName">
              <Input id="pickupSignName" name="pickupSignName" defaultValue={booking.pickupSignName ?? ""} />
            </Field>
            <Field label="Traveller phone" htmlFor="customerPhone">
              <Input id="customerPhone" name="customerPhone" defaultValue={booking.customerPhone ?? ""} />
            </Field>
          </div>
          <Field label="Notes for the driver" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={2} defaultValue={booking.notes ?? ""} />
          </Field>
          <Field label="Why are you changing this?" htmlFor="editReason" required>
            <Input id="editReason" name="reason" required minLength={5}
                   placeholder="e.g. Traveller called to change hotel" />
          </Field>
          <div className="flex gap-2">
            <SubmitButton>Save changes</SubmitButton>
            <button type="button" onClick={() => setOpen(false)}
                    className="rounded-lg border border-ink-200 px-3 py-2 text-sm">Cancel</button>
          </div>
        </form>
      )}
      <Result state={state} />
    </Card>
  );
}

export function SupportMessagePanel({
  bookingId, messages,
}: {
  bookingId: string;
  messages: { id: string; sender: string; body: string; created_at: Date; flagged: boolean }[];
}) {
  const [state, action] = useActionState(supportMessageAction, INITIAL);

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-ink-900">Conversation</h2>
      <p className="mt-1 text-sm text-ink-600">
        Everything the traveller and driver have said about this trip, and where support replies.
      </p>

      {messages.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">No messages yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {messages.map((m) => (
            <li key={m.id} className={`rounded-lg px-3 py-2 text-sm ${
              m.sender === "CUSTOMER" ? "bg-steel-50"
              : m.sender === "DRIVER" ? "bg-forest-50" : "bg-wine-50"}`}>
              <p className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                <span className="font-medium">{m.sender.toLowerCase()}</span>
                <span>{new Date(m.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</span>
                {m.flagged && <Badge tone="warning">contact details detected</Badge>}
              </p>
              <p className="mt-1 text-ink-800">{m.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="bookingId" value={bookingId} />
        <Field label="Reply as support" htmlFor="supportBody">
          <Textarea id="supportBody" name="body" rows={2}
                    placeholder="Both the traveller and the driver will see this." />
        </Field>
        <SubmitButton>Send</SubmitButton>
      </form>
      <Result state={state} />
    </Card>
  );
}

export function ResendButton({ notificationId }: { notificationId: string }) {
  const [state, action] = useActionState(resendNotificationAction, INITIAL);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="notificationId" value={notificationId} />
      <button className="text-xs text-wine-700 underline hover:text-wine-900">
        {state.message ? (state.ok ? "resent" : "failed") : "resend"}
      </button>
    </form>
  );
}
