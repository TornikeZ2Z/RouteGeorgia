"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import { getTranslator, isLocale, type Locale } from "@/lib/i18n";

interface LocationOption { slug: string; name_en: string; type: string }

/**
 * Route builder with ordered intermediate stops.
 *
 * Stops are a first-class part of the itinerary, not a free-text note: they
 * change the distance, the driving time and therefore the price, and the
 * driver needs them before the trip rather than at the roadside.
 *
 * Client-side validation here is for fast feedback only — the server
 * revalidates everything.
 */
export function SearchForm({
  locale, locations, initial, layout = "wide", tourSlug, lockRoute = false, roundTrip = false,
}: {
  locale: string;
  locations: LocationOption[];
  initial?: { from?: string; to?: string };
  /** "compact" stacks every field for narrow sidebars. */
  layout?: "wide" | "compact";
  /** Books this curated tour rather than a point-to-point transfer. */
  tourSlug?: string;
  /** Fixed endpoints, for a tour whose route is not the traveller's to change. */
  lockRoute?: boolean;
  /** Wait-and-return: adds a return date and prices both directions. */
  roundTrip?: boolean;
}) {
  const compact = layout === "compact";
  const t = getTranslator(isLocale(locale) ? (locale as Locale) : "en");
  const router = useRouter();
  // Default to the single most common trip in Georgia, not the first two
  // names the alphabet happens to produce (Batumi Airport → Kutaisi Airport).
  const has = (slug: string) => locations.some((l) => l.slug === slug);
  const [from, setFrom] = useState(initial?.from ?? (has("tbilisi-airport") ? "tbilisi-airport" : locations[0]?.slug ?? ""));
  const [to, setTo] = useState(initial?.to ?? (has("tbilisi") ? "tbilisi" : locations[1]?.slug ?? ""));
  const [stops, setStops] = useState<string[]>([]);
  const [when, setWhen] = useState(defaultWhen());
  const [returnWhen, setReturnWhen] = useState(defaultReturnWhen());
  const [passengers, setPassengers] = useState(2);
  const [luggage, setLuggage] = useState(2);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) return setError(t("search.errBoth"));
    if (from === to) return setError(t("search.errSame"));
    if (stops.some((s) => !s)) return setError(t("search.errStopEmpty"));

    // A stop that repeats the point before it adds distance but no journey.
    const sequence = [from, ...stops, to];
    for (let i = 1; i < sequence.length; i++) {
      if (sequence[i] === sequence[i - 1]) {
        return setError(t("search.errAdjacent"));
      }
    }
    if (new Date(when).getTime() < Date.now()) return setError(t("search.errPast"));
    if (roundTrip && new Date(returnWhen).getTime() <= new Date(when).getTime()) {
      return setError(t("search.errReturn"));
    }

    setError(null);
    const q = new URLSearchParams({
      from, to, when, passengers: String(passengers), luggage: String(luggage),
    });
    if (roundTrip) q.set("return", returnWhen);
    if (tourSlug) q.set("tour", tourSlug);
    for (const s of stops) q.append("stop", s);
    router.push(`/${locale}/search?${q}`);
  }

  const options = locations.map((l) => (
    <option key={l.slug} value={l.slug}>{l.name_en}</option>
  ));

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className={compact ? "space-y-4" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-6"}>
        {lockRoute && (
          <>
            <input type="hidden" value={from} readOnly />
            <input type="hidden" value={to} readOnly />
          </>
        )}
        <div className={`${compact ? "" : "lg:col-span-2"}${lockRoute ? " hidden" : ""}`}>
          <Field label={t("search.from")} htmlFor="from" required>
            <Select id="from" value={from} onChange={(e) => setFrom(e.target.value)}>{options}</Select>
          </Field>
        </div>

        <div className={`${compact ? "" : "lg:col-span-2"}${lockRoute ? " hidden" : ""}`}>
          <Field label={t("search.to")} htmlFor="to" required>
            <Select id="to" value={to} onChange={(e) => setTo(e.target.value)}>{options}</Select>
          </Field>
        </div>

        <div className={compact ? "" : "lg:col-span-2"}>
          <Field label={t("search.date")} htmlFor="when" hint={t("search.dateHint")} required>
            <Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        </div>

        {roundTrip && (
          <div className={compact ? "" : "lg:col-span-2"}>
            <Field label={t("search.return")} htmlFor="return-when" required>
              <Input id="return-when" type="datetime-local" value={returnWhen}
                     onChange={(e) => setReturnWhen(e.target.value)} />
            </Field>
          </div>
        )}
      </div>

      {roundTrip && <p className="text-xs text-ink-500">{t("search.roundTripNote")}</p>}

      {!lockRoute && stops.length > 0 && (
        <ul className="space-y-2">
          {stops.map((stop, i) => (
            <li key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <Field label={t("search.stop", { n: i + 1 })} htmlFor={`stop-${i}`}>
                  <Select
                    id={`stop-${i}`}
                    value={stop}
                    onChange={(e) => setStops(stops.map((s, j) => (j === i ? e.target.value : s)))}
                  >
                    <option value="">{t("search.choosePlace")}</option>
                    {options}
                  </Select>
                </Field>
              </div>
              <Button
                type="button" variant="secondary"
                onClick={() => setStops(stops.filter((_, j) => j !== i))}
                aria-label={t("search.stop", { n: i + 1 })}
              >
                {t("search.removeStop")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className={compact ? "grid grid-cols-2 gap-3" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-6"}>
        <Field label={t("search.passengers")} htmlFor="pax">
          <Input id="pax" type="number" min={1} max={20} value={passengers}
                 onChange={(e) => setPassengers(Number(e.target.value))} />
        </Field>

        <Field label={t("search.luggage")} htmlFor="bags">
          <Input id="bags" type="number" min={0} max={20} value={luggage}
                 onChange={(e) => setLuggage(Number(e.target.value))} />
        </Field>

        {!lockRoute && (
          <div className={compact ? "col-span-2" : "flex items-end lg:col-span-2"}>
            <Button
              type="button" variant="secondary" className="w-full"
              onClick={() => setStops([...stops, ""])}
              disabled={stops.length >= 6}
            >
            {t("search.addStop")}
          </Button>
          </div>
        )}

        <div className={compact ? "col-span-2" : "flex items-end lg:col-span-2"}>
          <Button type="submit" size={compact ? "md" : "md"} className="w-full">
            {t("search.submit")}
          </Button>
        </div>
      </div>

      <p className="text-xs text-ink-500">
        {t("search.stopsNote")}
      </p>

      {error && <p className="text-sm text-[--color-danger]" role="alert">{error}</p>}
    </form>
  );
}

function defaultWhen() {
  const d = new Date(Date.now() + 26 * 3600_000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

/** Default return: the evening two days out — a plausible wait-and-return. */
function defaultReturnWhen() {
  const d = new Date(Date.now() + 34 * 3600_000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}
