/**
 * The RouteGeorgia monogram, matched to the identity sheets: a bold R whose
 * left stem flows into a road sweeping down-left, with a gold dashed centre
 * line. Drawn in code — crisp at every size, restyleable per surface, and
 * replaceable by the designer's vector in one file.
 */
function MarkPaths({ fg, dash }: { fg: string; dash: string }) {
  return (
    <g>
      <path
        fill={fg}
        d="M17 6 h20 a15 15 0 0 1 2.2 29.84 L52 58 H40.6 L28.4 36.4 H27 v-9.4 h10 a6 6 0 0 0 0-12 H27 V58 H17 Z"
      />
      <path fill={fg} d="M27 30 v6 c0 8.5 -3.4 15.4 -10.6 22 H2.8 C13.4 50.6 17 43.6 17 34 v-4 Z" />
      <path
        fill="none"
        stroke={dash}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="5 4.6"
        d="M22 31 v4.4 c0 7.8 -2.8 13.9 -8.6 19.8"
      />
    </g>
  );
}

export function RMark({ className = "size-9", tile = false }: { className?: string; tile?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      {tile ? (
        <>
          <rect width="64" height="64" rx="14" fill="#0b1d33" />
          <g transform="translate(7,3) scale(0.8)">
            <MarkPaths fg="#ffffff" dash="#d4af37" />
          </g>
        </>
      ) : (
        <MarkPaths fg="#0b1d33" dash="#d4af37" />
      )}
    </svg>
  );
}

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5" aria-hidden>
      {dark ? (
        <svg viewBox="0 0 64 64" className="size-9" aria-hidden>
          <MarkPaths fg="#ffffff" dash="#d4af37" />
        </svg>
      ) : (
        <RMark className="size-9" />
      )}
      <span className="flex flex-col leading-none">
        <span className={`text-lg font-extrabold tracking-[0.08em] ${dark ? "text-white" : "text-[#0b1d33]"}`}>
          ROUTE
        </span>
        <span className="mt-0.5 text-[9px] font-semibold tracking-[0.42em] text-[#d4af37]">
          GEORGIA
        </span>
      </span>
    </span>
  );
}
