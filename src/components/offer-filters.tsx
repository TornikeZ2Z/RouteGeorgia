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
  return (
    <Card className="p-4">
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
  );
}

export { CLASS_LABEL, LANGUAGE_LABEL };
