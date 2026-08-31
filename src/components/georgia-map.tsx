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

/**
 * The roads the section is named after.
 *
 * Every pair here is a real route family that can be booked, so the network
 * drawn on the map is the network that exists — not decoration. Endpoints
 * that are not both pins are left out rather than invented.
 */
const ROADS: [string, string][] = [
  ["tbilisi", "mtskheta"], ["mtskheta", "gudauri"], ["gudauri", "kazbegi"],
  ["tbilisi", "telavi"], ["telavi", "kvareli"], ["telavi", "tsinandali"],
  ["tbilisi", "sighnaghi"],
  ["tbilisi", "borjomi"], ["borjomi", "bakuriani"], ["borjomi", "akhaltsikhe"],
  ["akhaltsikhe", "vardzia"], ["akhaltsikhe", "abastumani"],
  ["tbilisi", "kutaisi"], ["kutaisi", "martvili"], ["martvili", "zugdidi"],
  ["zugdidi", "mestia"], ["kutaisi", "ambrolauri"], ["ambrolauri", "oni"],
  ["kutaisi", "batumi"], ["batumi", "ureki"], ["ureki", "shekvetili"],
  ["shekvetili", "bakhmaro"],
];

/** Cities the network hangs off. Drawn larger, because they are. */
const HUBS = new Set(["tbilisi", "kutaisi", "batumi"]);

/**
 * A gently bowed line between two points.
 *
 * Straight segments between twenty-odd pins read as a spider's web; a small
 * consistent curve reads as roads. The bow is perpendicular to the segment
 * and proportional to its length, so short hops stay nearly straight.
 */
function road(ax: number, ay: number, bx: number, by: number): string {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(len * 0.12, 26);
  return `M${ax},${ay} Q${mx - (dy / len) * bow},${my + (dx / len) * bow} ${bx},${by}`;
}


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
    `rounded-full border px-3.5 py-1.5 text-sm transition-all duration-200 ${
      active
        ? "border-pine-800 bg-pine-800 text-white shadow-[0_1px_3px_rgba(11,29,51,.2)] dark:border-gold-400 dark:bg-gold-400 dark:text-pine-900"
        : "border-ink-200 bg-white text-ink-700 hover:border-ink-400 hover:text-ink-900"
    }`;

  return (
    <div id="explore" className="scroll-mt-24 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[0_1px_3px_rgba(11,29,51,.06)]">
      <div className="space-y-3 border-b border-ink-200 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {CATS.map((c) => (
            <button key={c} type="button" onClick={() => setCat(c)} className={chip(cat === c)} aria-pressed={cat === c}>
              {t(CAT_KEY[c] as never)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
      </div>

      <div
        ref={boxRef}
        className="relative bg-[radial-gradient(120%_140%_at_50%_-10%,#ffffff_0%,#eef3f8_55%,#e4ecf4_100%)] p-4 pt-8 dark:bg-[radial-gradient(120%_140%_at_50%_-20%,#123055_0%,#0b1d33_55%,#071527_100%)] sm:p-6 sm:pt-10"
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Map of Georgia">
          <defs>
            <linearGradient id="geo-land" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="[stop-color:#f4f7fa] dark:[stop-color:#1e4470]" />
              <stop offset="0.55" className="[stop-color:#e4ecf5] dark:[stop-color:#173458]" />
              <stop offset="1" className="[stop-color:#d3e0ee] dark:[stop-color:#102844]" />
            </linearGradient>
            <linearGradient id="geo-sea" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" className="[stop-color:#cfe4f2] dark:[stop-color:#0a1f38]" />
              <stop offset="1" className="[stop-color:#e8f2f8] dark:[stop-color:#0b2036]" />
            </linearGradient>
            {/* Lifts the land off the sea instead of leaving it flat. */}
            <filter id="geo-lift" x="-8%" y="-8%" width="116%" height="126%">
              <feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="#0b1d33" floodOpacity="0.16" />
            </filter>
            {/* Ridges are clipped to the land so they never bleed into the sea. */}
            <clipPath id="geo-clip"><path d={GEORGIA_PATH} /></clipPath>
          </defs>

          {/* ---------------------------------------------------- the sea -- */}
          <rect x="0" y="0" width={W} height={H} fill="url(#geo-sea)" opacity="0.55" />
          {[0.30, 0.45, 0.60, 0.75].map((f, i) => (
            <path
              key={f}
              d={`M${8 + i * 5},${H * f} q26,-7 52,0 t52,0`}
              fill="none" strokeWidth="1.1" strokeLinecap="round"
              className="stroke-ink-400/25 dark:stroke-white/10"
            />
          ))}

          {/* ------------------------------------------------ the country -- */}
          <path d={GEORGIA_PATH} fill="url(#geo-land)" filter="url(#geo-lift)" />

          {/* Two ridges, roughly where the Caucasus actually runs: the Greater
              range along the northern border, the Lesser across the south. Not
              survey data — a suggestion of relief, so the land is not a flat
              shape. */}
          <g clipPath="url(#geo-clip)" className="stroke-ink-400/25 dark:stroke-white/12" fill="none" strokeLinecap="round">
            {[0, 7, 14, 21].map((o) => (
              <path key={`gc-${o}`} strokeWidth={o === 0 ? 1.5 : 1}
                    d={`M${px(40.2)},${py(43.35) + o} C${px(41.8)},${py(43.62) + o} ${px(43.6)},${py(42.98) + o} ${px(45.0)},${py(42.72) + o} S${px(46.4)},${py(41.98) + o} ${px(46.8)},${py(41.86) + o}`} />
            ))}
            {[0, 6, 12].map((o) => (
              <path key={`lc-${o}`} strokeWidth={o === 0 ? 1.3 : 0.9}
                    d={`M${px(41.5)},${py(41.62) + o} C${px(42.8)},${py(41.34) + o} ${px(44.0)},${py(41.52) + o} ${px(45.2)},${py(41.28) + o}`} />
            ))}
          </g>

          {/* -------------------------------------------------- the roads -- */}
          <g fill="none" strokeLinecap="round">
            {ROADS.map(([a, b]) => {
              const pa = places.find((p) => p.slug === a), pb = places.find((p) => p.slug === b);
              if (!pa || !pb) return null;
              const lit = matches(pa) && matches(pb);
              const touched = open === a || open === b;
              return (
                <path
                  key={`${a}-${b}`}
                  d={road(px(pa.lon) + (pa.dx ?? 0), py(pa.lat) + (pa.dy ?? 0),
                          px(pb.lon) + (pb.dx ?? 0), py(pb.lat) + (pb.dy ?? 0))}
                  strokeWidth={touched ? 2.4 : 1.5}
                  strokeDasharray={touched ? undefined : "5 7"}
                  className={`transition-all duration-500 ${
                    touched
                      ? "stroke-gold-500 dark:stroke-gold-400"
                      : lit
                        ? "stroke-pine-800/30 dark:stroke-gold-400/30"
                        : "stroke-pine-800/8 dark:stroke-white/8"
                  } ${lit && !touched ? "geo-road" : ""}`}
                />
              );
            })}
          </g>

          <path d={GEORGIA_PATH} fill="none" strokeWidth="1.4" strokeLinejoin="round"
                className="stroke-gold-600/70 dark:stroke-gold-400/55" />

          {/* ------------------------------------------------- neighbours -- */}
          <text x={54} y={py(42.55)} className="fill-ink-400/70 dark:fill-white/25" fontSize="13" letterSpacing="0.35em"
                fontWeight="600" transform={`rotate(-74 54 ${py(42.55)})`}>
            BLACK&#160;&#160;SEA
          </text>
          <text x={px(43.1)} y={38} className="fill-ink-400/55 dark:fill-white/20" fontSize="10.5" letterSpacing="0.3em" fontWeight="600" textAnchor="middle">RUSSIA</text>
          <text x={px(42.35)} y={H - 14} className="fill-ink-400/55 dark:fill-white/20" fontSize="10.5" letterSpacing="0.3em" fontWeight="600" textAnchor="middle">TURKEY</text>
          <text x={px(44.65)} y={H - 14} className="fill-ink-400/55 dark:fill-white/20" fontSize="10.5" letterSpacing="0.3em" fontWeight="600" textAnchor="middle">ARMENIA</text>
          <text x={px(45.75)} y={H - 14} className="fill-ink-400/55 dark:fill-white/20" fontSize="10.5" letterSpacing="0.3em" fontWeight="600" textAnchor="middle">AZERBAIJAN</text>
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
              {/* A hub sits under a soft halo so the eye lands on Tbilisi,
                  Kutaisi and Batumi first. Everything else is a stop. */}
              {HUBS.has(p.slug) && (
                <span
                  aria-hidden
                  className={`absolute left-1/2 top-1/2 -z-10 size-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-400/25 blur-[6px] transition-opacity duration-300 sm:size-12 ${
                    on ? "opacity-100" : "opacity-0"
                  }`}
                />
              )}
              <span
                className={`flex items-center justify-center rounded-full shadow-[0_2px_6px_rgba(11,29,51,.25)] dark:shadow-[0_2px_8px_rgba(2,10,20,.55)] ring-1 transition-transform duration-200 group-hover:scale-110 ${
                  HUBS.has(p.slug) ? "size-7 sm:size-9" : "size-6 sm:size-7"
                } ${
                  open === p.slug
                    ? "bg-gold-400 text-pine-900 ring-white/50"
                    : HUBS.has(p.slug)
                      ? "bg-pine-800 text-white ring-2 ring-gold-400"
                      : "bg-pine-800 text-white ring-gold-400/70"
                }`}
              >
                <svg viewBox="0 0 24 24" className={HUBS.has(p.slug) ? "size-4 sm:size-5" : "size-3.5 sm:size-4"}
                     fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={ICONS[p.icon]} />
                </svg>
              </span>
              {/* The label carries its own backdrop. Twenty-three of them over
                  a drawn coastline is otherwise unreadable wherever two pins
                  sit close together, which in Kakheti is most of them. */}
              <span
                className={`absolute whitespace-nowrap rounded-md bg-white/80 px-1.5 py-0.5 font-semibold tracking-[0.01em] text-ink-800 backdrop-blur-[2px] transition-colors group-hover:bg-white group-hover:text-gold-700 dark:bg-ink-900/70 dark:text-white/90 dark:group-hover:text-gold-400 ${
                  HUBS.has(p.slug) ? "text-[11px] sm:text-[12.5px]" : "text-[10px] sm:text-[11px]"
                } ${LABEL_POS[p.labelPos ?? "bottom"]}`}
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
