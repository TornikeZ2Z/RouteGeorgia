"use client";

import { useEffect, useState } from "react";

/**
 * Crossfading hero carousel.
 *
 * All slides are decorative backgrounds (the headline carries the meaning),
 * so images are alt="" and the rotation is presentation only. It respects
 * prefers-reduced-motion by simply not rotating, and the first slide is in
 * the server HTML so the largest paint never waits for JavaScript.
 */
export function HeroCarousel({ images, interval = 6000 }: { images: string[]; interval?: number }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (images.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % images.length), interval);
    return () => window.clearInterval(id);
  }, [images.length, interval]);

  return (
    <>
      {images.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          loading={i === 0 ? "eager" : "lazy"}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-1000 ${
            i === active ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      {images.length > 1 && (
        <div className="absolute bottom-5 right-5 z-10 flex gap-2">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              tabIndex={-1}
              aria-label={`${i + 1} / ${images.length}`}
              aria-current={i === active}
              onClick={() => setActive(i)}
              className={`size-2.5 rounded-full transition-colors ${
                i === active ? "bg-white" : "bg-white/40 hover:bg-white/70"
              }`}
            />
          ))}
        </div>
      )}
    </>
  );
}
