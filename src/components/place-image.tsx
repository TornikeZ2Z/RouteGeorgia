import { ContourField } from "@/components/contour-field";

/**
 * Imagery for a place, route or tour.
 *
 * When a real photograph has been uploaded it is shown. Until then this draws
 * a deterministic illustration from the place's own name, so every location
 * looks distinct and consistent rather than every card sharing one grey box.
 *
 * We deliberately do not ship stock photography. A photograph of Kazbegi that
 * we do not own, on a page selling a trip to Kazbegi, is both a licensing
 * problem and a promise about a specific view we cannot keep.
 */
const PALETTES = [
  { sky: "#234a3c", ridge: "#1a3a2f", far: "#32604e", accent: "#d5ac60" },
  { sky: "#1a3a2f", ridge: "#122b22", far: "#28503f", accent: "#e3c384" },
  { sky: "#20444f", ridge: "#173239", far: "#2e5a66", accent: "#d5ac60" },
  { sky: "#2c4a33", ridge: "#1f3625", far: "#3f6a49", accent: "#f0dcb2" },
];

/** Stable hash so a place always draws the same way. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function PlaceImage({
  imageKey, alt, seedText, className = "h-40 w-full", rounded = "", photoSrc,
}: {
  imageKey?: string | null;
  alt: string;
  /** Usually the slug or name — decides which illustration is drawn. */
  seedText: string;
  className?: string;
  rounded?: string;
  /** A static photo from public/photos/ — wins over everything else. */
  photoSrc?: string | null;
}) {
  if (photoSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoSrc}
        alt={alt}
        loading="lazy"
        className={`${className} ${rounded} object-cover`}
      />
    );
  }
  if (imageKey) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/media/${imageKey}`}
        alt={alt}
        loading="lazy"
        className={`${className} ${rounded} object-cover`}
      />
    );
  }

  const h = hash(seedText);
  const palette = PALETTES[h % PALETTES.length]!;
  const peaks = 4 + (h % 3);

  // Two mountain silhouettes, back lighter than front, with a sun disc whose
  // position also comes from the hash.
  const ridge = (offset: number, height: number, phase: number) => {
    const points: string[] = ["0,200"];
    for (let i = 0; i <= peaks; i++) {
      const x = (i / peaks) * 400;
      const wave = Math.sin(i * 1.7 + phase) * 0.5 + 0.5;
      points.push(`${x.toFixed(1)},${(offset - wave * height).toFixed(1)}`);
    }
    points.push("400,200");
    return points.join(" ");
  };

  return (
    <div className={`${className} ${rounded} relative overflow-hidden`} role="img" aria-label={alt}>
      <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" className="size-full" aria-hidden>
        <rect width="400" height="200" fill={palette.sky} />
        <circle cx={90 + (h % 220)} cy={46 + (h % 26)} r="17" fill={palette.accent} opacity=".5" />
        <polygon points={ridge(150, 76, h % 7)} fill={palette.far} opacity=".85" />
        <polygon points={ridge(178, 92, (h % 5) + 2)} fill={palette.ridge} />
      </svg>
      <span className="absolute inset-0 text-white/70">
        <ContourField opacity={0.22} seed={h % 9} />
      </span>
    </div>
  );
}
