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
  /** Nudge the label when neighbours crowd (SVG px). */
  labelDy?: number;
}

export const DESTINATIONS: Destination[] = [
  { slug: "tbilisi",     categories: ["culture"],                       seasons: ["spring", "summer", "autumn", "winter"], descKey: "map.d.tbilisi",     icon: "culture" },
  { slug: "mtskheta",    categories: ["culture"],                       seasons: ["spring", "summer", "autumn"],           descKey: "map.d.mtskheta",    icon: "culture", labelDy: 10 },
  { slug: "kazbegi",     categories: ["mountains", "nature"],           seasons: ["spring", "summer", "autumn"],           descKey: "map.d.kazbegi",     icon: "mountains" },
  { slug: "gudauri",     categories: ["mountains", "winter"],           seasons: ["winter"],                               descKey: "map.d.gudauri",     icon: "winter", labelDy: 10 },
  { slug: "mestia",      categories: ["mountains", "nature", "winter"], seasons: ["summer", "winter"],                     descKey: "map.d.mestia",      icon: "mountains" },
  { slug: "batumi",      categories: ["sea", "culture"],                seasons: ["summer"],                               descKey: "map.d.batumi",      icon: "sea" },
  { slug: "kutaisi",     categories: ["culture", "nature"],             seasons: ["spring", "summer", "autumn"],           descKey: "map.d.kutaisi",     icon: "culture" },
  { slug: "telavi",      categories: ["wine", "culture"],               seasons: ["autumn", "spring", "summer"],           descKey: "map.d.telavi",      icon: "wine" },
  { slug: "sighnaghi",   categories: ["wine", "culture"],               seasons: ["autumn", "spring", "summer"],           descKey: "map.d.sighnaghi",   icon: "wine", labelDy: 10 },
  { slug: "borjomi",     categories: ["nature", "culture"],             seasons: ["spring", "summer", "autumn"],           descKey: "map.d.borjomi",     icon: "nature" },
  { slug: "vardzia",     categories: ["culture"],                       seasons: ["spring", "summer", "autumn"],           descKey: "map.d.vardzia",     icon: "culture", labelDy: 10 },
  // --- the founder's additions -------------------------------------------
  { slug: "bakhmaro",    categories: ["mountains", "nature"],           seasons: ["summer", "winter"],                     descKey: "map.d.bakhmaro",    icon: "mountains" },
  { slug: "shekvetili",  categories: ["sea", "nature"],                 seasons: ["summer"],                               descKey: "map.d.shekvetili",  icon: "sea", labelDy: 10 },
  { slug: "ureki",       categories: ["sea"],                           seasons: ["summer"],                               descKey: "map.d.ureki",       icon: "sea", labelDy: -34 },
  { slug: "ambrolauri",  categories: ["wine", "nature", "culture"],     seasons: ["spring", "summer", "autumn"],           descKey: "map.d.ambrolauri",  icon: "wine" },
  { slug: "oni",         categories: ["nature", "culture"],             seasons: ["summer", "autumn"],                     descKey: "map.d.oni",         icon: "nature" },
  { slug: "martvili",    categories: ["nature"],                        seasons: ["spring", "summer", "autumn"],           descKey: "map.d.martvili",    icon: "nature" },
  { slug: "zugdidi",     categories: ["culture"],                       seasons: ["spring", "summer", "autumn"],           descKey: "map.d.zugdidi",     icon: "culture" },
  { slug: "bakuriani",   categories: ["winter", "mountains", "nature"], seasons: ["winter", "summer"],                     descKey: "map.d.bakuriani",   icon: "winter" },
  { slug: "akhaltsikhe", categories: ["culture"],                       seasons: ["spring", "summer", "autumn"],           descKey: "map.d.akhaltsikhe", icon: "culture", labelDy: 10 },
  { slug: "abastumani",  categories: ["nature"],                        seasons: ["summer", "autumn"],                     descKey: "map.d.abastumani",  icon: "nature", labelDy: 10 },
  { slug: "kvareli",     categories: ["wine"],                          seasons: ["autumn", "spring", "summer"],           descKey: "map.d.kvareli",     icon: "wine", labelDy: 10 },
  { slug: "tsinandali",  categories: ["wine", "culture"],               seasons: ["autumn", "spring", "summer"],           descKey: "map.d.tsinandali",  icon: "wine", labelDy: -34 },
];
