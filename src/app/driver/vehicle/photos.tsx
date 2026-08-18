"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { uploadVehiclePhotoAction, deleteVehiclePhotoAction } from "../actions";

const INITIAL = { ok: false } as const;

export function PhotoUploader({ vehicles }: { vehicles: { id: string; label: string }[] }) {
  const [state, action] = useActionState(uploadVehiclePhotoAction, INITIAL);

  return (
    <form action={action} className="space-y-4">
      <h3 className="font-medium text-ink-900">Upload photos</h3>

      <Field label="Vehicle" htmlFor="photo-vehicle" required>
        <Select id="photo-vehicle" name="vehicleId" required>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </Select>
      </Field>

      <Field label="What do they show?" htmlFor="viewType">
        <Select id="viewType" name="viewType" defaultValue="exterior">
          <option value="exterior">Outside of the car</option>
          <option value="interior">Inside — front</option>
          <option value="rear_seats">Inside — passenger seats</option>
          <option value="luggage">Luggage space</option>
        </Select>
      </Field>

      <Field
        label="Description" htmlFor="altText"
        hint="Read aloud by screen readers. For example: silver minivan, side view."
      >
        <Input id="altText" name="altText" maxLength={160} />
      </Field>

      <Field
        label="Photos" htmlFor="photos"
        hint="JPEG, PNG or WebP, up to 8 at a time. Photograph your own car — do not use pictures from the internet."
        required
      >
        <Input
          id="photos" name="photos" type="file" multiple
          accept="image/jpeg,image/png,image/webp" required
        />
      </Field>

      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <SubmitButton>Upload</SubmitButton>
    </form>
  );
}

export function RemovePhoto({ mediaId }: { mediaId: string }) {
  const [state, action] = useActionState(deleteVehiclePhotoAction, INITIAL);
  return (
    <form action={action}>
      <input type="hidden" name="mediaId" value={mediaId} />
      <button className="text-xs text-ink-500 underline hover:text-[--color-danger]">
        Remove
      </button>
      {!state.ok && state.message && <span className="sr-only">{state.message}</span>}
    </form>
  );
}
