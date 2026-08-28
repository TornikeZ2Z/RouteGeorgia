/**
 * The smsoffice sender name.
 *
 * The gateway accepts only letters, digits, hyphen and full stop, up to eleven
 * characters. A brand written the way a human writes it — "Route Plan" — is
 * therefore not a legal sender, and sending it produces error 110 or 150: a
 * failure that looks like a credential problem and is actually a spelling one.
 * These tests pin the rule so the shape of the sender is decided here rather
 * than discovered in a customer's undelivered SMS.
 */
import { describe, it, expect } from "vitest";
import { normalizeSender, normalizeGeorgianMobile } from "@/lib/notifications";

describe("smsoffice sender names", () => {
  it("strips a space, because the gateway's alphabet has none", () => {
    expect(normalizeSender("Route Plan")).toBe("RoutePlan");
  });

  it("keeps the characters the gateway does allow", () => {
    expect(normalizeSender("Route-Plan")).toBe("Route-Plan");
    expect(normalizeSender("Route.Plan")).toBe("Route.Plan");
    expect(normalizeSender("RoutePlan24")).toBe("RoutePlan24");
  });

  it("drops everything outside the permitted alphabet", () => {
    expect(normalizeSender("Route_Plan!")).toBe("RoutePlan");
    // Georgian script is not accepted as a sender name.
    expect(normalizeSender("რაუტ")).toBe("");
  });

  it("truncates at eleven characters", () => {
    expect(normalizeSender("RoutePlannerGeorgia")).toBe("RoutePlanne");
    expect(normalizeSender("RoutePlannerGeorgia").length).toBeLessThanOrEqual(11);
  });

  it("leaves an already-legal name untouched", () => {
    const legal = "RoutePlan";
    expect(normalizeSender(legal)).toBe(legal);
  });
});

describe("Georgian mobile numbers", () => {
  it("adds the country code to a local nine-digit mobile", () => {
    expect(normalizeGeorgianMobile("555123456")).toBe("995555123456");
    expect(normalizeGeorgianMobile("555 12 34 56")).toBe("995555123456");
  });

  it("leaves an already-international number alone", () => {
    expect(normalizeGeorgianMobile("995555123456")).toBe("995555123456");
    expect(normalizeGeorgianMobile("+995 555 123 456")).toBe("995555123456");
  });

  it("strips the punctuation people actually type", () => {
    expect(normalizeGeorgianMobile("(+995) 555-12-34-56")).toBe("995555123456");
  });
});
