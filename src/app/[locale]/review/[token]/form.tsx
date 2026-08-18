"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { submitReviewAction } from "./actions";

const CATEGORIES = [
  ["overall", "Overall experience"],
  ["safety", "Felt safe"],
  ["punctuality", "On time"],
  ["cleanliness", "Clean vehicle"],
  ["communication", "Communication"],
] as const;

export function ReviewForm({ token, driverName }: { token: string; driverName: string }) {
  const [state, action] = useActionState(submitReviewAction, { ok: false });

  if (state.ok) {
    return (
      <Alert tone="success" title="Thank you">
        Your review has been submitted and will appear on {driverName}&apos;s profile once checked.
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      {CATEGORIES.map(([name, label]) => (
        <fieldset key={name}>
          <legend className="mb-1.5 text-sm font-medium text-ink-800">
            {label}{name === "overall" && <span className="text-[--color-danger]"> *</span>}
          </legend>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value} className="cursor-pointer">
                <input
                  type="radio" name={name} value={value} className="peer sr-only"
                  required={name === "overall"}
                />
                <span className="inline-flex size-10 items-center justify-center rounded-lg border border-ink-300 text-sm peer-checked:border-wine-600 peer-checked:bg-wine-600 peer-checked:text-white">
                  {value}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <Field label="Your name as shown publicly" htmlFor="authorName" hint="A first name is fine.">
        <Input id="authorName" name="authorName" maxLength={60} />
      </Field>

      <Field label="Tell other travellers about the trip" htmlFor="body" hint="Please do not include phone numbers or addresses.">
        <Textarea id="body" name="body" rows={5} maxLength={2000} />
      </Field>

      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <SubmitButton>Submit review</SubmitButton>
    </form>
  );
}
