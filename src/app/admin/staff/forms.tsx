"use client";

import { useActionState, useState } from "react";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { saveStaffAction, revokeStaffAction } from "@/app/admin/actions";

const INITIAL = { ok: false } as const;

export function StaffForm({ roles }: { roles: { value: string; description: string }[] }) {
  const [state, action] = useActionState(saveStaffAction, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <Field label="Email address" htmlFor="staffEmail" required>
        <Input id="staffEmail" name="email" type="email" required />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-800">Roles</legend>
        <div className="space-y-2">
          {roles.map((r) => (
            <label key={r.value} className="flex items-start gap-2.5 rounded-lg border border-ink-200 p-3 text-sm">
              <input type="checkbox" name="roles" value={r.value} className="mt-0.5 size-4 rounded" />
              <span>
                <span className="font-medium text-ink-900">{r.value.replaceAll("_", " ").toLowerCase()}</span>
                <span className="block text-xs text-ink-600">{r.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Why?" htmlFor="staffReason" hint="Recorded in the audit log." required>
        <Input id="staffReason" name="reason" required minLength={5}
               placeholder="e.g. New operations hire, starts Monday" />
      </Field>

      {state.message && (
        <Alert tone={state.ok ? "success" : "danger"}>
          <span className="break-all">{state.message}</span>
        </Alert>
      )}
      {state.errors?.length ? (
        <Alert tone="danger"><ul className="list-inside list-disc">
          {state.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></Alert>
      ) : null}

      <SubmitButton>Grant access</SubmitButton>
    </form>
  );
}

export function RevokeButton({ userId, email }: { userId: string; email: string }) {
  const [state, action] = useActionState(revokeStaffAction, INITIAL);
  const [confirming, setConfirming] = useState(false);

  if (state.ok) return <span className="text-xs text-forest-700">revoked</span>;

  return confirming ? (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton variant="danger">Revoke {email}</SubmitButton>
      <button type="button" onClick={() => setConfirming(false)}
              className="text-xs text-ink-500 underline">cancel</button>
    </form>
  ) : (
    <button onClick={() => setConfirming(true)} className="text-xs text-wine-700 underline">
      revoke access
    </button>
  );
}
