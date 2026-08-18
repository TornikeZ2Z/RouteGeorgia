"use client";

import { useActionState, useState } from "react";
import { Alert, Card, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { saveRouteFamilyAction } from "@/app/admin/actions";

const INITIAL = { ok: false } as const;

interface RouteDefaults {
  slug?: string; originId?: string; destinationId?: string;
  distanceKm?: number; driveMinutes?: number; returnKm?: number;
  deadheadRecoveryPct?: number; riskFactorPct?: number; minFare?: string;
  requires4x4?: boolean; seasonalNote?: string;
}

/**
 * Route pricing. The deadhead recovery is the number that decides whether a
 * long remote route is worth a driver's day, so it gets an explanation rather
 * than a bare percentage field.
 */
export function RouteFamilyForm({
  locations, defaults, title = "Add or update a route",
}: {
  locations: { id: string; name_en: string }[];
  defaults?: RouteDefaults;
  title?: string;
}) {
  const [state, action] = useActionState(saveRouteFamilyAction, INITIAL);
  const [recovery, setRecovery] = useState(defaults?.deadheadRecoveryPct ?? 50);

  const advice =
    recovery <= 15 ? "City or airport transfer — the driver easily finds a return fare."
    : recovery <= 45 ? "Busy corridor — a return fare is likely but not certain."
    : recovery <= 70 ? "Regional route — the driver often returns empty."
    : "Remote route — assume the driver returns empty every time.";

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-ink-900">{title}</h2>
      <p className="mt-1 text-sm text-ink-600">
        Saving an existing origin and destination pair updates it. New quotes use the change
        immediately; bookings already made keep their own frozen price.
      </p>

      <form action={action} className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From" htmlFor="originId" required>
            <Select id="originId" name="originId" defaultValue={defaults?.originId ?? ""} required>
              <option value="">Choose…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name_en}</option>)}
            </Select>
          </Field>
          <Field label="To" htmlFor="destinationId" required>
            <Select id="destinationId" name="destinationId" defaultValue={defaults?.destinationId ?? ""} required>
              <option value="">Choose…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name_en}</option>)}
            </Select>
          </Field>
          <Field label="URL slug" htmlFor="routeSlug" hint="lowercase-with-hyphens, used in the web address" required>
            <Input id="routeSlug" name="slug" pattern="[a-z0-9-]+" defaultValue={defaults?.slug ?? ""} required />
          </Field>
          <Field label="Minimum fare (GEL)" htmlFor="minFare" hint="No quote on this route goes below it.">
            <Input id="minFare" name="minFare" inputMode="decimal" defaultValue={defaults?.minFare ?? "0"} />
          </Field>
          <Field label="Loaded distance (km)" htmlFor="distanceKm" required>
            <Input id="distanceKm" name="distanceKm" inputMode="decimal"
                   defaultValue={defaults?.distanceKm ?? ""} required />
          </Field>
          <Field label="Driving time (minutes)" htmlFor="driveMinutes" hint="Moving time only, no stops." required>
            <Input id="driveMinutes" name="driveMinutes" type="number" min={1}
                   defaultValue={defaults?.driveMinutes ?? ""} required />
          </Field>
          <Field label="Return distance (km)" htmlFor="returnKm"
                 hint="How far the driver travels back. Usually the same as the loaded distance." required>
            <Input id="returnKm" name="returnKm" inputMode="decimal"
                   defaultValue={defaults?.returnKm ?? ""} required />
          </Field>
          <Field label="Route conditions (%)" htmlFor="riskFactorPct"
                 hint="100 = ordinary road. 125 for mountain or winter routes." required>
            <Input id="riskFactorPct" name="riskFactorPct" type="number" min={100} max={200}
                   defaultValue={defaults?.riskFactorPct ?? 100} required />
          </Field>
        </div>

        <div className="rounded-lg border border-gold-200 bg-gold-50 p-4">
          <label htmlFor="deadheadRecoveryPct" className="block text-sm font-medium text-ink-900">
            Return leg charged to the traveller: {recovery}%
          </label>
          <input
            id="deadheadRecoveryPct" name="deadheadRecoveryPct" type="range" min={0} max={100} step={5}
            value={recovery} onChange={(e) => setRecovery(Number(e.target.value))}
            className="mt-3 w-full accent-[--color-wine-600]"
          />
          <p className="mt-2 text-sm text-ink-700">{advice}</p>
          <p className="mt-1 text-xs text-ink-600">
            This is the most consequential number on the page. Set it too low and drivers refuse remote
            routes; too high and short trips look expensive. It is why one honest per-km rate can serve
            both an airport run and a mountain crossing.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="requires4x4" defaultChecked={defaults?.requires4x4} className="size-4 rounded" />
          Only offer drivers with 4x4
        </label>

        <Field label="Seasonal note" htmlFor="seasonalNote" hint="Shown to travellers on the route page.">
          <Input id="seasonalNote" name="seasonalNote" maxLength={300}
                 defaultValue={defaults?.seasonalNote ?? ""}
                 placeholder="e.g. The pass can close without warning between November and April." />
        </Field>

        {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
        {state.errors?.length ? (
          <Alert tone="danger"><ul className="list-inside list-disc">
            {state.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></Alert>
        ) : null}

        <SubmitButton>Save route</SubmitButton>
      </form>
    </Card>
  );
}
