"use client";

import { useActionState } from "react";
import { Alert, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { saveContentAction } from "@/app/admin/actions";

export function ContentForm() {
  const [state, action] = useActionState(saveContentAction, { ok: false });

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-ink-900">Add or update a page</h2>
      <p className="mt-1 text-sm text-ink-600">
        Saving an existing slug and language pair replaces it.
      </p>
      <form action={action} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Slug" htmlFor="contentSlug" hint="terms, privacy or cancellation — published rows replace the built-in legal pages" required>
            <Input id="contentSlug" name="slug" pattern="[a-z0-9-]+" required />
          </Field>
          <Field label="Language" htmlFor="contentLocale" required>
            <Select id="contentLocale" name="locale" defaultValue="en">
              <option value="en">English</option>
              <option value="ka">Georgian</option>
              <option value="ru">Russian</option>
            </Select>
          </Field>
          <Field label="Kind" htmlFor="contentKind">
            <Select id="contentKind" name="kind" defaultValue="PAGE">
              <option value="PAGE">Page</option>
              <option value="FAQ">FAQ</option>
              <option value="ROUTE">Route copy</option>
            </Select>
          </Field>
        </div>
        <Field label="Title" htmlFor="contentTitle" required>
          <Input id="contentTitle" name="title" required />
        </Field>
        <Field label="Body" htmlFor="contentBody">
          <Textarea id="contentBody" name="body" rows={6} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="published" className="size-4 rounded" defaultChecked />
          Publish immediately
        </label>
        {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
        {state.errors?.length ? (
          <Alert tone="danger"><ul className="list-inside list-disc">
            {state.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></Alert>
        ) : null}
        <SubmitButton>Save page</SubmitButton>
      </form>
    </Card>
  );
}
