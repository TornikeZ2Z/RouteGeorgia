"use client";

import { useActionState } from "react";
import { Alert, Card, Field, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import {
  decideDriverAction, decideDocumentAction, decideVehicleAction,
  verifyLanguageAction, publishDriverAction,
} from "@/app/admin/actions";

const INITIAL = { ok: false } as const;

function Result({ state }: { state: { ok: boolean; message?: string; errors?: string[] } }) {
  if (!state.message && !state.errors?.length) return null;
  return (
    <div className="mt-2">
      <Alert tone={state.ok ? "success" : "danger"}>
        {state.message}
        {state.errors?.length ? (
          <ul className="mt-1 list-inside list-disc">{state.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        ) : null}
      </Alert>
    </div>
  );
}

/** Driver-level decision. A written reason is mandatory and audited. */
export function DecisionPanel({ driverId, currentStatus }: { driverId: string; currentStatus: string }) {
  const [state, action] = useActionState(decideDriverAction, INITIAL);
  return (
    <Card className="p-4">
      <h3 className="font-semibold text-ink-900">Decision</h3>
      <p className="mt-1 text-xs text-ink-500">Current: {currentStatus.replaceAll("_", " ").toLowerCase()}</p>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="driverId" value={driverId} />
        <Field label="Set status" htmlFor="decision">
          <Select id="decision" name="decision" defaultValue="IN_REVIEW">
            <option value="IN_REVIEW">In review</option>
            <option value="CHANGES_REQUESTED">Request changes</option>
            <option value="APPROVED">Approve</option>
            <option value="REJECTED">Reject</option>
            <option value="SUSPENDED">Suspend</option>
          </Select>
        </Field>
        <Field label="Reason" htmlFor="reason" hint="Stored permanently in the audit log." required>
          <Textarea id="reason" name="reason" rows={3} required minLength={10} />
        </Field>
        <SubmitButton>Record decision</SubmitButton>
      </form>
      <Result state={state} />
    </Card>
  );
}

/** Publication is separate from approval and separately permissioned. */
export function PublishPanel({ driverId, published }: { driverId: string; published: boolean }) {
  const [state, action] = useActionState(publishDriverAction, INITIAL);
  return (
    <Card className="p-4">
      <h3 className="font-semibold text-ink-900">Publication</h3>
      <p className="mt-1 text-xs text-ink-500">
        {published ? "Visible in search results." : "Not visible to travellers."}
      </p>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="driverId" value={driverId} />
        <input type="hidden" name="publish" value={published ? "false" : "true"} />
        <Field label="Reason" htmlFor="publishReason" required>
          <Textarea id="publishReason" name="reason" rows={2} required minLength={10} />
        </Field>
        <SubmitButton variant={published ? "secondary" : "primary"}>
          {published ? "Remove from search" : "Publish to search"}
        </SubmitButton>
      </form>
      <Result state={state} />
    </Card>
  );
}

export function DocumentDecision({ documentId, driverId }: { documentId: string; driverId: string }) {
  const [state, action] = useActionState(decideDocumentAction, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="driverId" value={driverId} />
      <Select name="state" defaultValue="APPROVED" aria-label="Document decision" className="text-xs">
        <option value="APPROVED">Approve</option>
        <option value="CHANGES_REQUESTED">Request changes</option>
        <option value="REJECTED">Reject</option>
      </Select>
      <input
        name="reason" placeholder="Reason" required minLength={5}
        className="rounded border border-ink-300 px-2 py-1 text-xs"
      />
      <SubmitButton variant="secondary">Save</SubmitButton>
      {!state.ok && state.message && <span className="text-xs text-[--color-danger]">{state.message}</span>}
    </form>
  );
}

export function VehicleDecision({ vehicleId, driverId }: { vehicleId: string; driverId: string }) {
  const [state, action] = useActionState(decideVehicleAction, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="driverId" value={driverId} />
      <Select name="status" defaultValue="APPROVED" aria-label="Vehicle decision" className="text-xs">
        <option value="APPROVED">Approve</option>
        <option value="SUSPENDED">Suspend</option>
        <option value="RETIRED">Retire</option>
      </Select>
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" name="publish" value="true" className="size-3.5" /> publish
      </label>
      <input
        name="reason" placeholder="Reason" required minLength={5}
        className="rounded border border-ink-300 px-2 py-1 text-xs"
      />
      <SubmitButton variant="secondary">Save</SubmitButton>
      {!state.ok && state.message && <span className="text-xs text-[--color-danger]">{state.message}</span>}
    </form>
  );
}

export function LanguageVerification({ driverId, language }: { driverId: string; language: string }) {
  const [state, action] = useActionState(verifyLanguageAction, INITIAL);
  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="driverId" value={driverId} />
      <input type="hidden" name="language" value={language} />
      <Select name="verifiedLevel" defaultValue="CONVERSATIONAL" aria-label={`Verified level for ${language}`} className="text-xs">
        <option value="BASIC">basic</option>
        <option value="CONVERSATIONAL">conversational</option>
        <option value="FLUENT">fluent</option>
        <option value="NATIVE">native</option>
      </Select>
      <SubmitButton variant="secondary">Set</SubmitButton>
      {!state.ok && state.message && <span className="text-xs text-[--color-danger]">{state.message}</span>}
    </form>
  );
}
