"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { openTicketAction, replyToTicketAction } from "./actions";

const INITIAL = { ok: false } as const;

export interface OpenLabels {
  title: string; body: string;
  subject: string; subjectHint: string;
  category: string; cBOOKING: string; cPAYMENT: string; cVEHICLE: string;
  cDOCUMENTS: string; cACCOUNT: string; cOTHER: string;
  priority: string; pHIGH: string; pNORMAL: string; pLOW: string;
  booking: string; bookingHint: string;
  details: string; detailsHint: string;
  files: string; filesHint: string;
  submit: string;
}

export function OpenTicket({ labels }: { labels: OpenLabels }) {
  const [state, action] = useActionState(openTicketAction, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <div>
        <h2 className="font-semibold text-ink-900">{labels.title}</h2>
        <p className="mt-1 text-sm text-ink-600">{labels.body}</p>
      </div>

      <Field label={labels.subject} htmlFor="subject" hint={labels.subjectHint} required>
        <Input id="subject" name="subject" required minLength={3} maxLength={140} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={labels.category} htmlFor="category" required>
          <Select id="category" name="category" defaultValue="BOOKING" required>
            <option value="BOOKING">{labels.cBOOKING}</option>
            <option value="PAYMENT">{labels.cPAYMENT}</option>
            <option value="VEHICLE">{labels.cVEHICLE}</option>
            <option value="DOCUMENTS">{labels.cDOCUMENTS}</option>
            <option value="ACCOUNT">{labels.cACCOUNT}</option>
            <option value="OTHER">{labels.cOTHER}</option>
          </Select>
        </Field>
        <Field label={labels.priority} htmlFor="priority">
          <Select id="priority" name="priority" defaultValue="NORMAL">
            <option value="HIGH">{labels.pHIGH}</option>
            <option value="NORMAL">{labels.pNORMAL}</option>
            <option value="LOW">{labels.pLOW}</option>
          </Select>
        </Field>
      </div>

      <Field label={labels.booking} htmlFor="bookingCode" hint={labels.bookingHint}>
        <Input id="bookingCode" name="bookingCode" maxLength={20} autoComplete="off" />
      </Field>

      <Field label={labels.details} htmlFor="body" hint={labels.detailsHint} required>
        <Textarea id="body" name="body" rows={5} required minLength={10} maxLength={4000} />
      </Field>

      <Field label={labels.files} htmlFor="attachments" hint={labels.filesHint}>
        <Input
          id="attachments" name="attachments" type="file" multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
        />
      </Field>

      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <SubmitButton>{labels.submit}</SubmitButton>
    </form>
  );
}

export function ReplyToTicket({
  ticketId, labels,
}: { ticketId: string; labels: { placeholder: string; send: string } }) {
  const [state, action] = useActionState(replyToTicketAction, INITIAL);

  return (
    <form action={action} className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input
        name="body" required maxLength={4000} placeholder={labels.placeholder}
        className="min-h-11 flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-900 focus:outline-none"
      />
      <button className="min-h-11 rounded-lg bg-pine-800 px-4 text-sm font-semibold text-white hover:bg-pine-700">
        {labels.send}
      </button>
      {state.message && !state.ok && (
        <p role="alert" className="text-xs text-[--color-danger]">{state.message}</p>
      )}
    </form>
  );
}
