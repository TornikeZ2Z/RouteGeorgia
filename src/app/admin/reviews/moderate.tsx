"use client";

import { useActionState } from "react";
import { Alert, Field, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { moderateReviewAction } from "@/app/admin/actions";

export function ModerateReview({ reviewId, originalBody }: { reviewId: string; originalBody: string }) {
  const [state, action] = useActionState(moderateReviewAction, { ok: false });

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="reviewId" value={reviewId} />
      <Field
        label="Text to publish" htmlFor={`body-${reviewId}`}
        hint="Edit only to remove personal data. The original submission is kept unchanged for the record."
      >
        <Textarea id={`body-${reviewId}`} name="publishedBody" rows={3} defaultValue={originalBody} />
      </Field>
      <Field label="Reason" htmlFor={`reason-${reviewId}`} required>
        <input
          id={`reason-${reviewId}`} name="reason" required minLength={4}
          className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm"
          placeholder="e.g. published as written / phone number removed"
        />
      </Field>
      <div className="flex gap-2">
        <button name="decision" value="PUBLISHED"
                className="rounded-lg bg-wine-600 px-4 py-2 text-sm font-medium text-white hover:bg-wine-700">
          Publish
        </button>
        <button name="decision" value="REJECTED"
                className="rounded-lg border border-ink-300 px-4 py-2 text-sm hover:bg-ink-50">
          Reject
        </button>
      </div>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
    </form>
  );
}
