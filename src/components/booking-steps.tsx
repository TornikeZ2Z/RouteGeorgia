import { getTranslator, isLocale, type Locale } from "@/lib/i18n";

/**
 * Where you are in a booking.
 *
 * The journey has always had four pages — results, the driver, checkout, the
 * confirmation — but nothing on screen said so, so each page looked like a
 * separate errand rather than step two of four. CR-2026-0017 and item 20 of
 * the product review both asked for the flow to be legible; this is that, and
 * nothing more. It does not change the route, the order, or what any page
 * does.
 *
 * Deliberately four steps and not the six in the review: these are the pages
 * that actually exist. Extras and passenger details live inside checkout, and
 * drawing them as separate stops would promise a flow we do not have.
 *
 * Server component with no state — the current step is a prop, because the
 * page already knows which one it is and a client bundle to re-derive that
 * would be waste.
 */
export type BookingStep = 1 | 2 | 3 | 4;

const STEPS = [
  { n: 1, key: "flow.step1" },
  { n: 2, key: "flow.step2" },
  { n: 3, key: "flow.step3" },
  { n: 4, key: "flow.step4" },
] as const;

export function BookingSteps({ locale, current }: { locale: string; current: BookingStep }) {
  const t = getTranslator(isLocale(locale) ? (locale as Locale) : "en");

  return (
    <nav aria-label={t("flow.label")} className="mb-8">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3">
        {STEPS.map((step, i) => {
          const done = step.n < current;
          const here = step.n === current;
          return (
            <li key={step.n} className="flex items-center gap-2 sm:gap-3">
              <span
                className={
                  "flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm " +
                  (here
                    ? "bg-brand-600 font-semibold text-white"
                    : done
                      ? "font-medium text-ink-700"
                      : "text-ink-400")
                }
                // The current step is the page you are on, so it is the
                // accessible "current" landmark, not merely styled differently.
                aria-current={here ? "step" : undefined}
              >
                <span
                  className={
                    "grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums " +
                    (here
                      ? "bg-white text-brand-600"
                      : done
                        ? "bg-brand-600 text-white"
                        : "bg-ink-100 text-ink-500")
                  }
                  aria-hidden
                >
                  {done ? "✓" : step.n}
                </span>
                <span className="whitespace-nowrap">{t(step.key)}</span>
                {/* Screen readers get the state as words; sighted readers get
                    the tick and the fill. */}
                {(done || here) && (
                  <span className="sr-only">{done ? t("flow.done") : t("flow.current")}</span>
                )}
              </span>
              {i < STEPS.length - 1 && (
                <span aria-hidden className="h-px w-4 bg-ink-200 sm:w-8" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
