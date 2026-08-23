/**
 * The RouteGeorgia monogram from the identity work: a heavy "R" whose leg
 * becomes a winding road with a gold centre line, in Deep Navy — plus the
 * two-tone wordmark, ROUTE in navy and GEORGIA letterspaced in gold.
 * Drawn as code so it ships at any size with zero image weight.
 */
export function RMark({ className = "size-9", tile = false }: { className?: string; tile?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      {tile && <rect width="64" height="64" rx="14" className="fill-[#0b1d33]" />}
      <g className={tile ? "fill-white" : "fill-[#0b1d33]"}>
        {/* R bowl and stem */}
        <path d="M14 6h22a15 15 0 0 1 15 15 15 15 0 0 1-12.2 14.7L52 58h-11L28.6 36H24v-9h12a6 6 0 0 0 0-12H24v14h-10V6Z" />
        {/* road: flows out of the stem, widening as it descends */}
        <path d="M24 29c0 9-2.5 15-8.5 22L10 58h16c5-7 8-14 8-22v-7H24Z" />
      </g>
      {/* gold dashed centre line down the road */}
      <path
        d="M29 30c0 8-2.3 14.6-7.3 21.5"
        fill="none"
        stroke="#d4af37"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="5 5"
      />
    </svg>
  );
}

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5" aria-hidden>
      {dark ? <RMark tile className="size-9" /> : <RMark className="size-9" />}
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
