/**
 * The driver agreement.
 *
 * A signature is evidence. These tests cover the parts that decide whether it
 * is evidence of anything: that it identifies the exact text agreed to, that
 * it cannot be given by someone idly clicking, and that the document renders
 * with a real counterparty rather than a placeholder.
 */
import { describe, it, expect } from "vitest";
import { contractLocale, nameMatches, parseContract } from "@/lib/contract";
import { en } from "@/lib/i18n/en";
import { ka } from "@/lib/i18n/ka";
import { ru } from "@/lib/i18n/ru";

describe("contract language", () => {
  /**
   * The agreement exists in Georgian and English only. A Russian-speaking
   * driver is shown English rather than an empty page, because signing a
   * translation that does not exist is worse than reading one that does.
   */
  it("offers Georgian to Georgian speakers and English to everyone else", () => {
    expect(contractLocale("ka")).toBe("ka");
    expect(contractLocale("en")).toBe("en");
    expect(contractLocale("ru")).toBe("en");
    expect(contractLocale("")).toBe("en");
  });
});

describe("typed signature", () => {
  it("accepts the driver's own legal name", () => {
    expect(nameMatches("Giorgi Kapanadze", "Giorgi", "Kapanadze")).toBe(true);
  });

  it("ignores case, spacing and punctuation", () => {
    expect(nameMatches("  giorgi   kapanadze ", "Giorgi", "Kapanadze")).toBe(true);
    expect(nameMatches("Giorgi-Kapanadze", "Giorgi", "Kapanadze")).toBe(true);
  });

  it("accepts a middle name or patronymic the applicant did not give us", () => {
    expect(nameMatches("Giorgi Levanis dze Kapanadze", "Giorgi", "Kapanadze")).toBe(true);
  });

  it("works in Georgian script", () => {
    expect(nameMatches("გიორგი კაპანაძე", "გიორგი", "კაპანაძე")).toBe(true);
  });

  it("rejects an idle click in the box", () => {
    expect(nameMatches("ok", "Giorgi", "Kapanadze")).toBe(false);
    expect(nameMatches("yes", "Giorgi", "Kapanadze")).toBe(false);
    expect(nameMatches("", "Giorgi", "Kapanadze")).toBe(false);
  });

  it("rejects half a name", () => {
    expect(nameMatches("Giorgi", "Giorgi", "Kapanadze")).toBe(false);
    expect(nameMatches("Kapanadze", "Giorgi", "Kapanadze")).toBe(false);
  });

  it("rejects somebody else's name", () => {
    expect(nameMatches("Davit Beridze", "Giorgi", "Kapanadze")).toBe(false);
  });

  /** Staff-created drivers may have no legal name recorded; do not lock them out. */
  it("falls back to a length check when we hold no legal name", () => {
    expect(nameMatches("Giorgi K.", null, null)).toBe(true);
    expect(nameMatches("ok", null, null)).toBe(false);
  });
});

describe("contract rendering", () => {
  const body = [
    "An opening paragraph before any heading.",
    "",
    "## First section",
    "",
    "One sentence.",
    "",
    "Another sentence.",
    "",
    "## Second section",
    "",
    "A line that\nwraps in the source.",
  ].join("\n");

  it("separates the introduction from the numbered sections", () => {
    const { intro, sections } = parseContract(body);
    expect(intro).toEqual(["An opening paragraph before any heading."]);
    expect(sections.map((s) => s.heading)).toEqual(["First section", "Second section"]);
    expect(sections[0]!.paragraphs).toEqual(["One sentence.", "Another sentence."]);
  });

  it("joins source line breaks inside a paragraph", () => {
    const { sections } = parseContract(body);
    expect(sections[1]!.paragraphs).toEqual(["A line that wraps in the source."]);
  });

  it("survives an empty document rather than throwing", () => {
    expect(parseContract("")).toEqual({ intro: [], sections: [] });
  });
});

describe("contract interface strings", () => {
  const KEYS = [
    "console.navContract", "contract.navTitle", "contract.signHeading", "contract.nameLabel",
    "contract.confirmLabel", "contract.submit", "contract.bannerTitle", "contract.bannerCta",
    "contract.errNoContract", "contract.errNotApproved", "contract.errAlreadySigned",
    "contract.errNameMismatch", "contract.errNotConfirmed", "contract.errStale",
  ] as const;

  it("exists in all three console languages", () => {
    for (const key of KEYS) {
      for (const [name, dict] of [["en", en], ["ka", ka], ["ru", ru]] as const) {
        expect(Object.keys(dict), `${name} is missing ${key}`).toContain(key);
      }
    }
  });

  /**
   * The signed confirmation names the person, the date and the version. A
   * translation that dropped one of those would leave a driver unable to see
   * what they agreed to.
   */
  it("keeps every placeholder in the signed confirmation", () => {
    for (const [name, dict] of [["en", en], ["ka", ka], ["ru", ru]] as const) {
      const value = (dict as Record<string, string>)["contract.signedBody"]!;
      for (const hole of ["{name}", "{date}", "{version}"]) {
        expect(value, `${name} lost ${hole}`).toContain(hole);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The drafted agreements, as seeded.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { missingDriverDetails } from "@/lib/contract";
import { settlementPeriodLabel } from "@/lib/settings";

const MIGRATION = readFileSync("db/migrations/0015_contracts_v2_and_schools.sql", "utf8");
const AMENDMENT = readFileSync("db/migrations/0016_contract_party_is_the_company.sql", "utf8");

/**
 * Every placeholder the seeded contract text uses must be one the renderer
 * knows how to fill.
 *
 * A typo here is invisible until someone reads their own contract and finds a
 * blank where their personal number should be — or worse, does not notice.
 * The set is written out rather than derived so that adding a placeholder to
 * the text is a deliberate act that fails this test until the renderer is
 * taught to resolve it.
 */
const RESOLVABLE = new Set([
  "COMPANY_LEGAL_NAME", "COMPANY_ID_NUMBER", "COMPANY_ADDRESS",
  "SUPPORT_EMAIL",
  "COMMISSION_PERCENT", "DRIVER_SHARE_PERCENT", "SETTLEMENT_PERIOD",
  "TERMINATION_NOTICE_DAYS",
  "CANCEL_FREE_HOURS", "CANCEL_TIER_A", "CANCEL_TIER_B", "CANCEL_TIER_C",
  "DRIVER_NAME", "DRIVER_PERSONAL_NUMBER", "DRIVER_PHONE", "DRIVER_ADDRESS",
  "SCHOOL_NAME", "SCHOOL_ID_NUMBER", "SCHOOL_DIRECTOR", "SCHOOL_ADDRESS", "SCHOOL_PHONE",
]);

/**
 * Placeholders that appear in a superseded seed but no longer in the live text.
 *
 * Migrations are append-only history: 0015 seeded the agreements naming the
 * director who represents the company, and 0016 removed that in favour of
 * naming the company itself. The old file still contains the placeholder and
 * always will, so it is listed here rather than pretended away — and the
 * assertion inside 0016 is what proves it is gone from the live text.
 */
const REMOVED_BY_LATER_MIGRATION = new Set(["COMPANY_DIRECTOR"]);

describe("seeded agreement text", () => {
  it("uses only placeholders the renderer can resolve", () => {
    const used = new Set(
      [...MIGRATION.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]!),
    );
    const unknown = [...used].filter(
      (key) => !RESOLVABLE.has(key) && !REMOVED_BY_LATER_MIGRATION.has(key),
    );
    expect(unknown).toEqual([]);
  });

  /**
   * The drafted document ran 8, 10, 11 — there was no Article 9. Renumbering
   * closed the gap, and this checks it stayed closed in both languages.
   */
  it("numbers the driver agreement's articles consecutively", () => {
    for (const tag of ["contract_ka", "contract_en"]) {
      const body = MIGRATION.split(`$${tag}$`)[1]!;
      const numbers = [...body.matchAll(/^## (?:Article|მუხლი) (\d+)\./gm)]
        .map((m) => Number(m[1]!));
      expect(numbers).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    }
  });

  it("numbers the school agreement's articles consecutively", () => {
    for (const tag of ["school_ka", "school_en"]) {
      const body = MIGRATION.split(`$${tag}$`)[1]!;
      const numbers = [...body.matchAll(/^## (?:Article|მუხლი) (\d+)\./gm)]
        .map((m) => Number(m[1]!));
      expect(numbers).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    }
  });

  /**
   * The draft numbered two different clauses 12.4. Any repeated clause number
   * within one article is the same defect returning.
   */
  it("gives every clause its own number", () => {
    for (const tag of ["contract_ka", "contract_en", "school_ka", "school_en"]) {
      const body = MIGRATION.split(`$${tag}$`)[1]!;
      const clauses = [...body.matchAll(/^(\d+\.\d+)\. /gm)].map((m) => m[1]!);
      expect(new Set(clauses).size).toBe(clauses.length);
    }
  });

  it("keeps both languages of each agreement structurally identical", () => {
    const sections = (tag: string) =>
      (MIGRATION.split(`$${tag}$`)[1]!.match(/^## /gm) ?? []).length;
    expect(sections("contract_ka")).toBe(sections("contract_en"));
    expect(sections("school_ka")).toBe(sections("school_en"));
  });
});

describe("naming the counterparty", () => {
  /**
   * The company contracts in its own name. A director's name in standing terms
   * signed by many people would have to be reissued whenever the post changed,
   * and identifies nothing the registered name and code do not.
   */
  it("removes the director from every body, and says so if it cannot", () => {
    expect(AMENDMENT).toContain("{{COMPANY_DIRECTOR}}");
    // The migration refuses to finish quietly if a replace missed a body.
    expect(AMENDMENT).toMatch(/RAISE EXCEPTION[\s\S]*COMPANY_DIRECTOR still present/);
  });

  it("refuses to rewrite text that has already been signed", () => {
    expect(AMENDMENT).toMatch(/count\(\*\) FROM contract_signatures\) > 0/);
    expect(AMENDMENT).toContain("publishing a new version");
  });
});

describe("details required before signing", () => {
  const complete = {
    name: "Sandro Avsajanishvili", personalNumber: "01001000001",
    phone: "995555123456", address: "Tbilisi, Rustaveli 1",
  };

  it("accepts a driver who has given everything the agreement prints", () => {
    expect(missingDriverDetails(complete)).toEqual([]);
  });

  it("names what is still missing", () => {
    expect(missingDriverDetails({ ...complete, personalNumber: null }))
      .toEqual(["DRIVER_PERSONAL_NUMBER"]);
    expect(missingDriverDetails({ ...complete, address: "  " }))
      .toEqual(["DRIVER_ADDRESS"]);
  });

  /**
   * The phone is printed but not demanded: it reaches the contract from the
   * account the driver already signed in with, so it cannot be blank in
   * practice, and blocking a signature on it would be a dead end.
   */
  it("does not block on the telephone number", () => {
    expect(missingDriverDetails({ ...complete, phone: null })).toEqual([]);
  });
});

describe("settlement cycle in words", () => {
  it("names the cycles an operator is likely to choose", () => {
    expect(settlementPeriodLabel(1, "en")).toBe("daily");
    expect(settlementPeriodLabel(7, "en")).toBe("weekly");
    expect(settlementPeriodLabel(30, "en")).toBe("monthly");
    expect(settlementPeriodLabel(7, "ka")).toBe("ყოველკვირეულად");
  });

  /**
   * An unusual number must still read as a sentence, because it is going into
   * a signed contract where "every  days" would be a defect.
   */
  it("describes an unusual cycle by its length", () => {
    expect(settlementPeriodLabel(10, "en")).toBe("every 10 days");
    expect(settlementPeriodLabel(10, "ka")).toContain("10");
  });
});
