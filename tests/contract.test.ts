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
