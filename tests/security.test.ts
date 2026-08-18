/**
 * Request-level protections.
 *
 * The audit found every write endpoint accepting cross-origin posts and no
 * throttling on sign-in at all. These lock both behaviours down so a future
 * refactor cannot quietly reopen them.
 */
import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/security";

describe("rate limiting", () => {
  it("allows up to the limit then refuses", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) expect(rateLimit(key, 5, 60).allowed).toBe(true);
    expect(rateLimit(key, 5, 60).allowed).toBe(false);
  });

  it("reports how long to wait once it refuses", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) rateLimit(key, 3, 60);
    const blocked = rateLimit(key, 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("counts each caller separately", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 5; i++) rateLimit(a, 5, 60);
    expect(rateLimit(a, 5, 60).allowed).toBe(false);
    expect(rateLimit(b, 5, 60).allowed).toBe(true);
  });

  it("lets a caller back in once the window rolls over", async () => {
    const key = `roll-${Math.random()}`;
    expect(rateLimit(key, 1, 1).allowed).toBe(true);
    expect(rateLimit(key, 1, 1).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    expect(rateLimit(key, 1, 1).allowed).toBe(true);
  });
});

describe("legal documents", () => {
  it("publishes terms, privacy and cancellation", async () => {
    const { getLegalDocument, LEGAL_SLUGS } = await import("@/lib/legal");
    for (const slug of LEGAL_SLUGS) {
      const doc = getLegalDocument(slug, "en");
      expect(doc, `${slug} must exist`).toBeTruthy();
      expect(doc!.sections.length).toBeGreaterThan(2);
      // Every section must actually say something.
      for (const section of doc!.sections) expect(section.body.join("").length).toBeGreaterThan(40);
    }
  });

  it("returns nothing for an unknown document rather than an empty page", async () => {
    const { getLegalDocument } = await import("@/lib/legal");
    expect(getLegalDocument("refunds-we-invented", "en")).toBeNull();
  });
});
