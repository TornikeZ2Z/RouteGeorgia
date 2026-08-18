"use client";

import { useActionState } from "react";
import { moderateVehicleMediaAction } from "@/app/admin/actions";
import { SubmitButton } from "@/components/form-state";

export function MediaDecision({ mediaId, driverId }: { mediaId: string; driverId: string }) {
  const [state, action] = useActionState(moderateVehicleMediaAction, { ok: false });
  return (
    <div className="flex gap-2">
      <form action={action}>
        <input type="hidden" name="mediaId" value={mediaId} />
        <input type="hidden" name="driverId" value={driverId} />
        <input type="hidden" name="state" value="APPROVED" />
        <SubmitButton>Approve</SubmitButton>
      </form>
      <form action={action}>
        <input type="hidden" name="mediaId" value={mediaId} />
        <input type="hidden" name="driverId" value={driverId} />
        <input type="hidden" name="state" value="REJECTED" />
        <SubmitButton variant="secondary">Reject</SubmitButton>
      </form>
      {!state.ok && state.message && (
        <span className="text-xs text-[--color-danger]">{state.message}</span>
      )}
    </div>
  );
}
