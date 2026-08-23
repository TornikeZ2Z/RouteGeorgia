"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import { getTranslator, isLocale, type Locale } from "@/lib/i18n";

interface LocationOption { slug: string; name_en: string; type: string }

/**
 * The booking bar.
 *
 * Wide layout is a single segmented bar — icon, small caps label, value —
 * with hairline dividers and the CTA riding alongside, per the brand mock.
 * Compact layout stays a plain stacked form for sidebars. Both are native
 * GET forms with named fields: the search works even if not one byte of
 * JavaScript runs; the client handler only adds validation and stops.
 */
const ICONS = {
  from: "M12 21s-7-5.6-7-11a7 7 0 1 1 14 0c0 5.4-7 11-7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  to: "M6 21V4m0 1h11.5L15 9l2.5 4H6",
  date: "M7 3v3m10-3v3M4 8h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  ret: "M4 8h13m0 0-3.5-3.5M17 8l-3.5 3.5M20 16H7m0 0 3.5-3.5M7 16l3.5 3.5",
  pax: "M12 11a3.4 3.4 0 1 0 0-6.8A3.4 3.4 0 0 0 12 11Zm-7 9a7 7 0 0 1 14 0",
  bag: "M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-9 0h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z",
} as const;

const CELL_CONTROL =
  "w-full border-0 bg-transparent p-0 text-sm font-semibold text-ink-900 " +
  "focus:outline-none focus:ring-0";

function Cell({
  icon, label, htmlFor, children, className = "",
}: { icon: string; label: string; htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={`flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-3 ${className}`}>
      <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-gold-600" fill="none" stroke="currentColor"
           strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={icon} />
      </svg>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400">{label}</span>
        {children}
      </span>
    </label>
  );
}

export function SearchForm({
  locale, locations, initial, layout = "wide", tourSlug, lockRoute = false, roundTrip = false,
}: {
  locale: string;
  locations: LocationOption[];
  initial?: { from?: string; to?: string };
  layout?: "wide" | "compact";
  tourSlug?: string;
  lockRoute?: boolean;
  roundTrip?: boolean;
}) {
  const compact = layout === "compact";
  const t = getTranslator(isLocale(locale) ? (locale as Locale) : "en");
  const router = useRouter();
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
    if (!tourSlug && from === to) return setError(t("search.errSame"));
    if (stops.some((s) => !s)) return setError(t("search.errStopEmpty"));
    // A tour legitimately starts and ends in the same city, so the adjacency
    // rule only applies between consecutive *stops* on a tour route.
    const sequence = [from, ...stops, to];
    for (let i = 1; i < sequence.length; i++) {
      if (sequence[i] !== sequence[i - 1]) continue;
      const isTourEndpoints = tourSlug && stops.length === 0;
      if (!isTourEndpoints) return setError(t("search.errAdjacent"));
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

  const stopsEditor = !lockRoute && stops.length > 0 && (
    <ul className="space-y-2">
      {stops.map((stop, i) => (
        <li key={i} className="flex items-end gap-2">
          <div className="flex-1">
            <Field label={t("search.stop", { n: i + 1 })} htmlFor={`stop-${i}`}>
              <Select
                id={`stop-${i}`} name="stop" value={stop}
                onChange={(e) => setStops(stops.map((s, j) => (j === i ? e.target.value : s)))}
              >
                <option value="">{t("search.choosePlace")}</option>
                {options}
              </Select>
            </Field>
          </div>
          <Button type="button" variant="secondary"
                  onClick={() => setStops(stops.filter((_, j) => j !== i))}
                  aria-label={t("search.stop", { n: i + 1 })}>
            {t("search.removeStop")}
          </Button>
        </li>
      ))}
    </ul>
  );

  if (compact) {
    return (
      <form onSubmit={submit} action={`/${locale}/search`} method="get" className="space-y-4">
        {tourSlug && <input type="hidden" name="tour" value={tourSlug} />}
        {lockRoute && (
          <>
            <input type="hidden" name="from" value={from} readOnly />
            <input type="hidden" name="to" value={to} readOnly />
          </>
        )}
        {!lockRoute && (
          <>
            <Field label={t("search.from")} htmlFor="from" required>
              <Select id="from" name="from" value={from} onChange={(e) => setFrom(e.target.value)}>{options}</Select>
            </Field>
            <Field label={t("search.to")} htmlFor="to" required>
              <Select id="to" name="to" value={to} onChange={(e) => setTo(e.target.value)}>{options}</Select>
            </Field>
          </>
        )}
        <Field label={t("search.date")} htmlFor="when" hint={t("search.dateHint")} required>
          <Input id="when" name="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        {roundTrip && (
          <Field label={t("search.return")} htmlFor="return-when" required>
            <Input id="return-when" name="return" type="datetime-local" value={returnWhen}
                   onChange={(e) => setReturnWhen(e.target.value)} />
          </Field>
        )}
        {stopsEditor}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("search.passengers")} htmlFor="pax">
            <Input id="pax" name="passengers" type="number" min={1} max={20} value={passengers}
                   onChange={(e) => setPassengers(Number(e.target.value))} />
          </Field>
          <Field label={t("search.luggage")} htmlFor="bags">
            <Input id="bags" name="luggage" type="number" min={0} max={20} value={luggage}
                   onChange={(e) => setLuggage(Number(e.target.value))} />
          </Field>
        </div>
        {!lockRoute && (
          <Button type="button" variant="secondary" className="w-full"
                  onClick={() => setStops([...stops, ""])} disabled={stops.length >= 6}>
            {t("search.addStop")}
          </Button>
        )}
        <Button type="submit" className="w-full">{t("search.submit")}</Button>
        <p className="text-xs text-ink-500">{t("search.stopsNote")}</p>
        {error && <p className="text-sm text-[--color-danger]" role="alert">{error}</p>}
      </form>
    );
  }

  return (
    <form onSubmit={submit} action={`/${locale}/search`} method="get" className="space-y-4">
      {tourSlug && <input type="hidden" name="tour" value={tourSlug} />}
      {lockRoute && (
        <>
          <input type="hidden" name="from" value={from} readOnly />
          <input type="hidden" name="to" value={to} readOnly />
        </>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
        <div className="flex flex-1 flex-col rounded-2xl border border-ink-200 bg-white sm:flex-row sm:flex-wrap lg:flex-nowrap lg:divide-x lg:divide-ink-200 [&>*+*]:border-t [&>*+*]:border-ink-100 sm:[&>*+*]:border-t-0 lg:[&>*+*]:border-t-0">
          {!lockRoute && (
            <Cell icon={ICONS.from} label={t("search.from")} htmlFor="from" className="sm:basis-1/2 lg:basis-auto">
              <select id="from" name="from" value={from} onChange={(e) => setFrom(e.target.value)} className={CELL_CONTROL}>
                {options}
              </select>
            </Cell>
          )}
          {!lockRoute && (
            <Cell icon={ICONS.to} label={t("search.to")} htmlFor="to" className="sm:basis-1/2 lg:basis-auto">
              <select id="to" name="to" value={to} onChange={(e) => setTo(e.target.value)} className={CELL_CONTROL}>
                {options}
              </select>
            </Cell>
          )}
          <Cell icon={ICONS.date} label={t("search.date")} htmlFor="when" className="sm:basis-1/2 lg:basis-auto">
            <input id="when" name="when" type="datetime-local" value={when}
                   onChange={(e) => setWhen(e.target.value)} className={CELL_CONTROL} />
          </Cell>
          {roundTrip && (
            <Cell icon={ICONS.ret} label={t("search.return")} htmlFor="return-when" className="sm:basis-1/2 lg:basis-auto">
              <input id="return-when" name="return" type="datetime-local" value={returnWhen}
                     onChange={(e) => setReturnWhen(e.target.value)} className={CELL_CONTROL} />
            </Cell>
          )}
          <Cell icon={ICONS.pax} label={t("search.passengers")} htmlFor="pax" className="sm:basis-1/4 lg:max-w-28 lg:basis-auto">
            <input id="pax" name="passengers" type="number" min={1} max={20} value={passengers}
                   onChange={(e) => setPassengers(Number(e.target.value))} className={CELL_CONTROL} />
          </Cell>
          <Cell icon={ICONS.bag} label={t("search.luggage")} htmlFor="bags" className="sm:basis-1/4 lg:max-w-28 lg:basis-auto">
            <input id="bags" name="luggage" type="number" min={0} max={20} value={luggage}
                   onChange={(e) => setLuggage(Number(e.target.value))} className={CELL_CONTROL} />
          </Cell>
        </div>

        <button
          type="submit"
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-8 text-base font-bold tracking-[-0.01em] text-white shadow-[var(--shadow-soft)] transition-colors hover:bg-brand-700"
        >
          {t("search.submit")}
          <span aria-hidden>→</span>
        </button>
      </div>

      {stopsEditor}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {!lockRoute ? (
          <button
            type="button"
            onClick={() => setStops([...stops, ""])}
            disabled={stops.length >= 6}
            className="text-sm font-semibold text-gold-600 hover:text-gold-700 disabled:opacity-40"
          >
            {t("search.addStop")}
          </button>
        ) : <span />}
        <p className="text-xs text-ink-500">{t("search.stopsNote")}</p>
      </div>

      {roundTrip && <p className="text-xs text-ink-500">{t("search.roundTripNote")}</p>}
      {error && <p className="text-sm text-[--color-danger]" role="alert">{error}</p>}
    </form>
  );
}

function defaultWhen() {
  const d = new Date(Date.now() + 26 * 3600_000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

function defaultReturnWhen() {
  const d = new Date(Date.now() + 34 * 3600_000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}
