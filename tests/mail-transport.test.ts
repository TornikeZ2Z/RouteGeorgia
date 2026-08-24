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
