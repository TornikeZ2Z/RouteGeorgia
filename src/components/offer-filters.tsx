import { Card } from "@/components/ui";

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

const TOGGLES: [keyof FilterState, string, string?][] = [
  ["fourWheelDrive", "4x4", "Required for some mountain routes"],
  ["winterTyres", "Winter tyres"],
  ["airConditioning", "Air conditioning"],
  ["wifi", "Wi-Fi"],
  ["childSeat", "Child seat"],
  ["petsAllowed", "Pets allowed"],
  ["wheelchairAccess", "Step-free access"],
];

/**
 * Filters as a GET form. The whole panel round-trips to the server, so results
 * are shareable and bookmarkable by URL and work without JavaScript.
 */
export function OfferFiltersPanel({
  hidden, state, facets, resultCount,
}: {
  /** Repeatable name/value pairs, so `stop` can appear more than once. */
  hidden: [string, string][];
  state: FilterState;
  facets: { classes: { value: string; count: number }[]; languages: { value: string; count: number }[] };
  resultCount: number;
}) {
  return (
    <Card className="p-4">
      <form method="get" className="space-y-5">
        {hidden.map(([k, v], i) => (
          <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
        ))}

        <div>
          <label htmlFor="sort" className="mb-1.5 block text-sm font-medium text-ink-800">Sort by</label>
          <select
            id="sort" name="sort" defaultValue={state.sort}
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm"
          >
            <option value="recommended">Recommended</option>
            <option value="price_asc">Lowest price</option>
            <option value="price_desc">Highest price</option>
            <option value="rating">Highest rating</option>
            <option value="reviews">Most reviews</option>
          </select>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-800">Vehicle class</legend>
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
            Driver speaks
          </label>
          <select
            id="language" name="language" defaultValue={state.language}
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Any language</option>
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
              Interview-verified only
              <span className="block text-xs text-ink-500">
                Excludes drivers whose level is self-declared but not yet checked by us.
              </span>
            </span>
          </label>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-800">Vehicle features</legend>
          <div className="space-y-1">
            {TOGGLES.map(([name, label, hint]) => (
              <label key={name} className="flex items-start gap-2 text-sm text-ink-700">
                <input
                  type="checkbox" name={name} value="1"
                  defaultChecked={Boolean(state[name])} className="mt-0.5 size-4 rounded"
                />
                <span>
                  {label}
                  {hint && <span className="block text-xs text-ink-500">{hint}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="minRating" className="mb-1.5 block text-sm font-medium text-ink-800">
            Minimum rating
          </label>
          <select
            id="minRating" name="minRating" defaultValue={String(state.minRating || "")}
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Any</option>
            <option value="4">4.0 and above</option>
            <option value="4.5">4.5 and above</option>
          </select>
          <p className="mt-1 text-xs text-ink-500">
            Filtering by rating hides drivers who are new to the platform.
          </p>
        </div>

        <div className="flex gap-2">
          <button className="flex-1 rounded-lg bg-wine-600 px-4 py-2 text-sm font-medium text-white hover:bg-wine-700">
            Apply
          </button>
          <a
            href={`?${new URLSearchParams(hidden)}`}
            className="rounded-lg border border-ink-200 px-4 py-2 text-sm text-ink-600 hover:bg-ink-50"
          >
            Clear
          </a>
        </div>

        <p aria-live="polite" className="text-xs text-ink-500">
          {resultCount} result{resultCount === 1 ? "" : "s"}
        </p>
      </form>
    </Card>
  );
}

export { CLASS_LABEL, LANGUAGE_LABEL };
