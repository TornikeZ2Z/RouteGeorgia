/**
 * The Explore Georgia map's curated content layer.
 *
 * Which pins exist, what they are (categories), when they shine (seasons),
 * and which sub-places their card mentions — the founder's editorial
 * judgement as data. A location missing from this table simply does not
 * appear on the map, even if it is bookable; the map is a recommendation,
 * not an inventory dump.
 */
export type MapCategory = "sea" | "mountains" | "winter" | "wine" | "culture" | "nature";
export type Season = "spring" | "summer" | "autumn" | "winter";

export interface Destination {
  slug: string;
  categories: MapCategory[];
  seasons: Season[];
  /** Dictionary key for the one-sentence card description. */
  descKey: string;
  /** Which category's icon marks the pin. */
  icon: MapCategory;
  /** Where the label sits relative to the pin when neighbours crowd. */
  labelPos?: "top" | "bottom" | "left" | "right";
  /** Small pixel nudge for the whole pin when two pins collide. */
  dx?: number;
  dy?: number;
}

export const DESTINATIONS: Destination[] = [
  { slug: "tbilisi",     categories: ["culture"],                       seasons: ["spring", "summer", "autumn", "winter"], descKey: "map.d.tbilisi",     icon: "culture", labelPos: "right" },
  { slug: "mtskheta",    categories: ["culture"],                       seasons: ["spring", "summer", "autumn"],           descKey: "map.d.mtskheta",    icon: "culture", labelPos: "left" },
  { slug: "kazbegi",     categories: ["mountains", "nature"],           seasons: ["spring", "summer", "autumn"],           descKey: "map.d.kazbegi",     icon: "mountains" },
  { slug: "gudauri",     categories: ["mountains", "winter"],           seasons: ["winter"],                               descKey: "map.d.gudauri",     icon: "winter", labelPos: "bottom" },
  { slug: "mestia",      categories: ["mountains", "nature", "winter"], seasons: ["summer", "winter"],                     descKey: "map.d.mestia",      icon: "mountains" },
  { slug: "batumi",      categories: ["sea", "culture"],                seasons: ["summer"],                               descKey: "map.d.batumi",      icon: "sea", labelPos: "left" },
  { slug: "kutaisi",     categories: ["culture", "nature"],             seasons: ["spring", "summer", "autumn"],           descKey: "map.d.kutaisi",     icon: "culture" },
  { slug: "telavi",      categories: ["wine", "culture"],               seasons: ["autumn", "spring", "summer"],           descKey: "map.d.telavi",      icon: "wine", labelPos: "left" },
  { slug: "sighnaghi",   categories: ["wine", "culture"],               seasons: ["autumn", "spring", "summer"],           descKey: "map.d.sighnaghi",   icon: "wine", labelPos: "bottom" },
  { slug: "borjomi",     categories: ["nature", "culture"],             seasons: ["spring", "summer", "autumn"],           descKey: "map.d.borjomi",     icon: "nature", labelPos: "left" },
  { slug: "vardzia",     categories: ["culture"],                       seasons: ["spring", "summer", "autumn"],           descKey: "map.d.vardzia",     icon: "culture", labelPos: "bottom" },
  // --- the founder's additions -------------------------------------------
  { slug: "bakhmaro",    categories: ["mountains", "nature"],           seasons: ["summer", "winter"],                     descKey: "map.d.bakhmaro",    icon: "mountains" },
  { slug: "shekvetili",  categories: ["sea", "nature"],                 seasons: ["summer"],                               descKey: "map.d.shekvetili",  icon: "sea", labelPos: "left" },
  { slug: "ureki",       categories: ["sea"],                           seasons: ["summer"],                               descKey: "map.d.ureki",       icon: "sea", labelPos: "left", dy: -8 },
  { slug: "ambrolauri",  categories: ["wine", "nature", "culture"],     seasons: ["spring", "summer", "autumn"],           descKey: "map.d.ambrolauri",  icon: "wine" },
  { slug: "oni",         categories: ["nature", "culture"],             seasons: ["summer", "autumn"],                     descKey: "map.d.oni",         icon: "nature" },
  { slug: "martvili",    categories: ["nature"],                        seasons: ["spring", "summer", "autumn"],           descKey: "map.d.martvili",    icon: "nature" },
  { slug: "zugdidi",     categories: ["culture"],                       seasons: ["spring", "summer", "autumn"],           descKey: "map.d.zugdidi",     icon: "culture" },
  { slug: "bakuriani",   categories: ["winter", "mountains", "nature"], seasons: ["winter", "summer"],                     descKey: "map.d.bakuriani",   icon: "winter", labelPos: "right", dx: 6, dy: 6 },
  { slug: "akhaltsikhe", categories: ["culture"],                       seasons: ["spring", "summer", "autumn"],           descKey: "map.d.akhaltsikhe", icon: "culture", labelPos: "bottom", dx: 8, dy: 8 },
  { slug: "abastumani",  categories: ["nature"],                        seasons: ["summer", "autumn"],                     descKey: "map.d.abastumani",  icon: "nature", labelPos: "bottom", dx: -4, dy: -14 },
  { slug: "kvareli",     categories: ["wine"],                          seasons: ["autumn", "spring", "summer"],           descKey: "map.d.kvareli",     icon: "wine", labelPos: "right" },
  { slug: "tsinandali",  categories: ["wine", "culture"],               seasons: ["autumn", "spring", "summer"],           descKey: "map.d.tsinandali",  icon: "wine", labelPos: "top", dy: -6 },
];
