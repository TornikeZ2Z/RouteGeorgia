"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleWorkDayAction } from "../actions";

/**
 * The working-days grid. A client component so the toggle server action is
 * referenced from client code — which is also what lets taps feel instant
 * (the whole grid stays interactive while a toggle is in flight).
 *
 * Four states, not three. "Pending" is a booking that has arrived and is
 * waiting for the driver to acknowledge it: it already holds the day, but it
 * is not yet a commitment either side can rely on, and the driver needs to
 * see it as different from work they have accepted.
 */
export interface DayCell {
  key: string;
  label: number;
  month: string;
  state: "work" | "off" | "booked" | "pending";
}

export interface CalendarLabels {
  work: string; off: string; booked: string; pending: string;
  tipWork: string; tipOff: string; tipBooked: string; tipPending: string;
}

const STYLE = {
  work: "border-ink-200 bg-white text-ink-900 hover:border-gold-500",
  off: "border-ink-200 bg-ink-100 text-ink-400 line-through hover:border-gold-500",
  booked: "cursor-not-allowed border-brand-600/30 bg-brand-600/10 font-semibold text-brand-600",
  pending: "cursor-not-allowed border-gold-500/50 bg-gold-100 font-semibold text-gold-700",
} as const;

export function WorkDayCalendar({ days, labels }: { days: DayCell[]; labels: CalendarLabels }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const tip = {
    work: labels.tipWork, off: labels.tipOff,
    booked: labels.tipBooked, pending: labels.tipPending,
  } as const;

  return (
    <div className="mt-4" data-pending={pending || undefined}>
      <div className={`grid grid-cols-7 gap-1.5 sm:gap-2 ${pending ? "opacity-60" : ""}`}>
        {days.map((d, i) => (
          <button
            key={d.key}
            type="button"
            disabled={d.state === "booked" || d.state === "pending" || pending}
            title={tip[d.state]}
            onClick={() =>
              start(async () => {
                const fd = new FormData();
                fd.set("day", d.key);
                await toggleWorkDayAction(fd);
                router.refresh();
              })
            }
            className={`flex aspect-square w-full flex-col items-center justify-center rounded-lg border text-sm transition-colors ${STYLE[d.state]}`}
          >
            <span className="text-[10px] uppercase opacity-60">{d.label === 1 || i === 0 ? d.month : " "}</span>
            {d.label}
          </button>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-4 text-xs text-ink-500">
        <span><span className="mr-1.5 inline-block size-2.5 rounded-sm border border-ink-300 bg-white align-middle" />{labels.work}</span>
        <span><span className="mr-1.5 inline-block size-2.5 rounded-sm bg-ink-200 align-middle" />{labels.off}</span>
        <span><span className="mr-1.5 inline-block size-2.5 rounded-sm bg-brand-600/20 align-middle" />{labels.booked}</span>
        <span><span className="mr-1.5 inline-block size-2.5 rounded-sm bg-gold-300 align-middle" />{labels.pending}</span>
      </p>
    </div>
  );
}
