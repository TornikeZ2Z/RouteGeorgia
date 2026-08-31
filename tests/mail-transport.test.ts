/**
 * Which transport carries a message.
 *
 * The failure this guards against is silent: a deployment that looks
 * configured, queues everything correctly, and prints to a log nobody reads
 * — so a driver who applied never receives the link that is their only way
 * into their own account.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const load = async () => (await import("@/lib/notifications")).getTransport();

const withEnv = async (vars: Record<string, string>) => {
  vi.resetModules();
  vi.unstubAllEnvs();
  // Start from a known-empty mail configuration so one test cannot inherit
  // another's provider.
  for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "RESEND_API_KEY"]) {
    vi.stubEnv(key, "");
  }
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  return load();
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("transport selection", () => {
  it("prints to the log when nothing is configured", async () => {
    expect((await withEnv({})).name).toBe("console");
  });

  it("uses Resend when only an API key is set", async () => {
    expect((await withEnv({ RESEND_API_KEY: "re_test" })).name).toContain("resend");
  });

  it("uses SMTP when host, user and password are all set", async () => {
    const transport = await withEnv({
      SMTP_HOST: "smtp.gmail.com", SMTP_USER: "noreply@example.com", SMTP_PASSWORD: "app-password",
    });
    expect(transport.name).toContain("smtp");
  });

  /**
   * SMTP is the one someone set up deliberately for this domain, so it wins
   * over a stale Resend key left behind from an earlier attempt.
   */
  it("prefers SMTP over Resend when both are present", async () => {
    const transport = await withEnv({
      SMTP_HOST: "smtp.gmail.com", SMTP_USER: "noreply@example.com", SMTP_PASSWORD: "app-password",
      RESEND_API_KEY: "re_test",
    });
    expect(transport.name).toContain("smtp");
    expect(transport.name).not.toContain("resend");
  });

  /**
   * Half-configured SMTP is a likelier mistake than no SMTP at all: a host
   * pasted in, the password forgotten. It must not silently become the
   * chosen transport and then fail on every message.
   */
  it("ignores SMTP that is missing a password", async () => {
    const transport = await withEnv({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "noreply@example.com" });
    expect(transport.name).toBe("console");
  });

  it("ignores SMTP that is missing a user", async () => {
    const transport = await withEnv({ SMTP_HOST: "smtp.gmail.com", SMTP_PASSWORD: "app-password" });
    expect(transport.name).toBe("console");
  });

  /** SMS has no provider yet; it must keep printing rather than be emailed. */
  it("still routes SMS to the log when email has a provider", async () => {
    const transport = await withEnv({
      SMTP_HOST: "smtp.gmail.com", SMTP_USER: "noreply@example.com", SMTP_PASSWORD: "app-password",
    });
    expect(transport.name).toContain("console");
  });
});

describe("georgian mobile normalisation for smsoffice", () => {
  it("adds the country code to a local mobile", async () => {
    const { normalizeGeorgianMobile } = await import("@/lib/notifications");
    expect(normalizeGeorgianMobile("555 12 34 56")).toBe("995555123456");
  });

  it("leaves an already-international number alone", async () => {
    const { normalizeGeorgianMobile } = await import("@/lib/notifications");
    expect(normalizeGeorgianMobile("+995 555 12 34 56")).toBe("995555123456");
  });

  it("strips formatting but does not guess at foreign numbers", async () => {
    const { normalizeGeorgianMobile } = await import("@/lib/notifications");
    // A German number is not ours to rewrite; the gateway rejects it loudly.
    expect(normalizeGeorgianMobile("+49 151 1234567")).toBe("491511234567");
  });
});

/**
 * Sending must not be able to hold a response open.
 *
 * A blocked outbound SMTP port does not refuse a connection, it hangs. Every
 * request path that awaited a send inherited that wait: with 465 blocked, a
 * form POST stayed open until the connection timed out, the submission having
 * already been saved. The browser never heard back and the person filed it
 * again. A blocked mail port should cost an unsent email, not a duplicate.
 */
describe("dispatch never blocks a response", () => {
  it("returns immediately and swallows failure", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    // Point SMTP at an address that will not answer, the way a blocked port
    // behaves — the call must still come straight back.
    vi.stubEnv("SMTP_HOST", "10.255.255.1");
    vi.stubEnv("SMTP_PORT", "465");
    vi.stubEnv("SMTP_USER", "someone@example.com");
    vi.stubEnv("SMTP_PASSWORD", "unused");

    const { dispatchInBackground } = await import("@/lib/notifications");
    const startedAt = Date.now();
    const returned = dispatchInBackground(1);
    const elapsed = Date.now() - startedAt;

    expect(returned).toBeUndefined();
    expect(elapsed).toBeLessThan(200);
  });

  /**
   * Typed as void on purpose. Anything a caller could await is the mistake the
   * function exists to prevent, so the type is the guard-rail.
   */
  it("gives a caller nothing to await", async () => {
    const { dispatchInBackground } = await import("@/lib/notifications");
    expect(dispatchInBackground.length).toBeLessThanOrEqual(2);
    expect(dispatchInBackground(0)).toBeUndefined();
  });
});
