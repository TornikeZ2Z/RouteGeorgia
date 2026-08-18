/**
 * Vehicle image, or an honest placeholder.
 *
 * We never ship stock photography of a car that is not the driver's actual
 * vehicle — the whole promise is "this specific driver, this specific car".
 * When there is no approved photo yet, this draws a neutral silhouette tinted
 * to the registered colour and says so.
 */
const COLOURS: Record<string, string> = {
  white: "#e9ecf1", black: "#2b3140", silver: "#c7cdd8", grey: "#aab2c0",
  gray: "#aab2c0", blue: "#4b6ea8", red: "#a84b4b", green: "#4b7d5a", beige: "#d8cdb8",
};

export function VehiclePhoto({
  photoKey, colour, alt, className, rounded = "rounded-lg",
}: {
  photoKey: string | null;
  colour?: string | null;
  alt: string;
  className?: string;
  rounded?: string;
}) {
  if (photoKey) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/media/${photoKey}`}
        alt={alt}
        loading="lazy"
        className={`${className ?? "h-24 w-36"} ${rounded} object-cover`}
      />
    );
  }

  const fill = COLOURS[(colour ?? "").toLowerCase()] ?? "#c7cdd8";
  return (
    <div
      className={`${className ?? "h-24 w-36"} ${rounded} flex items-center justify-center bg-ink-100`}
      role="img"
      aria-label={`${alt} — no photo uploaded yet`}
      title="No photo uploaded yet"
    >
      <svg viewBox="0 0 120 56" className="h-3/5 w-3/5" aria-hidden focusable="false">
        <path
          d="M8 40c0-3 2-6 6-7l8-14c1.5-3 4-5 8-5h40c4 0 6.5 2 8 5l8 14c4 1 6 4 6 7v6H8v-6z"
          fill={fill} stroke="#8492a6" strokeWidth="2" strokeLinejoin="round"
        />
        <circle cx="30" cy="46" r="7" fill="#364154" />
        <circle cx="90" cy="46" r="7" fill="#364154" />
        <path d="M30 20h26v12H24l6-12zM64 20h16l6 12H64V20z" fill="#f6f7f9" opacity=".85" />
      </svg>
    </div>
  );
}
