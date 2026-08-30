/**
 * The team's change-request form.
 *
 * The form has no login, so the token in its URL is the only thing between it
 * and the open internet. These tests exist for that: the failure they guard
 * against is a misconfigured deploy quietly opening the form to everyone
 * rather than closing it.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const TOKEN = "s3cr3t-team-form-token-0001";

const load = async (token: string) => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("CHANGE_REQUEST_TOKEN", token);
  return import("@/lib/change-requests");
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("form token", () => {
  /**
   * The important direction. An unset secret must mean "no form", never
   * "everything matches" — a deploy that forgot the variable should close the
   * door, not remove it.
   */
  it("closes the form when no token is configured", async () => {
    const m = await load("");
    expect(m.formEnabled()).toBe(false);
    expect(m.formTokenMatches("")).toBe(false);
    expect(m.formTokenMatches("anything")).toBe(false);
  });

  it("refuses a token short enough to guess", async () => {
    const m = await load("short");
    expect(m.formEnabled()).toBe(false);
    expect(m.formTokenMatches("short")).toBe(false);
  });

  it("accepts exactly the configured token", async () => {
    const m = await load(TOKEN);
    expect(m.formEnabled()).toBe(true);
    expect(m.formTokenMatches(TOKEN)).toBe(true);
  });

  it("rejects everything else", async () => {
    const m = await load(TOKEN);
    expect(m.formTokenMatches(TOKEN.toUpperCase())).toBe(false);
    expect(m.formTokenMatches(TOKEN.slice(0, -1))).toBe(false);
    expect(m.formTokenMatches(TOKEN + "x")).toBe(false);
    expect(m.formTokenMatches("")).toBe(false);
  });
});

describe("the brief handed to Claude", () => {
  const request = {
    id: "00000000-0000-0000-0000-000000000001",
    reference: "CR-2026-0007",
    title: "Booking email should list luggage",
    body: "Drivers turn up with the wrong car because the email does not say how many bags.",
    reason: "It happened twice last week and both trips ran late.",
    area: "BOOKING" as const,
    urgency: "HIGH" as const,
    submittedByName: "Nino",
    submittedByContact: null,
    submittedByUserId: null,
    status: "NEW" as const,
    resolution: null,
    createdAt: new Date("2026-08-29T09:00:00Z"),
    updatedAt: new Date("2026-08-29T09:00:00Z"),
  };

  it("carries everything needed to act without reopening the queue", async () => {
    const m = await load(TOKEN);
    const brief = m.briefFor(request);
    expect(brief).toContain("CR-2026-0007");
    expect(brief).toContain(request.title);
    expect(brief).toContain(request.body);
    expect(brief).toContain(request.reason);
    expect(brief).toContain("Nino");
    // Points at the part of the repository the area implies, so nobody has to
    // work that out from the prose.
    expect(brief).toContain("src/app/api/bookings");
  });

  /**
   * Whether the name was verified changes how much weight to give a request,
   * so the brief must say which it is rather than presenting both the same.
   */
  it("says when the submitter identified themselves and was not checked", async () => {
    const m = await load(TOKEN);
    expect(m.briefFor(request)).toContain("self-reported");
    expect(m.briefFor({ ...request, submittedByUserId: "u1" })).toContain("signed in");
  });

  it("omits the reason cleanly when none was given", async () => {
    const m = await load(TOKEN);
    const brief = m.briefFor({ ...request, reason: null });
    expect(brief).not.toContain("Why:");
    expect(brief).toContain(request.body);
  });
});
