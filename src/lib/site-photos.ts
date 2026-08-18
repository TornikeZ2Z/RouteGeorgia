import "server-only";
import { existsSync } from "node:fs";
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
