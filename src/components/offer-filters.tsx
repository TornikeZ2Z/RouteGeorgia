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

export interface FilterState {
  classes: string[];
  language: string;
  verifiedLanguageOnly: boolean;
  fourWheelDrive: boolean;
  winterTyres: boolean;
  petsAllowed: boolean;
  childSeat: boolean;
  wifi: boolean;
  airConditioning: boolean;
  wheelchairAccess: boolean;
  minRating: number;
  sort: string;
}

const TOGGLES: [keyof FilterState, MessageKey, MessageKey?][] = [
  ["fourWheelDrive", "filters.fourByFour", "filters.fourByFourHint"],
  ["winterTyres", "filters.winterTyres"],
  ["airConditioning", "filters.ac"],
  ["wifi", "filters.wifi"],
  ["childSeat", "filters.childSeat"],
  ["petsAllowed", "filters.pets"],
  ["wheelchairAccess", "filters.stepFree"],
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
    state.classes.length +
    (state.language ? 1 : 0) +
    (state.minRating > 0 ? 1 : 0) +
    [
      state.verifiedLanguageOnly, state.fourWheelDrive, state.winterTyres,
      state.petsAllowed, state.childSeat, state.wifi,
      state.airConditioning, state.wheelchairAccess,
    ].filter(Boolean).length;

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

        <div>
          <label htmlFor="sort" className="mb-1.5 block text-sm font-medium text-ink-800">{t("filters.sortBy")}</label>
          <select
            id="sort" name="sort" defaultValue={state.sort}
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm"
          >
            <option value="recommended">{t("filters.sortRecommended")}</option>
            <option value="price_asc">{t("filters.sortPriceAsc")}</option>
            <option value="price_desc">{t("filters.sortPriceDesc")}</option>
            <option value="rating">{t("filters.sortRating")}</option>
            <option value="reviews">{t("filters.sortReviews")}</option>
          </select>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-800">{t("filters.vehicleClass")}</legend>
          <div className="space-y-1">
            {facets.classes.map((c) => (
              <label key={c.value} className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox" name="class" value={c.value}
                  defaultChecked={state.classes.includes(c.value)}
                  className="size-4 rounded"
                />
                {CLASS_LABEL[c.value] ?? c.value}
                <span className="text-xs text-ink-400">({c.count})</span>
              </label>
            ))}
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
            {facets.languages.map((l) => (
              <option key={l.value} value={l.value}>
                {LANGUAGE_LABEL[l.value] ?? l.value} ({l.count})
              </option>
            ))}
          </select>
          {/* The benchmark's most common complaint is a driver who selected a
              language they cannot actually hold a conversation in. */}
          <label className="mt-2 flex items-start gap-2 text-sm text-ink-700">
            <input
              type="checkbox" name="verifiedLanguage" value="1"
              defaultChecked={state.verifiedLanguageOnly} className="mt-0.5 size-4 rounded"
            />
            <span>
              {t("filters.verifiedOnly")}
              <span className="block text-xs text-ink-500">
                {t("filters.verifiedOnlyHint")}
              </span>
            </span>
          </label>
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

        <div>
          <label htmlFor="minRating" className="mb-1.5 block text-sm font-medium text-ink-800">
            {t("filters.minRating")}
          </label>
          <select
            id="minRating" name="minRating" defaultValue={String(state.minRating || "")}
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">{t("filters.ratingAny")}</option>
            <option value="4">4.0 and above</option>
            <option value="4.5">4.5 and above</option>
          </select>
          <p className="mt-1 text-xs text-ink-500">
            {t("filters.ratingHint")}
          </p>
        </div>

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
