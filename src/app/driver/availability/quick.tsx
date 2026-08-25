"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui";
import { saveAvailabilityPatternAction, setRangeAction, toggleTodayAction } from "../actions";

const INITIAL = { ok: false } as const;

export interface QuickLabels {
  todayT: string; todayB: string; blockToday: string; freeToday: string;
  rangeT: string; rangeB: string; from: string; to: string; blockRange: string; freeRange: string;
  patternT: string; patternB: string; savePattern: string;
  days: string[];
}

/** Not today — the single most common thing a driver needs to say. */
export function TodayControls({ labels }: { labels: QuickLabels }) {
  const [state, action] = useActionState(toggleTodayAction, INITIAL);
  return (
    <div>
      <h2 className="font-semibold text-ink-900">{labels.todayT}</h2>
      <p className="mt-1 text-sm text-ink-600">{labels.todayB}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={action}>
          <input type="hidden" name="mode" value="block" />
          <button className="min-h-11 rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-900 hover:bg-ink-50">
            {labels.blockToday}
          </button>
        </form>
        <form action={action}>
          <input type="hidden" name="mode" value="free" />
          <button className="min-h-11 rounded-lg bg-pine-800 px-4 text-sm font-semibold text-white hover:bg-pine-700">
            {labels.freeToday}
          </button>
        </form>
      </div>
      {state.message && (
        <div className="mt-3"><Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert></div>
      )}
    </div>
  );
}

/** A holiday is a span, not thirty separate blocks. */
export function RangeControls({ labels }: { labels: QuickLabels }) {
  const [state, action] = useActionState(setRangeAction, INITIAL);
  return (
    <div>
      <h2 className="font-semibold text-ink-900">{labels.rangeT}</h2>
      <p className="mt-1 text-sm text-ink-600">{labels.rangeB}</p>
      <form action={action} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <div>
          <label htmlFor="rangeFrom" className="mb-1 block text-xs font-medium text-ink-500">{labels.from}</label>
          <input id="rangeFrom" name="rangeFrom" type="date" required
                 className="min-h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-ink-900 focus:outline-none" />
        </div>
        <div>
          <label htmlFor="rangeTo" className="mb-1 block text-xs font-medium text-ink-500">{labels.to}</label>
          <input id="rangeTo" name="rangeTo" type="date" required
                 className="min-h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-ink-900 focus:outline-none" />
        </div>
        <button name="mode" value="block"
                className="min-h-11 rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-900 hover:bg-ink-50">
          {labels.blockRange}
        </button>
        <button name="mode" value="free"
                className="min-h-11 rounded-lg bg-pine-800 px-4 text-sm font-semibold text-white hover:bg-pine-700">
          {labels.freeRange}
        </button>
      </form>
      {state.message && (
        <div className="mt-3"><Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert></div>
      )}
    </div>
  );
}

/** Say it once: the days this driver never works. */
export function PatternControls({
  selected, labels,
}: { selected: number[]; labels: QuickLabels }) {
  const [state, action] = useActionState(saveAvailabilityPatternAction, INITIAL);
  return (
    <div>
      <h2 className="font-semibold text-ink-900">{labels.patternT}</h2>
      <p className="mt-1 text-sm text-ink-600">{labels.patternB}</p>
      <form action={action} className="mt-3">
        <div className="flex flex-wrap gap-2">
          {labels.days.map((day, index) => (
            <label
              key={day}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm has-[:checked]:border-pine-800 has-[:checked]:bg-pine-50"
            >
              <input
                type="checkbox" name="weekday" value={index}
                defaultChecked={selected.includes(index)}
                className="size-4 rounded"
              />
              {day}
            </label>
          ))}
        </div>
        <button className="mt-3 min-h-11 rounded-lg bg-pine-800 px-4 text-sm font-semibold text-white hover:bg-pine-700">
          {labels.savePattern}
        </button>
      </form>
      {state.message && (
        <div className="mt-3"><Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert></div>
      )}
    </div>
  );
}
