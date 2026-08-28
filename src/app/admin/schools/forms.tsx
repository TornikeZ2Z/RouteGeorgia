"use client";

import { useActionState, useState } from "react";
import { Alert, Card, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import {
  createSchoolAction, recordSchoolSignatureAction, createSchoolOrderAction,
  setSchoolOrderStatusAction,
} from "./actions";

const INITIAL = { ok: false } as const;

export function NewSchoolForm() {
  const [state, action] = useActionState(createSchoolAction, INITIAL);

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg text-ink-900">Add a school</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
        The registered name, identification code and director are printed in the agreement, so they
        must match the school&apos;s own registration rather than how it is known colloquially.
      </p>

      <form action={action} className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Registered name" htmlFor="name" required>
            <Input id="name" name="name" required minLength={2} maxLength={160} />
          </Field>
          <Field label="Identification code" htmlFor="idNumber" required>
            <Input id="idNumber" name="idNumber" required minLength={5} maxLength={20} inputMode="numeric" />
          </Field>
          <Field label="Director" htmlFor="director" required>
            <Input id="director" name="director" required minLength={3} maxLength={160} />
          </Field>
          <Field label="Registered address" htmlFor="address">
            <Input id="address" name="address" maxLength={240} autoComplete="street-address" />
          </Field>
          <Field label="Telephone" htmlFor="phone">
            <Input id="phone" name="phone" maxLength={40} inputMode="tel" />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" maxLength={200} />
          </Field>
        </div>

        <Field label="Notes" htmlFor="notes" hint="Internal only — never printed in the agreement.">
          <Input id="notes" name="notes" maxLength={2000} />
        </Field>

        {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}

        <SubmitButton>Add school</SubmitButton>
      </form>
    </Card>
  );
}

/**
 * Recording a signature that happened on paper.
 *
 * Deliberately not a one-click "mark as signed": the date, the person and the
 * manner are the whole substance of the record, and a written account of how
 * it was obtained is required because nothing else here is self-evidencing.
 */
export function RecordSignatureForm({ schoolId }: { schoolId: string }) {
  const [state, action] = useActionState(recordSchoolSignatureAction, INITIAL);

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg text-ink-900">Record the signed agreement</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
        Print the agreement above, have it signed, then record it here. The exact text printed is
        fingerprinted against this record, so a later dispute can be settled by reprinting it.
      </p>

      <form action={action} className="mt-5 space-y-4">
        <input type="hidden" name="schoolId" value={schoolId} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Who signed" htmlFor="signedName" required>
            <Input id="signedName" name="signedName" required minLength={3} maxLength={160} />
          </Field>
          <Field label="Their position" htmlFor="signedRole" hint="For example: Director.">
            <Input id="signedRole" name="signedRole" maxLength={120} />
          </Field>
          <Field label="Date signed" htmlFor="signedAt" required>
            <Input id="signedAt" name="signedAt" type="date" required />
          </Field>
          <Field label="Language of the copy signed" htmlFor="locale">
            <select
              id="locale" name="locale" defaultValue="ka"
              className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ka">Georgian (governing)</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>

        <Field label="How it was signed" htmlFor="method" required>
          <select
            id="method" name="method" defaultValue="IN_PERSON" required
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm"
          >
            <option value="IN_PERSON">In person, on paper</option>
            <option value="SCANNED">Scanned copy returned</option>
            <option value="ELECTRONIC">Electronically</option>
          </select>
        </Field>

        <Field
          label="How was this signature obtained?" htmlFor="reason" required
          hint="At least a sentence. This is the only account of an act this system did not witness."
        >
          <Input id="reason" name="reason" required minLength={10} maxLength={500} />
        </Field>

        {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}

        <SubmitButton>Record signature</SubmitButton>
      </form>
    </Card>
  );
}

/**
 * Annex 1, as a form.
 *
 * The package selector drives the Safety Coordinator tick box: PLUS and
 * PREMIUM include one under Article 7, so the box is checked and locked for
 * those, and free to add for STANDARD. Showing it rather than hiding it keeps
 * the printed sheet and the screen saying the same thing.
 */
export function NewOrderForm({ schoolId }: { schoolId: string }) {
  const [state, action] = useActionState(createSchoolOrderAction, INITIAL);
  const [pkg, setPkg] = useState("STANDARD");
  const included = pkg === "PLUS" || pkg === "PREMIUM";

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg text-ink-900">New order sheet</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
        Annex 1 to the agreement. Created as a draft; confirming it requires a signed agreement.
      </p>

      <form action={action} className="mt-5 space-y-4">
        <input type="hidden" name="schoolId" value={schoolId} />

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date of trip" htmlFor="tripDate" required>
            <Input id="tripDate" name="tripDate" type="date" required />
          </Field>
          <Field label="Pupils" htmlFor="students" required>
            <Input id="students" name="students" type="number" min={1} max={500} required />
          </Field>
          <Field label="Accompanying adults" htmlFor="chaperones">
            <Input id="chaperones" name="chaperones" type="number" min={0} max={100} defaultValue={0} />
          </Field>
          <Field label="Assembly point" htmlFor="pickupPlace" required>
            <Input id="pickupPlace" name="pickupPlace" required minLength={2} maxLength={240} />
          </Field>
          <Field label="Destination" htmlFor="destination" required>
            <Input id="destination" name="destination" required minLength={2} maxLength={240} />
          </Field>
          <Field label="Vehicle type" htmlFor="vehicleType">
            <Input id="vehicleType" name="vehicleType" maxLength={120} placeholder="e.g. 20-seat minibus" />
          </Field>
        </div>

        <Field label="Route" htmlFor="route" hint="The agreed route, as it should read on the sheet.">
          <Input id="route" name="route" maxLength={500} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Package" htmlFor="package" required>
            <select
              id="package" name="package" value={pkg} onChange={(e) => setPkg(e.target.value)}
              className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm"
            >
              <option value="STANDARD">STANDARD — vehicle, driver, route</option>
              <option value="PLUS">PLUS — plus Safety Coordinator</option>
              <option value="PREMIUM">PREMIUM — plus organisational support</option>
            </select>
          </Field>
          <Field label="Total price" htmlFor="totalPrice" hint="In GEL, e.g. 1250.00">
            <Input id="totalPrice" name="totalPrice" inputMode="decimal" defaultValue="0" />
          </Field>
          <Field label="Prepayment" htmlFor="prepaid" hint="What the cancellation ladder applies to.">
            <Input id="prepaid" name="prepaid" inputMode="decimal" defaultValue="0" />
          </Field>
        </div>

        <div className="space-y-2">
          <label className="flex items-start gap-3 text-sm text-ink-900">
            <input
              type="checkbox" name="safetyCoordinator" className="mt-0.5 size-5 rounded border-ink-300"
              checked={included ? true : undefined} disabled={included}
              defaultChecked={included ? undefined : false}
            />
            <span>
              Safety Coordinator
              {included && <span className="text-ink-500"> — included in {pkg} under Article 7</span>}
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-ink-900">
            <input type="checkbox" name="parentUpdates" className="mt-0.5 size-5 rounded border-ink-300" />
            <span>Parent updates — departure, arrival, return milestones (Article 8)</span>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="School's responsible person" htmlFor="schoolContactName">
            <Input id="schoolContactName" name="schoolContactName" maxLength={160} />
          </Field>
          <Field label="Their telephone" htmlFor="schoolContactPhone">
            <Input id="schoolContactPhone" name="schoolContactPhone" maxLength={40} inputMode="tel" />
          </Field>
        </div>

        <Field label="Additional conditions" htmlFor="extraTerms">
          <Input id="extraTerms" name="extraTerms" maxLength={1000} />
        </Field>

        {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}

        <SubmitButton>Create order sheet</SubmitButton>
      </form>
    </Card>
  );
}

/** Move one order along its lifecycle, from the row it belongs to. */
export function OrderStatusForm({
  orderId, status,
}: { orderId: string; status: string }) {
  const [state, action] = useActionState(setSchoolOrderStatusAction, INITIAL);
  const [next, setNext] = useState(status);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="status" value={next} onChange={(e) => setNext(e.target.value)}
          className="rounded-lg border border-ink-300 bg-white px-2 py-1 text-sm"
        >
          <option value="DRAFT">Draft</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        {next === "CANCELLED" && (
          <Input name="reason" placeholder="Why was it cancelled?" required minLength={5} maxLength={300} />
        )}
        <SubmitButton variant="secondary">Update</SubmitButton>
      </div>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
    </form>
  );
}
