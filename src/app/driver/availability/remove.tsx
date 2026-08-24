"use client";

import { useActionState } from "react";
import { removeAvailabilityBlockAction } from "../actions";
import { SubmitButton } from "@/components/form-state";

export function RemoveBlock({ blockId, label }: { blockId: string; label: string }) {
  const [state, action] = useActionState(removeAvailabilityBlockAction, { ok: false });
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="blockId" value={blockId} />
      <SubmitButton variant="secondary">{label}</SubmitButton>
      {state.message && !state.ok && (
        <span className="text-xs text-[--color-danger]" role="alert">{state.message}</span>
      )}
    </form>
  );
}
