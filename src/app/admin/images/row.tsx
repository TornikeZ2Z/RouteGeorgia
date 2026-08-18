"use client";

import { useActionState } from "react";
import { Alert, Card, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { PlaceImage } from "@/components/place-image";
import { uploadPlaceImageAction, removePlaceImageAction } from "@/app/admin/actions";

const INITIAL = { ok: false } as const;

export function ImageRow({
  target, id, slug, title, imageKey, alt,
}: {
  target: "location" | "route" | "tour";
  id: string; slug: string; title: string;
  imageKey: string | null; alt: string | null;
}) {
  const [uploadState, upload] = useActionState(uploadPlaceImageAction, INITIAL);
  const [removeState, remove] = useActionState(removePlaceImageAction, INITIAL);

  return (
    <Card className="overflow-hidden">
      <PlaceImage imageKey={imageKey} alt={alt ?? title} seedText={slug} className="h-32 w-full" />

      <div className="p-4">
        <p className="font-medium text-ink-900">{title}</p>
        <p className="text-xs text-ink-500">
          {imageKey ? "photograph" : "generated illustration"} · {slug}
        </p>

        <form action={upload} className="mt-3 space-y-2">
          <input type="hidden" name="target" value={target} />
          <input type="hidden" name="id" value={id} />
          <Field label="Description" htmlFor={`alt-${id}`} hint="Read aloud by screen readers.">
            <Input id={`alt-${id}`} name="alt" defaultValue={alt ?? title} minLength={3} required />
          </Field>
          <Field label="Photograph" htmlFor={`img-${id}`}>
            <Input id={`img-${id}`} name="image" type="file"
                   accept="image/jpeg,image/png,image/webp" required />
          </Field>
          <SubmitButton variant="secondary">Upload</SubmitButton>
        </form>

        {imageKey && (
          <form action={remove} className="mt-2">
            <input type="hidden" name="target" value={target} />
            <input type="hidden" name="id" value={id} />
            <button className="text-xs text-ink-500 underline hover:text-[--color-danger]">
              remove photograph
            </button>
          </form>
        )}

        {(uploadState.message || removeState.message) && (
          <div className="mt-2">
            <Alert tone={uploadState.ok || removeState.ok ? "success" : "danger"}>
              {uploadState.message ?? removeState.message}
            </Alert>
          </div>
        )}
      </div>
    </Card>
  );
}
