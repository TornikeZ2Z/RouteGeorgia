import "server-only";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Real photography, when it exists. Tornike drops licensed JPGs into
 * public/photos/ (see the README there); every surface falls back to the
 * deterministic illustrations until then. Existence is cached per process —
 * a deploy restarts the process, which is exactly when files can change.
 */
const cache = new Map<string, string | null>();

export function sitePhoto(name: string): string | null {
  let hit = cache.get(name);
  if (hit === undefined) {
    hit = existsSync(path.join(process.cwd(), "public", "photos", name)) ? `/photos/${name}` : null;
    cache.set(name, hit);
  }
  return hit;
}


/**
 * Traveller photos: drop consented JPGs into public/photos/travellers/ named
 * `name-country-place.jpg` (e.g. anna-germany-kazbegi.jpg) and the homepage
 * section appears by itself. No files, no section — nothing fabricated.
 */
export function listTravellerPhotos(): { src: string; caption: string }[] {
  try {
    const dir = path.join(process.cwd(), "public", "photos", "travellers");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .slice(0, 8)
      .map((f) => ({
        src: `/photos/travellers/${f}`,
        caption: f.replace(/\.[a-z]+$/i, "").split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" · "),
      }));
  } catch {
    return [];
  }
}