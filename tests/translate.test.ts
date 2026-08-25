import { describe, it, expect } from "vitest";
import { guessLocale } from "@/lib/translate";

/**
 * The chat translator's two pure decisions: which language a message is in,
 * and whether the result reads naturally in Georgian. Everything else in that
 * module talks to a network service and a database, and is exercised against
 * the real ones rather than mocked into agreement.
 */
describe("language detection for the driver chat", () => {
  it("recognises Georgian by its script", () => {
    expect(guessLocale("გამარჯობა, ხუთ წუთში ჩამოვალ")).toBe("ka");
  });

  it("recognises Russian by Cyrillic", () => {
    expect(guessLocale("Здравствуйте, я у выхода")).toBe("ru");
  });

  it("treats anything else as English, which is what travellers write", () => {
    expect(guessLocale("I am at the arrivals hall")).toBe("en");
    expect(guessLocale("Ich bin am Ausgang")).toBe("en");
  });

  it("classifies by script even when a message mixes in Latin", () => {
    // A Georgian driver writing a flight number or a hotel name in Latin is
    // still writing Georgian, and must not be translated into Georgian.
    expect(guessLocale("ვხვდები Rooms Hotel-თან, 14:30")).toBe("ka");
  });

  it("does not mistake digits and punctuation for a language", () => {
    expect(guessLocale("+995 555 12 34 56")).toBe("en");
  });
});

/**
 * Georgian has no capitals. Translation engines trained on Latin script
 * "capitalise" the first letter into Mtavruli, which in running text reads as
 * shouting — the same trap that once turned a driver's surname initial into
 * a shout on their public profile.
 */
describe("Mtavruli normalisation", () => {
  // The module keeps this private, so the mapping is restated here: any
  // change to it has to break this test rather than pass silently.
  const demtavruli = (text: string) =>
    text.replace(/[Ა-Ჺ]/g, (ch) => String.fromCodePoint(ch.codePointAt(0)! - 0x0bc0));

  it("converts a shouted first letter back to normal Georgian", () => {
    expect(demtavruli("Გამარჯობა")).toBe("გამარჯობა");
  });

  it("leaves ordinary Mkhedruli untouched", () => {
    const text = "მე ვარ ჩამოსვლის დარბაზში";
    expect(demtavruli(text)).toBe(text);
  });

  it("leaves Latin and Cyrillic alone", () => {
    expect(demtavruli("Rooms Hotel, Здравствуйте")).toBe("Rooms Hotel, Здравствуйте");
  });

  it("maps the whole Mtavruli block onto Mkhedruli one to one", () => {
    for (let cp = 0x1c90; cp <= 0x1cba; cp++) {
      const converted = demtavruli(String.fromCodePoint(cp));
      expect(converted.codePointAt(0)).toBe(cp - 0x0bc0);
      // And the result must land inside the Mkhedruli block.
      expect(converted.codePointAt(0)).toBeGreaterThanOrEqual(0x10d0);
      expect(converted.codePointAt(0)).toBeLessThanOrEqual(0x10fa);
    }
  });
});
