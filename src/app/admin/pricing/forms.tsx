"use client";

import { useActionState } from "react";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/form-state";
import { savePriceBandAction, savePlatformSettingsAction } from "@/app/admin/actions";

const INITIAL = { ok: false } as const;

export function BandForm({ band }: {
  band: {
    class: string; minRate: string; maxRate: string; floor: string;
    ceiling: string; overnight: string; maxSeasonPct: number;
  };
}) {
  const [state, action] = useActionState(savePriceBandAction, INITIAL);

  return (
    <form action={action} className="space-y-3 rounded-xl border border-ink-200 bg-white p-4">
      <input type="hidden" name="class" value={band.class} />
      <h3 className="font-semibold text-ink-900">{band.class.replaceAll("_", " ").toLowerCase()}</h3>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Min rate/km" htmlFor={`min-${band.class}`}>
          <Input id={`min-${band.class}`} name="minRatePerKm" inputMode="decimal" defaultValue={band.minRate} />
        </Field>
        <Field label="Max rate/km" htmlFor={`max-${band.class}`}>
          <Input id={`max-${band.class}`} name="maxRatePerKm" inputMode="decimal" defaultValue={band.maxRate} />
        </Field>
        <Field label="Max season %" htmlFor={`season-${band.class}`}>
          <Input id={`season-${band.class}`} name="maxSeasonPct" type="number" min={100} max={200}
                 defaultValue={band.maxSeasonPct} />
        </Field>
        <Field label="Fare floor" htmlFor={`floor-${band.class}`}>
          <Input id={`floor-${band.class}`} name="minFareFloor" inputMode="decimal" defaultValue={band.floor} />
        </Field>
        <Field label="Fare ceiling" htmlFor={`ceiling-${band.class}`}>
          <Input id={`ceiling-${band.class}`} name="maxFareCeiling" inputMode="decimal" defaultValue={band.ceiling} />
        </Field>
        <Field label="Max overnight" htmlFor={`overnight-${band.class}`}>
          <Input id={`overnight-${band.class}`} name="maxOvernight" inputMode="decimal" defaultValue={band.overnight} />
        </Field>
      </div>

      <Field label="Why are you changing this?" htmlFor={`reason-${band.class}`} required>
        <Input id={`reason-${band.class}`} name="reason" required minLength={10}
               placeholder="e.g. Fuel prices rose 12% in March" />
      </Field>

      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      {state.errors?.length ? (
        <Alert tone="danger"><ul className="list-inside list-disc">
          {state.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></Alert>
      ) : null}

      <SubmitButton variant="secondary">Save band</SubmitButton>
    </form>
  );
}

/**
 * The two numbers that decide what RouteGeorgia earns and what a driver's day
 * is worth. Both were environment variables until now, which meant a redeploy
 * to change a commercial term.
 */
export function PlatformSettingsForm({
  commissionPct, minimumDayFare, labels,
}: {
  commissionPct: string;
  minimumDayFare: string;
  labels: {
    title: string; body: string; commission: string; commissionHint: string;
    dayFare: string; dayFareHint: string; save: string; warning: string;
  };
}) {
  const [state, action] = useActionState(savePlatformSettingsAction, INITIAL);

  return (
    <form action={action} className="space-y-4 rounded-xl border border-ink-200 bg-white p-4 sm:p-6">
      <div>
        <h3 className="font-semibold text-ink-900">{labels.title}</h3>
        <p className="mt-1 text-sm text-ink-600">{labels.body}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={labels.commission} htmlFor="commissionPct" hint={labels.commissionHint}>
          <Input id="commissionPct" name="commissionPct" inputMode="decimal" defaultValue={commissionPct} />
        </Field>
        <Field label={labels.dayFare} htmlFor="minimumDayFare" hint={labels.dayFareHint}>
          <Input id="minimumDayFare" name="minimumDayFare" inputMode="decimal" defaultValue={minimumDayFare} />
        </Field>
      </div>

      <Alert tone="warning">{labels.warning}</Alert>

      {state.message && (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      )}
      <SubmitButton>{labels.save}</SubmitButton>
    </form>
  );
}
