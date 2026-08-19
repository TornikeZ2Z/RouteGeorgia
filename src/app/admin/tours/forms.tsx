"use client";

import { useActionState } from "react";
import { Alert, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { saveTourTranslationAction, toggleTourAction } from "@/app/admin/actions";

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

export interface TourTranslationValue {
  locale: "en" | "ka" | "ru";
  title: string;
  summary: string;
  body: string;
}

const LOCALE_NAME = { en: "English", ka: "ქართული", ru: "Русский" } as const;

export function TourTranslationForm({
  tourId, value,
}: { tourId: string; value: TourTranslationValue }) {
  const [state, action] = useActionState(saveTourTranslationAction, INITIAL);
  const l = value.locale;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="tourId" value={tourId} />
      <input type="hidden" name="locale" value={l} />
      <Field label={`Title (${LOCALE_NAME[l]})`} htmlFor={`t-${tourId}-${l}-title`} required>
        <Input id={`t-${tourId}-${l}-title`} name="title" defaultValue={value.title} required minLength={3} maxLength={120} />
      </Field>
      <Field label="Card summary" htmlFor={`t-${tourId}-${l}-summary`}
             hint="One or two sentences shown on the tour card." required>
        <Textarea id={`t-${tourId}-${l}-summary`} name="summary" rows={2}
                  defaultValue={value.summary} required minLength={10} maxLength={400} />
      </Field>
      <Field label="Full description" htmlFor={`t-${tourId}-${l}-body`}
             hint="Blank lines separate paragraphs." required>
        <Textarea id={`t-${tourId}-${l}-body`} name="body" rows={7}
                  defaultValue={value.body} required minLength={10} maxLength={8000} />
      </Field>
      <SubmitButton>Save {l.toUpperCase()}</SubmitButton>
      <Result state={state} />
    </form>
  );
}

export function TourVisibilityForm({ tourId, active }: { tourId: string; active: boolean }) {
  const [state, action] = useActionState(toggleTourAction, INITIAL);
  return (
    <Card className="p-4">
      <h3 className="font-semibold text-ink-900">Visibility</h3>
      <p className="mt-1 text-xs text-ink-500">
        {active ? "Live: shown on the homepage, catalogue and search." : "Hidden from the public site."}
      </p>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="tourId" value={tourId} />
        <input type="hidden" name="active" value={active ? "off" : "on"} />
        <Field label="Reason" htmlFor={`vis-${tourId}-reason`} hint="Stored in the audit log." required>
          <Input id={`vis-${tourId}-reason`} name="reason" required minLength={5} />
        </Field>
        <SubmitButton>{active ? "Hide this tour" : "Publish this tour"}</SubmitButton>
      </form>
      <Result state={state} />
    </Card>
  );
}

export function LocaleTabs({ tourId, translations }: { tourId: string; translations: TourTranslationValue[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {translations.map((tr) => (
        <div key={tr.locale} className="rounded-xl border border-ink-200 p-4">
          <TourTranslationForm tourId={tourId} value={tr} />
        </div>
      ))}
    </div>
  );
}
