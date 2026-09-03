import { Card } from "@/components/ui";
import { getTranslator, isLocale, type Locale, type MessageKey } from "@/lib/i18n";

const CLASS_LABEL: Record<string, string> = {
  ECONOMY: "Economy", COMFORT: "Comfort", MINIVAN: "Minivan",
  SUV_4X4: "SUV / 4x4", MINIBUS: "Minibus", PREMIUM: "Premium",
};

const LANGUAGE_LABEL: Record<string, string> = {
  en: "English", ka: "Georgian", ru: "Russian", tr: "Turkish",
  de: "German", fr: "French", ar: "Arabic", he: "Hebrew",
};

/**
 * The three tiers a traveller chooses from, over the six classes the fleet
 * and the price bands actually use.
 *
 * Six options asked a visitor to know the difference between a minivan and a
 * minibus before they had picked a car. Three is the decision they can
 * actually make. The classes underneath are untouched, because they are not
 * tiers — a fifteen-seater costs more to run than a saloon whatever tier it
 * is sold in, and collapsing them would take the price bands with it.
 */
export const CLASS_TIERS: { id: string; label: MessageKey; classes: string[] }[] = [
  { id: "economy",  label: "filters.tierEconomy",  classes: ["ECONOMY"] },
  { id: "standard", label: "filters.tierStandard", classes: ["COMFORT", "MINIVAN", "MINIBUS"] },
  { id: "premium",  label: "filters.tierPremium",  classes: ["PREMIUM", "SUV_4X4"] },
];

/** Languages a driver can be filtered by. The fleet is Georgian. */
export const OFFERED_LANGUAGES = ["ka", "en", "ru"] as const;

export interface FilterState {
  classes: string[];
  /** Which of the three tiers are ticked, for re-rendering the panel. */
  tiers: string[];
  language: string;
  fourWheelDrive: boolean;
  winterTyres: boolean;
  petsAllowed: boolean;
  childSeat: boolean;
  wifi: boolean;
  airConditioning: boolean;
  wheelchairAccess: boolean;
  sort: string;
}

/**
 * Two, not seven.
 *
 * Air conditioning, Wi-Fi and winter tyres are things a traveller assumes and
 * a filter cannot promise; 4x4 and step-free access are worth asking about but
 * belong in the conversation, not in a checkbox that silently hides most of
 * the fleet. A child seat and a dog are the two that genuinely decide whether
 * a particular car works at all.
 */
const TOGGLES: [keyof FilterState, MessageKey, MessageKey?][] = [
  ["childSeat", "filters.childSeat"],
  ["petsAllowed", "filters.pets"],
];

/**
 * Filters as a GET form. The whole panel round-trips to the server, so results
 * are shareable and bookmarkable by URL and work without JavaScript.
 */
export function OfferFiltersPanel({
  locale, hidden, state, facets, resultCount,
}: {
  locale: string;
  /** Repeatable name/value pairs, so `stop` can appear more than once. */
  hidden: [string, string][];
  state: FilterState;
  facets: { classes: { value: string; count: number }[]; languages: { value: string; count: number }[] };
  resultCount: number;
}) {
  const t = getTranslator(isLocale(locale) ? (locale as Locale) : "en");

  // Sort is not a filter — it never hides a car — so it stays out of the count.
  const activeCount =
    state.tiers.length +
    (state.language ? 1 : 0) +
    // Only what the panel can still set. The other flags remain in the state
    // so existing links keep working, but nothing can switch them on here.
    [state.childSeat, state.petsAllowed].filter(Boolean).length;

  return (
    <>
      {/*
        On a phone the filter panel used to fill the first screen, so the cars
        — the thing the traveller came for — started below the fold. It now
        collapses behind one control in the corner and the results come first.
        A peer checkbox rather than JavaScript, so it still opens with
        scripting blocked, and the panel is rendered once (no duplicate ids).
      */}
      <input type="checkbox" id="filters-open" className="peer sr-only lg:hidden" />
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <p className="text-sm text-ink-500">{t("filters.results", { count: resultCount })}</p>
        <label
          htmlFor="filters-open"
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-800 hover:bg-ink-50"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" aria-hidden>
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          {t("filters.title")}
          {activeCount > 0 && (
            <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-xs font-semibold text-white">
              {activeCount}
            </span>
          )}
        </label>
      </div>

      <Card className="mt-3 hidden p-4 peer-checked:block lg:mt-0 lg:block">
      <form method="get" className="space-y-5">
        {hidden.map(([k, v], i) => (
          <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
        ))}

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-800">{t("filters.vehicleClass")}</legend>
          <div className="space-y-1">
            {CLASS_TIERS.map((tier) => {
              // The count is the sum of the classes the tier covers, so the
              // number still means "cars you can actually book".
              const count = facets.classes
                .filter((c) => tier.classes.includes(c.value))
                .reduce((n, c) => n + c.count, 0);
              return (
                <label key={tier.id} className="flex items-center gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox" name="tier" value={tier.id}
                    defaultChecked={state.tiers.includes(tier.id)}
                    className="size-4 rounded"
                  />
                  {t(tier.label)}
                  <span className="text-xs text-ink-400">({count})</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor="language" className="mb-1.5 block text-sm font-medium text-ink-800">
            {t("filters.driverSpeaks")}
          </label>
          <select
            id="language" name="language" defaultValue={state.language}
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">{t("filters.anyLanguage")}</option>
            {/* Always these three, whatever the current fleet happens to
                speak. A list that changes with whoever is free today makes the
                filter look broken when a language disappears from it. */}
            {OFFERED_LANGUAGES.map((code) => {
              const count = facets.languages.find((l) => l.value === code)?.count ?? 0;
              return (
                <option key={code} value={code}>
                  {LANGUAGE_LABEL[code]} ({count})
                </option>
              );
            })}
          </select>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-800">{t("filters.features")}</legend>
          <div className="space-y-1">
            {TOGGLES.map(([name, label, hint]) => (
              <label key={name} className="flex items-start gap-2 text-sm text-ink-700">
                <input
                  type="checkbox" name={name} value="1"
                  defaultChecked={Boolean(state[name])} className="mt-0.5 size-4 rounded"
                />
                <span>
                  {t(label)}
                  {hint && <span className="block text-xs text-ink-500">{t(hint)}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex gap-2">
          <button className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            {t("filters.apply")}
          </button>
          <a
            href={`?${new URLSearchParams(hidden)}`}
            className="rounded-lg border border-ink-200 px-4 py-2 text-sm text-ink-600 hover:bg-ink-50"
          >
            {t("filters.clear")}
          </a>
        </div>

        <p aria-live="polite" className="text-xs text-ink-500">
          {t("filters.results", { count: resultCount })}
        </p>
      </form>
      </Card>
    </>
  );
}

export { CLASS_LABEL, LANGUAGE_LABEL };
