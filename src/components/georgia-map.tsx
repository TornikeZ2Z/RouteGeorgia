"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getTranslator, isLocale, type Locale } from "@/lib/i18n";
import { PlaceImage } from "@/components/place-image";
import type { MapCategory, Season } from "@/lib/destinations";
import { CATEGORY_ICONS as ICONS } from "@/lib/map-icons";
import { GEORGIA_PATH, MAP_W as W, MAP_H as H, project } from "@/lib/georgia-outline";

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
  labelPos?: "top" | "bottom" | "left" | "right";
  dx?: number;
  dy?: number;
}

const px = (lon: number) => project(lon, 0)[0];
const py = (lat: number) => project(0, lat)[1];


const CATS: (MapCategory | "all")[] = ["all", "sea", "mountains", "winter", "wine", "culture", "nature"];
const CAT_KEY: Record<string, string> = {
  all: "map.all", sea: "tours.catSea", mountains: "tours.catMountains", winter: "tours.catWinter",
  wine: "tours.catWine", culture: "tours.catCulture", nature: "map.catNature",
};
const LABEL_POS = {
  bottom: "left-1/2 top-full mt-1 -translate-x-1/2",
  top: "bottom-full left-1/2 mb-1 -translate-x-1/2",
  left: "right-full top-1/2 mr-1.5 -translate-y-1/2",
  right: "left-full top-1/2 ml-1.5 -translate-y-1/2",
} as const;

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
      active ? "border-ink-900 bg-ink-900 text-white dark:text-pine-900" : "border-ink-300 text-ink-900 hover:border-ink-500"
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

      <div
        ref={boxRef}
        className="relative bg-ink-50/60 p-4 pt-8 dark:bg-[radial-gradient(120%_140%_at_50%_-20%,#123055_0%,#0b1d33_55%,#071527_100%)] sm:p-6 sm:pt-10"
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Map of Georgia">
          <defs>
            <linearGradient id="geo-land" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="[stop-color:#e9f0f8] dark:[stop-color:#1b3d63]" />
              <stop offset="1" className="[stop-color:#d4e1ef] dark:[stop-color:#122c4b]" />
            </linearGradient>
          </defs>
          <text x={54} y={py(42.55)} className="fill-ink-400/70 dark:fill-white/25" fontSize="13" letterSpacing="0.35em"
                fontWeight="600" transform={`rotate(-74 54 ${py(42.55)})`}>
            BLACK&#160;&#160;SEA
          </text>
          <text x={px(43.1)} y={38} className="fill-ink-400/60 dark:fill-white/20" fontSize="10.5" letterSpacing="0.3em" fontWeight="600" textAnchor="middle">RUSSIA</text>
          <text x={px(42.35)} y={H - 14} className="fill-ink-400/60 dark:fill-white/20" fontSize="10.5" letterSpacing="0.3em" fontWeight="600" textAnchor="middle">TURKEY</text>
          <text x={px(44.65)} y={H - 14} className="fill-ink-400/60 dark:fill-white/20" fontSize="10.5" letterSpacing="0.3em" fontWeight="600" textAnchor="middle">ARMENIA</text>
          <text x={px(45.75)} y={H - 14} className="fill-ink-400/60 dark:fill-white/20" fontSize="10.5" letterSpacing="0.3em" fontWeight="600" textAnchor="middle">AZERBAIJAN</text>
          <path d={GEORGIA_PATH} fill="url(#geo-land)" strokeWidth="1.3" strokeLinejoin="round"
                className="stroke-gold-600/70 drop-shadow-[0_4px_10px_rgba(11,29,51,.18)] dark:stroke-gold-400/55 dark:drop-shadow-[0_7px_14px_rgba(2,10,20,.55)]" />
        </svg>

        {places.map((p) => {
          const on = matches(p);
          const x = ((px(p.lon) + (p.dx ?? 0)) / W) * 100, y = ((py(p.lat) + (p.dy ?? 0)) / H) * 100;
          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => setOpen(open === p.slug ? null : p.slug)}
              disabled={!on}
              aria-expanded={open === p.slug}
              className={`group absolute -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300 ${
                on ? "opacity-100" : "pointer-events-none opacity-20"
              }`}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <span
                className={`flex size-6 items-center justify-center rounded-full shadow-[0_2px_6px_rgba(11,29,51,.25)] dark:shadow-[0_2px_8px_rgba(2,10,20,.55)] ring-1 transition-transform duration-200 group-hover:scale-110 sm:size-7 ${
                  open === p.slug
                    ? "bg-gold-400 text-pine-900 ring-white/50"
                    : "bg-pine-800 text-white ring-gold-400/70"
                }`}
              >
                <svg viewBox="0 0 24 24" className="size-3.5 sm:size-4" fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={ICONS[p.icon]} />
                </svg>
              </span>
              <span
                className={`absolute whitespace-nowrap text-[10px] font-semibold tracking-[0.01em] text-ink-700 group-hover:text-gold-600 dark:text-white/85 dark:[text-shadow:0_1px_4px_rgba(2,10,20,.9)] dark:group-hover:text-gold-400 sm:text-[11px] ${LABEL_POS[p.labelPos ?? "bottom"]}`}
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
