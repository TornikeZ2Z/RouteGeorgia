import Link from "next/link";

/**
 * A stylised map of Georgia with a pin for every place drivers serve.
 *
 * Deliberately schematic — a flat ink outline in the editorial style, not a
 * cartographic product. Pins come from the locations table, projected with a
 * plain equirectangular mapping; each links to a live search for that
 * destination. When geography and honesty conflict, honesty wins: this is a
 * diagram of where we drive, and it looks like one.
 */
interface Place { slug: string; name: string; lat: number; lon: number; type: string }

const OUTLINE = [
  [40.0, 43.55], [41.05, 43.38], [41.55, 43.23], [42.4, 43.22], [43.0, 42.9],
  [43.8, 42.6], [44.5, 42.75], [45.2, 42.7], [45.75, 42.5], [46.45, 41.9],
  [46.72, 41.3], [46.5, 41.05], [45.7, 41.25], [45.0, 41.05], [44.2, 41.2],
  [43.45, 41.1], [42.8, 41.55], [41.8, 41.43], [41.55, 41.55], [41.72, 41.95],
  [41.48, 42.42], [40.85, 42.8], [40.35, 43.15],
] as const;

const W = 860, H = 360;
const px = (lon: number) => ((lon - 39.75) / 7.2) * W;
const py = (lat: number) => ((43.72 - lat) / 2.9) * H;

export function GeorgiaMap({ locale, places }: { locale: string; places: Place[] }) {
  const outline = OUTLINE.map(([lon, lat], i) => `${i === 0 ? "M" : "L"}${px(lon).toFixed(1)},${py(lat).toFixed(1)}`).join(" ") + " Z";
  // Airports sit on top of their cities at map scale; the city pin covers both.
  const searchable = places.filter((p) => p.type !== "BORDER" && p.type !== "AIRPORT");

  return (
    <div className="overflow-hidden rounded-lg border border-ink-300 bg-white p-4 sm:p-8">
      <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Map of Georgia">
        <path d={outline} fill="var(--color-ink-50)" stroke="var(--color-ink-400)" strokeWidth="1.5" strokeLinejoin="round" />
        {searchable.map((p) => (
          <g key={p.slug}>
            <circle cx={px(p.lon)} cy={py(p.lat)} r="4" className="fill-ink-900" />
          </g>
        ))}
      </svg>
      {/* HTML pins on top of the SVG so they are real, focusable links. */}
      {searchable.map((p) => (
        <Link
          key={p.slug}
          href={p.slug === "tbilisi"
            ? `/${locale}/transfers/tbilisi-airport-tbilisi`
            : `/${locale}/search?from=tbilisi&to=${p.slug}&when=${defaultWhen()}&passengers=2&luggage=2`}
          className="group absolute -translate-x-1/2 rounded px-1 text-[11px] font-bold tracking-[-0.02em] text-ink-900 hover:underline"
          style={{
            left: `calc(${((px(p.lon) / W) * 100).toFixed(2)}% )`,
            top: `calc(${((py(p.lat) / H) * 100).toFixed(2)}% + 6px)`,
          }}
        >
          {p.name}
        </Link>
      ))}
      </div>
    </div>
  );
}

function defaultWhen(): string {
  const d = new Date(Date.now() + 48 * 3600_000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}
