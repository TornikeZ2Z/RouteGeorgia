"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { setRequestStatusAction } from "./actions";

const INITIAL = { ok: false } as const;

const SELECT =
  "rounded-lg border border-ink-300 bg-white px-2.5 py-1.5 text-sm " +
  "focus:border-pine-800 focus:outline-none focus:ring-1 focus:ring-pine-800";

export function StatusForm({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState(setRequestStatusAction, INITIAL);
  const [next, setNext] = useState(status);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-2">
        <select name="status" value={next} onChange={(e) => setNext(e.target.value)} className={SELECT}>
          <option value="NEW">New</option>
          <option value="TRIAGED">Triaged</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="DONE">Done</option>
          <option value="DECLINED">Declined</option>
        </select>
        <SubmitButton variant="secondary">Update</SubmitButton>
      </div>
      {/*
        Shown for Done as well as Declined. "What actually changed" is worth
        recording even when the answer was yes — it is what the person who
        filed it wants to read.
      */}
      {(next === "DECLINED" || next === "DONE") && (
        <textarea
          name="resolution" rows={3}
          required={next === "DECLINED"} minLength={next === "DECLINED" ? 5 : 0} maxLength={2000}
          placeholder={next === "DECLINED"
            ? "Why was this declined? The person who filed it will be told."
            : "What changed? Optional, but useful to whoever asked."}
          className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm"
        />
      )}
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
    </form>
  );
}

/**
 * The brief, with a button that puts it on the clipboard.
 *
 * This is the point of the queue. A list of reported text still leaves
 * somebody to restate the problem before any work starts; this does that
 * restating once, at the point where the area and the submitter are known.
 */
export function Brief({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-ink-900">Brief for Claude</h2>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(text).then(
              () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
              () => setCopied(false),
            );
          }}
          className="rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-sm hover:bg-ink-50"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg border border-ink-200 bg-ink-50 p-4 text-xs leading-relaxed text-ink-800">
{text}
      </pre>
    </div>
  );
}
