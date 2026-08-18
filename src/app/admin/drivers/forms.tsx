"use client";

import { useActionState, useState } from "react";
import { Alert, Card, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { createDriverAction, updateWalletAction, recordSettlementAction } from "@/app/admin/actions";

const INITIAL = { ok: false } as const;

function Result({ state }: { state: { ok: boolean; message?: string; errors?: string[] } }) {
  if (!state.message && !state.errors?.length) return null;
  return (
    <div className="mt-3">
      <Alert tone={state.ok ? "success" : "danger"}>
        <span className="break-words">{state.message}</span>
        {state.errors?.length ? (
          <ul className="mt-1 list-inside list-disc">{state.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        ) : null}
      </Alert>
    </div>
  );
}

/** Onboarding a driver who walked into the office rather than found the website. */
export function CreateDriverForm({ locations }: { locations: { id: string; name_en: string }[] }) {
  const [state, action] = useActionState(createDriverAction, INITIAL);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
              className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
        Add a driver
      </button>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-ink-900">Add a driver</h2>
      <p className="mt-1 text-sm text-ink-600">
        Creates their account and starts an application. They still upload their own documents and go
        through the same verification — this does not skip any check.
      </p>

      <form action={action} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Display name" htmlFor="publicName" hint="Shown publicly, e.g. “Giorgi K.”" required>
            <Input id="publicName" name="publicName" required />
          </Field>
          <Field label="Email" htmlFor="driverEmail" hint="They sign in with this." required>
            <Input id="driverEmail" name="email" type="email" required />
          </Field>
          <Field label="Legal first name" htmlFor="legalFirstName" required>
            <Input id="legalFirstName" name="legalFirstName" required />
          </Field>
          <Field label="Legal last name" htmlFor="legalLastName" required>
            <Input id="legalLastName" name="legalLastName" required />
          </Field>
          <Field label="Phone" htmlFor="driverPhone" required>
            <Input id="driverPhone" name="phone" placeholder="+995 …" required />
          </Field>
          <Field label="Base location" htmlFor="baseLocationId">
            <Select id="baseLocationId" name="baseLocationId" defaultValue="">
              <option value="">Not set</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name_en}</option>)}
            </Select>
          </Field>
          <Field label="Their language" htmlFor="driverLocale">
            <Select id="driverLocale" name="locale" defaultValue="ka">
              <option value="ka">Georgian</option>
              <option value="en">English</option>
              <option value="ru">Russian</option>
            </Select>
          </Field>
        </div>

        <div className="flex gap-2">
          <SubmitButton>Create driver</SubmitButton>
          <button type="button" onClick={() => setOpen(false)}
                  className="rounded-lg border border-ink-200 px-3 py-2 text-sm">Cancel</button>
        </div>
      </form>
      <Result state={state} />
    </Card>
  );
}

export function WalletPanel({
  driverId, owedMinor, creditLimitMinor, blocked, blockedReason,
}: {
  driverId: string; owedMinor: string; creditLimitMinor: string;
  blocked: boolean; blockedReason: string | null;
}) {
  const [settleState, settle] = useActionState(recordSettlementAction, INITIAL);
  const [limitState, updateLimit] = useActionState(updateWalletAction, INITIAL);
  const owed = (Number(owedMinor) / 100).toFixed(2);
  const limit = (Number(creditLimitMinor) / 100).toFixed(2);

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-ink-900">Commission balance</h2>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink-900">{owed} GEL</p>
      <p className="text-sm text-ink-600">owed to us · limit {limit} GEL</p>

      {blocked && (
        <div className="mt-3">
          <Alert tone="danger" title="Cash bookings blocked">
            {blockedReason}. Card work is unaffected.
          </Alert>
        </div>
      )}

      <form action={settle} className="mt-4 space-y-3 border-t border-ink-100 pt-4">
        <input type="hidden" name="driverId" value={driverId} />
        <p className="text-sm font-medium text-ink-800">Record a payment from the driver</p>
        <Field label="Amount (GEL)" htmlFor="settleAmount" required>
          <Input id="settleAmount" name="amount" inputMode="decimal" defaultValue={owed} required />
        </Field>
        <Field label="How was it paid?" htmlFor="settleRef" required>
          <Input id="settleRef" name="reference" required minLength={3}
                 placeholder="e.g. bank transfer ref 88213, or cash in office" />
        </Field>
        <SubmitButton>Record settlement</SubmitButton>
      </form>
      <Result state={settleState} />

      <form action={updateLimit} className="mt-4 space-y-3 border-t border-ink-100 pt-4">
        <input type="hidden" name="driverId" value={driverId} />
        <p className="text-sm font-medium text-ink-800">Credit limit</p>
        <Field label="New limit (GEL)" htmlFor="creditLimit"
               hint="How much unsettled commission this driver may carry before cash work pauses." required>
          <Input id="creditLimit" name="creditLimit" inputMode="decimal" defaultValue={limit} required />
        </Field>
        <Field label="Reason" htmlFor="limitReason" required>
          <Input id="limitReason" name="reason" required minLength={5} />
        </Field>
        <SubmitButton variant="secondary">Update limit</SubmitButton>
      </form>
      <Result state={limitState} />
    </Card>
  );
}
