"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getTranslator, isLocale, type Locale } from "@/lib/i18n";
import { PlaceImage } from "@/components/place-image";
import type { MapCategory, Season } from "@/lib/destinations";
import { CATEGORY_ICONS as ICONS } from "@/lib/map-icons";

/**
 * Explore Georgia — the interactive map.
 *
 * Curated pins with minimalist category icons, category and season filters,
 * and a card per destination: photo, one honest sentence, live weather and
 * two actions that lead straight to booking. Filtering dims rather than
 * removes, so the country's shape never jumps. Deliberately schematic: this
 * is a recommendation surface, not Google Maps.
 */
export interface MapPlace {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  categories: MapCategory[];
  seasons: Season[];
  icon: MapCategory;
  descKey: string;
  photo: string | null;
  labelDy?: number;
}

const OUTLINE = [
  [40.0, 43.55], [41.05, 43.38], [41.55, 43.23], [42.4, 43.22], [43.0, 42.9],
  [43.8, 42.6], [44.5, 42.75], [45.2, 42.7], [45.75, 42.5], [46.45, 41.9],
  [46.72, 41.3], [46.5, 41.05], [45.7, 41.25], [45.0, 41.05], [44.2, 41.2],
  [43.45, 41.1], [42.8, 41.55], [41.8, 41.43], [41.55, 41.55], [41.72, 41.95],
  [41.48, 42.42], [40.85, 42.8], [40.35, 43.15],
] as const;

const W = 860, H = 380;
const px = (lon: number) => ((lon - 39.75) / 7.2) * W;
const py = (lat: number) => ((43.72 - lat) / 3.0) * H;


const CATS: (MapCategory | "all")[] = ["all", "sea", "mountains", "winter", "wine", "culture", "nature"];
const CAT_KEY: Record<string, string> = {
  all: "map.all", sea: "tours.catSea", mountains: "tours.catMountains", winter: "tours.catWinter",
  wine: "tours.catWine", culture: "tours.catCulture", nature: "map.catNature",
};
const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];
const SEASON_KEY: Record<Season, string> = {
  spring: "home.season1t", summer: "home.season2t", autumn: "home.season3t", winter: "home.season4t",
};
/** Which tour category a map pin's "see tours" should open. */
const TOUR_CAT: Partial<Record<MapCategory, string>> = {
  sea: "sea", mountains: "mountains", winter: "winter", wine: "wine", culture: "culture",
};

export function GeorgiaMap({ locale, places, initialCat = "all" }: { locale: string; places: MapPlace[]; initialCat?: MapCategory | "all" }) {
  const t = getTranslator(isLocale(locale) ? (locale as Locale) : "en");
  const [cat, setCat] = useState<MapCategory | "all">(initialCat);
  const [season, setSeason] = useState<Season | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [weather, setWeather] = useState<Record<string, { temperatureC: number; bucket: string } | null>>({});
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = (p: MapPlace) =>
    (cat === "all" || p.categories.includes(cat)) && (!season || p.seasons.includes(season));

  const selected = places.find((p) => p.slug === open) ?? null;

  useEffect(() => {
    if (!open || weather[open] !== undefined) return;
    let live = true;
    fetch(`/api/weather?slug=${open}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { temperatureC?: number; bucket?: string }) =>
        live && setWeather((w) => ({
          ...w,
          [open]: typeof data?.temperatureC === "number" && typeof data?.bucket === "string"
            ? { temperatureC: data.temperatureC, bucket: data.bucket }
            : null,
        })))
      .catch(() => live && setWeather((w) => ({ ...w, [open]: null })));
    return () => { live = false; };
  }, [open, weather]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  const chip = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm transition-colors ${
      active ? "border-ink-900 bg-ink-900 text-white" : "border-ink-300 text-ink-900 hover:border-ink-500"
    }`;

  return (
    <div id="explore" className="scroll-mt-24 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[0_1px_3px_rgba(11,29,51,.06)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 p-4">
        {CATS.map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)} className={chip(cat === c)} aria-pressed={cat === c}>
            {t(CAT_KEY[c] as never)}
          </button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-ink-200 sm:block" aria-hidden />
        {SEASONS.map((sn) => (
          <button
            key={sn} type="button"
            onClick={() => setSeason(season === sn ? null : sn)}
            className={chip(season === sn)} aria-pressed={season === sn}
          >
            {t(SEASON_KEY[sn] as never)}
          </button>
        ))}
      </div>

      <div ref={boxRef} className="relative p-4 pt-8 sm:p-6 sm:pt-10">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Map of Georgia">
          <path
            d={OUTLINE.map(([lon, lat], i) => `${i === 0 ? "M" : "L"}${px(lon).toFixed(1)},${py(lat).toFixed(1)}`).join(" ") + " Z"}
            fill="var(--color-ink-50)" stroke="var(--color-ink-400)" strokeWidth="1.5" strokeLinejoin="round"
          />
        </svg>

        {places.map((p) => {
          const on = matches(p);
          const x = (px(p.lon) / W) * 100, y = (py(p.lat) / H) * 100;
          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => setOpen(open === p.slug ? null : p.slug)}
              disabled={!on}
              aria-expanded={open === p.slug}
              className={`group absolute -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300 ${
                on ? "opacity-100" : "pointer-events-none opacity-15"
              }`}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <svg viewBox="0 0 24 24" className={`size-4 ${open === p.slug ? "text-brand-600" : "text-ink-900"}`}
                   fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={ICONS[p.icon]} />
              </svg>
              <span
                className="absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap text-[10px] font-bold tracking-[-0.01em] text-ink-700 group-hover:underline sm:text-[11px]"
                style={p.labelDy ? { marginTop: p.labelDy - 4 } : undefined}
              >
                {p.name}
              </span>
            </button>
          );
        })}

        {selected && (
          <div
            className="absolute z-10 w-72 rounded-2xl border border-ink-200 bg-white shadow-[var(--shadow-soft)]"
            style={{
              left: `min(max(${(px(selected.lon) / W) * 100}%, 10rem), calc(100% - 10rem))`,
              top: `${(py(selected.lat) / H) * 100}%`,
              transform: `translate(-50%, ${py(selected.lat) / H > 0.5 ? "calc(-100% - 16px)" : "20px"})`,
            }}
            role="dialog"
            aria-label={selected.name}
          >
            <PlaceImage
              imageKey={null}
              photoSrc={selected.photo}
              alt={selected.name}
              seedText={selected.slug}
              className="h-28 w-full rounded-t-2xl"
            />
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold tracking-[-0.02em] text-ink-900">{selected.name}</p>
                <button type="button" onClick={() => setOpen(null)} aria-label="Close"
                        className="-mr-1 -mt-1 rounded p-1 text-ink-500 hover:text-ink-900">✕</button>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-ink-500">{t(selected.descKey as never)}</p>
              {weather[selected.slug] && (
                <p className="mt-2 text-xs text-ink-500">
                  {t("weather.label")}: {weather[selected.slug]!.temperatureC}°C · {t(("weather." + weather[selected.slug]!.bucket) as never)}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={selected.slug === "tbilisi"
                    ? `/${locale}/transfers/tbilisi-airport-tbilisi`
                    : `/${locale}/search?from=tbilisi&to=${selected.slug}&when=${defaultWhen()}&passengers=2&luggage=2`}
                  className="rounded-lg bg-brand-600 px-3.5 py-2 text-xs text-white shadow-[0_0_2px_0_rgba(0,0,0,.16)] hover:bg-brand-700"
                >
                  {t("map.explore")}
                </Link>
                {TOUR_CAT[selected.icon] && (
                  <Link
                    href={`/${locale}/tours?cat=${TOUR_CAT[selected.icon]}`}
                    className="rounded-lg border border-ink-300 px-3.5 py-2 text-xs text-ink-900 hover:border-ink-500"
                  >
                    {t("map.seeTours")}
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {season && <p className="px-4 pb-4 text-xs text-ink-500">{t("map.seasonHint")}</p>}
    </div>
  );
}

function defaultWhen(): string {
  const d = new Date(Date.now() + 48 * 3600_000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}
