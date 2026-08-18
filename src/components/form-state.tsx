"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert, Button } from "@/components/ui";
import type { ActionState } from "@/app/driver/actions";

const INITIAL: ActionState = { ok: false };

export function SubmitButton({ children = "Save", variant }: { children?: React.ReactNode; variant?: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} aria-busy={pending}>
      {pending ? "Working…" : children}
    </Button>
  );
}

/**
 * Wraps a server action and renders its result. Every form in the app shows
 * loading, success and error states — a silent form is treated as a defect.
 */
export function ActionForm({
  action, children, submitLabel, className,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL);
  return (
    <form action={formAction} className={className ?? "space-y-4"}>
      {children}
      {state.message && (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      )}
      {state.errors?.length ? (
        <Alert tone="danger" title="Please fix the following">
          <ul className="list-inside list-disc">
            {state.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </Alert>
      ) : null}
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
