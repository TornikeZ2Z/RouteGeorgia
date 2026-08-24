"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleWorkDayAction } from "../actions";

/**
 * The working-days grid. A client component so the toggle server action is
 * referenced from client code — which is also what lets taps feel instant
 * (the whole grid stays interactive while a toggle is in flight).
 */
export interface DayCell {
  key: string;
  label: number;
  month: string;
  state: "work" | "off" | "booked";
}

const STYLE = {
  work: "border-ink-200 bg-white text-ink-900 hover:border-gold-500",
  off: "border-ink-200 bg-ink-100 text-ink-400 line-through hover:border-gold-500",
  booked: "cursor-not-allowed border-brand-600/30 bg-brand-600/10 font-semibold text-brand-600",
} as const;

const TITLE = {
  work: "Working — tap to take the day off",
  off: "Day off — tap to work",
  booked: "Booked — contact support to change",
} as const;

export function WorkDayCalendar({ days }: { days: DayCell[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="mt-4" data-pending={pending || undefined}>
      <div className={`grid grid-cols-7 gap-1.5 sm:gap-2 ${pending ? "opacity-60" : ""}`}>
        {days.map((d, i) => (
          <button
            key={d.key}
            type="button"
            disabled={d.state === "booked" || pending}
            title={TITLE[d.state]}
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
            <span className="text-[10px] uppercase opacity-60">{d.label === 1 || i === 0 ? d.month : " "}</span>
            {d.label}
          </button>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-4 text-xs text-ink-500">
        <span><span className="mr-1.5 inline-block size-2.5 rounded-sm border border-ink-300 bg-white align-middle" />Working</span>
        <span><span className="mr-1.5 inline-block size-2.5 rounded-sm bg-ink-200 align-middle" />Day off</span>
        <span><span className="mr-1.5 inline-block size-2.5 rounded-sm bg-brand-600/20 align-middle" />Booked</span>
      </p>
    </div>
  );
}
