/**
 * The topographic signature, drawn as real stroked paths.
 *
 * The first two attempts used repeating-radial-gradient. CSS repeating
 * gradients quantise their stops to whole device pixels, so a 2px line every
 * 44px lands on a different subpixel each repetition and the whole field
 * shimmers — across a full-height page it read as corduroy, not contours.
 *
 * SVG strokes are anti-aliased properly and scale cleanly, and drawing the
 * rings by hand means they can be irregular the way a real contour map is,
 * rather than perfectly concentric.
 */
export function ContourField({
  className = "", opacity = 0.16, seed = 0,
}: { className?: string; opacity?: number; seed?: number }) {
  // Nested closed curves, each a little wider and nudged, so the field reads
  // as terrain rather than a target.
  const rings = Array.from({ length: 11 }, (_, i) => {
    const t = i + 1;
    const w = 120 + t * 78;
    const h = 46 + t * 30;
    const cx = 210 + Math.sin(t * 0.9 + seed) * 46;
    const cy = 430 + Math.cos(t * 0.55 + seed) * 14;
    const wobble = 10 + t * 2.2;
    return (
      <path
        key={i}
        d={
          `M ${cx - w} ${cy} ` +
          `C ${cx - w * 0.72} ${cy - h - wobble}, ${cx - w * 0.24} ${cy - h * 1.24}, ${cx} ${cy - h} ` +
          `C ${cx + w * 0.3} ${cy - h * 0.76 - wobble}, ${cx + w * 0.76} ${cy - h * 1.1}, ${cx + w} ${cy} ` +
          `C ${cx + w * 0.74} ${cy + h * 1.16}, ${cx + w * 0.22} ${cy + h * 0.82}, ${cx} ${cy + h} ` +
          `C ${cx - w * 0.28} ${cy + h * 1.2}, ${cx - w * 0.74} ${cy + h * 0.86}, ${cx - w} ${cy} Z`
        }
        fill="none"
        stroke="currentColor"
        strokeWidth={i % 4 === 0 ? 1.6 : 0.9}
        opacity={i % 4 === 0 ? 1 : 0.62}
      />
    );
  });

  return (
    <svg
      className={`pointer-events-none absolute inset-0 size-full ${className}`}
      viewBox="0 0 1400 620"
      preserveAspectRatio="xMidYMax slice"
      style={{ opacity }}
      aria-hidden
      focusable="false"
    >
      {rings}
    </svg>
  );
}
