/**
 * Change requests: the parts with no database in them.
 *
 * Split out so this can be imported from a command-line tool. The module next
 * to it is marked "server-only", which is right for anything touching the
 * database and fatal for anything a script needs to read.
 */

export const AREAS = [
  "BOOKING", "DRIVER", "SCHOOL", "PRICING", "ADMIN", "PUBLIC_SITE",
  "CONTENT", "OTHER",
] as const;
export const URGENCIES = ["LOW", "NORMAL", "HIGH"] as const;
export const STATUSES = ["NEW", "TRIAGED", "IN_PROGRESS", "DONE", "DECLINED"] as const;

export type Area = (typeof AREAS)[number];
export type Urgency = (typeof URGENCIES)[number];
export type Status = (typeof STATUSES)[number];

/** Statuses that still need someone to do something. */
export const OPEN_STATUSES: readonly Status[] = ["NEW", "TRIAGED", "IN_PROGRESS"];

export interface ChangeRequest {
  id: string;
  reference: string;
  title: string;
  body: string;
  reason: string | null;
  area: Area;
  urgency: Urgency;
  submittedByName: string;
  submittedByContact: string | null;
  /** Null means the name is self-reported and was not verified by anything. */
  submittedByUserId: string | null;
  status: Status;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChangeRequest {
  id: string;
  reference: string;
  title: string;
  body: string;
  reason: string | null;
  area: Area;
  urgency: Urgency;
  submittedByName: string;
  submittedByContact: string | null;
  /** Null means the name is self-reported and was not verified by anything. */
  submittedByUserId: string | null;
  status: Status;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const AREA_POINTERS: Record<Area, string> = {
  BOOKING: "src/app/api/bookings, src/lib/booking, src/app/admin/bookings",
  DRIVER: "src/app/driver, src/app/admin/drivers, src/lib/contract.ts",
  SCHOOL: "src/lib/schools.ts, src/app/admin/schools, src/app/[locale]/schools",
  PRICING: "src/lib/pricing/engine.ts, src/app/admin/pricing, src/lib/settings.ts",
  ADMIN: "src/app/admin",
  PUBLIC_SITE: "src/app/[locale], src/components",
  CONTENT: "src/lib/i18n, src/app/admin/content",
  OTHER: "(unknown — read the request and decide)",
};

/**
 * The request, rewritten as something you can hand straight to Claude.
 *
 * A queue that only stores text still leaves someone to restate the problem
 * before any work starts. This does that restating once, at the point where
 * the area and the submitter are already known.
 */
export function briefFor(request: ChangeRequest, imageCount = 0): string {
  const lines = [
    `Change request ${request.reference} — ${request.title}`,
    "",
    `Area:      ${request.area.replace("_", " ").toLowerCase()}`,
    `Urgency:   ${request.urgency.toLowerCase()}`,
    `Requested by: ${request.submittedByName}` +
      (request.submittedByUserId ? " (signed in)" : " (self-reported)"),
    "",
    "What they asked for:",
    request.body.trim(),
  ];
  if (request.reason?.trim()) {
    lines.push("", "Why:", request.reason.trim());
  }
  if (imageCount > 0) {
    // Worth stating rather than leaving to be discovered: for a visual bug the
    // screenshot usually IS the report, and prose alone will mislead.
    lines.push(
      "",
      `${imageCount} screenshot${imageCount === 1 ? "" : "s"} attached — open the request in the`,
      "console and look at them before working from the description alone.",
    );
  }
  lines.push(
    "",
    `Likely area of the codebase: ${AREA_POINTERS[request.area]}`,
    "",
    "Before changing anything: read the comments around the code you are",
    "about to touch — they explain why it is the way it is. Check whether this",
    "request conflicts with an invariant the database enforces (see HANDOVER.md",
    "section 9). If it does, say so rather than working around it.",
  );
  return lines.join("\n");
}
