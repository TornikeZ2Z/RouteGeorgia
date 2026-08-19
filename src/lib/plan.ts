/**
 * Build My Route: a rule table, not an oracle.
 *
 * The wizard asks three questions and assembles a day-by-day sketch from the
 * places and tours the marketplace actually serves — every suggestion is
 * bookable today. Rules are deliberately static and reviewable: this is the
 * founder's curated advice, not a black box.
 */
export type DaysBucket = "1" | "3" | "5" | "7";
export type Interest = "nature" | "culture" | "wine" | "adventure" | "rest";

export interface PlanDay {
  /** Location slugs visited this day, in order. */
  places: string[];
  /** Slug of a curated tour that covers this day, when one exists. */
  tourSlug?: string;
}

export interface PlanResult {
  days: PlanDay[];
  /** The single strongest booking action for this plan. */
  primary: { kind: "tour"; slug: string } | { kind: "transfer"; from: string; to: string; stops: string[] };
}

const DAY_TOUR_BY_INTEREST: Record<Interest, string> = {
  nature: "kazbegi-gergeti-day-trip",
  adventure: "kazbegi-gergeti-day-trip",
  culture: "mtskheta-jvari-day-trip",
  wine: "kakheti-wine-day-trip",
  rest: "borjomi-vardzia-day-trip",
};

export function buildPlan(days: DaysBucket, interests: Interest[]): PlanResult {
  const first = interests[0] ?? "nature";
  const wants = (i: Interest) => interests.includes(i);

  if (days === "1") {
    const slug = DAY_TOUR_BY_INTEREST[first];
    return { days: [{ places: [], tourSlug: slug }], primary: { kind: "tour", slug } };
  }

  if (days === "3") {
    const d3: PlanDay = wants("wine")
      ? { places: [], tourSlug: "kakheti-wine-day-trip" }
      : { places: ["tbilisi"] };
    return {
      days: [
        { places: [], tourSlug: "mtskheta-jvari-day-trip" },
        { places: [], tourSlug: "kazbegi-gergeti-day-trip" },
        d3,
      ],
      primary: { kind: "tour", slug: "kazbegi-gergeti-day-trip" },
    };
  }

  if (days === "5") {
    return {
      days: [
        { places: ["tbilisi"] },
        { places: [], tourSlug: "mtskheta-jvari-day-trip" },
        { places: [], tourSlug: "kazbegi-gergeti-day-trip" },
        { places: [], tourSlug: wants("rest") ? "borjomi-vardzia-day-trip" : "kakheti-wine-day-trip" },
        { places: ["tbilisi"] },
      ],
      primary: { kind: "tour", slug: "kazbegi-gergeti-day-trip" },
    };
  }

  // 7+ days: the grand route. Svaneti for the mountain-minded, the sea coast
  // for everyone who picked rest; both are genuinely bookable supply.
  const western: PlanDay[] = wants("rest")
    ? [{ places: ["kutaisi"] }, { places: ["batumi"] }, { places: ["batumi"] }]
    : [{ places: ["kutaisi", "mestia"], tourSlug: "svaneti-three-days" },
       { places: ["mestia"] }, { places: ["mestia", "kutaisi"] }];
  return {
    days: [
      { places: ["tbilisi"] },
      { places: [], tourSlug: "mtskheta-jvari-day-trip" },
      { places: [], tourSlug: "kazbegi-gergeti-day-trip" },
      { places: [], tourSlug: "kakheti-wine-day-trip" },
      ...western,
    ],
    primary: wants("rest")
      ? { kind: "transfer", from: "tbilisi", to: "batumi", stops: ["kutaisi"] }
      : { kind: "tour", slug: "svaneti-three-days" },
  };
}
