/**
 * The impersonation token.
 *
 * This cookie is the difference between "staff can view as a driver" and
 * "anyone can become anyone". Every test here is an attack that must fail:
 * forgery, tampering, replay after expiry, and the quiet ones — a truncated
 * token, an empty string, a signature for different content.
 */
import { describe, it, expect, vi } from "vitest";
import { createImpersonationToken, verifyImpersonationToken } from "@/lib/auth/impersonation";

const DRIVER = "11111111-2222-3333-4444-555555555555";
const STAFF = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("impersonation token", () => {
  it("round-trips its own claims", () => {
    const claim = verifyImpersonationToken(createImpersonationToken(DRIVER, STAFF));
    expect(claim).not.toBeNull();
    expect(claim!.targetUserId).toBe(DRIVER);
    expect(claim!.staffUserId).toBe(STAFF);
    expect(claim!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects nothing, garbage and the empty string without throwing", () => {
    expect(verifyImpersonationToken(undefined)).toBeNull();
    expect(verifyImpersonationToken("")).toBeNull();
    expect(verifyImpersonationToken("not-a-token")).toBeNull();
    expect(verifyImpersonationToken("a.b.c")).toBeNull();
  });

  it("rejects a token whose payload was edited after signing", () => {
    const token = createImpersonationToken(DRIVER, STAFF);
    // Swap the driver for another account, keep the signature.
    const other = token.replace(DRIVER, "99999999-2222-3333-4444-555555555555");
    expect(verifyImpersonationToken(other)).toBeNull();
  });

  it("rejects a swapped staff id — the cookie is bound to its issuer", () => {
    const token = createImpersonationToken(DRIVER, STAFF);
    const other = token.replace(STAFF, "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(verifyImpersonationToken(other)).toBeNull();
  });

  it("rejects an extended expiry", () => {
    const token = createImpersonationToken(DRIVER, STAFF);
    const parts = token.split(".");
    parts[3] = String(Number(parts[3]) + 86_400_000); // one more day, same mac
    expect(verifyImpersonationToken(parts.join("."))).toBeNull();
  });

  it("rejects a token after it expires", () => {
    const token = createImpersonationToken(DRIVER, STAFF);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 61 * 60_000); // TTL is 60 minutes
      expect(verifyImpersonationToken(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a truncated signature rather than comparing a prefix", () => {
    const token = createImpersonationToken(DRIVER, STAFF);
    expect(verifyImpersonationToken(token.slice(0, -10))).toBeNull();
  });

  it("rejects an unknown version prefix", () => {
    const token = createImpersonationToken(DRIVER, STAFF).replace(/^v1\./, "v2.");
    expect(verifyImpersonationToken(token)).toBeNull();
  });
});
