"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";

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
  locale, locations, initial, layout = "wide", tourSlug, lockRoute = false,
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
}) {
  const compact = layout === "compact";
  const router = useRouter();
  const [from, setFrom] = useState(initial?.from ?? locations[0]?.slug ?? "");
  const [to, setTo] = useState(initial?.to ?? locations[1]?.slug ?? "");
  const [stops, setStops] = useState<string[]>([]);
  const [when, setWhen] = useState(defaultWhen());
  const [passengers, setPassengers] = useState(2);
  const [luggage, setLuggage] = useState(2);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) return setError("Choose both a pickup and a destination.");
    if (from === to) return setError("Pickup and destination must be different.");
    if (stops.some((s) => !s)) return setError("Choose a place for every stop, or remove it.");

    // A stop that repeats the point before it adds distance but no journey.
    const sequence = [from, ...stops, to];
    for (let i = 1; i < sequence.length; i++) {
      if (sequence[i] === sequence[i - 1]) {
        return setError("Two points in a row cannot be the same place.");
      }
    }
    if (new Date(when).getTime() < Date.now()) return setError("Choose a time in the future.");

    setError(null);
    const q = new URLSearchParams({
      from, to, when, passengers: String(passengers), luggage: String(luggage),
    });
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
          <Field label="From" htmlFor="from" required>
            <Select id="from" value={from} onChange={(e) => setFrom(e.target.value)}>{options}</Select>
          </Field>
        </div>

        <div className={`${compact ? "" : "lg:col-span-2"}${lockRoute ? " hidden" : ""}`}>
          <Field label="To" htmlFor="to" required>
            <Select id="to" value={to} onChange={(e) => setTo(e.target.value)}>{options}</Select>
          </Field>
        </div>

        <div className={compact ? "" : "lg:col-span-2"}>
          <Field label="Date and time" htmlFor="when" hint="Local time in Georgia (Asia/Tbilisi)" required>
            <Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        </div>
      </div>

      {!lockRoute && stops.length > 0 && (
        <ul className="space-y-2">
          {stops.map((stop, i) => (
            <li key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <Field label={`Stop ${i + 1}`} htmlFor={`stop-${i}`}>
                  <Select
                    id={`stop-${i}`}
                    value={stop}
                    onChange={(e) => setStops(stops.map((s, j) => (j === i ? e.target.value : s)))}
                  >
                    <option value="">Choose a place…</option>
                    {options}
                  </Select>
                </Field>
              </div>
              <Button
                type="button" variant="secondary"
                onClick={() => setStops(stops.filter((_, j) => j !== i))}
                aria-label={`Remove stop ${i + 1}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className={compact ? "grid grid-cols-2 gap-3" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-6"}>
        <Field label="Passengers" htmlFor="pax">
          <Input id="pax" type="number" min={1} max={20} value={passengers}
                 onChange={(e) => setPassengers(Number(e.target.value))} />
        </Field>

        <Field label="Luggage" htmlFor="bags">
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
              + Add stop
            </Button>
          </div>
        )}

        <div className={compact ? "col-span-2" : "flex items-end lg:col-span-2"}>
          <Button type="submit" size={compact ? "md" : "md"} className="w-full">
            Find a driver
          </Button>
        </div>
      </div>

      <p className="text-xs text-ink-500">
        Stops are included in the price. Waiting time at each stop is included — the driver will not
        start a meter on you.
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
