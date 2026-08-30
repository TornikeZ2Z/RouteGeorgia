import "server-only";
import { timingSafeEqual } from "node:crypto";
import { sql } from "@db/client";
import { config } from "@/lib/config";

/**
 * Change requests from the team.
 *
 * The people who use the product all day notice things first, and the ones
 * who notice most are usually the ones least able to open a pull request.
 * This is the path for them: a form on an unguessable link that needs no
 * account, and a queue that holds the request until somebody deals with it.
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

const toRequest = (r: Record<string, unknown>): ChangeRequest => ({
  id: r.id as string,
  reference: r.reference as string,
  title: r.title as string,
  body: r.body as string,
  reason: (r.reason as string) ?? null,
  area: r.area as Area,
  urgency: r.urgency as Urgency,
  submittedByName: r.submitted_by_name as string,
  submittedByContact: (r.submitted_by_contact as string) ?? null,
  submittedByUserId: (r.submitted_by_user_id as string) ?? null,
  status: r.status as Status,
  resolution: (r.resolution as string) ?? null,
  createdAt: r.created_at as Date,
  updatedAt: r.updated_at as Date,
});

/**
 * Does this URL segment match the configured form token?
 *
 * Compared in constant time. The difference is small at this scale, but a
 * plain `===` leaks the length of the matching prefix through timing, and
 * there is no reason to hand that away when the alternative is one import.
 *
 * An unset token means the form does not exist — never that everything
 * matches. That default matters: a misconfigured deploy should close the
 * form, not open it to everyone.
 */
export function formTokenMatches(candidate: string): boolean {
  const expected = config.changeRequestToken;
  if (!expected || expected.length < 16) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const formEnabled = (): boolean =>
  Boolean(config.changeRequestToken && config.changeRequestToken.length >= 16);

export async function listRequests(opts?: { includeClosed?: boolean }): Promise<ChangeRequest[]> {
  const rows = opts?.includeClosed
    ? await sql<Record<string, unknown>[]>`
        SELECT * FROM change_requests
        ORDER BY status IN ('DONE','DECLINED'), created_at DESC`
    : await sql<Record<string, unknown>[]>`
        SELECT * FROM change_requests
        WHERE status IN ('NEW','TRIAGED','IN_PROGRESS')
        ORDER BY created_at DESC`;
  return rows.map(toRequest);
}

export async function getRequest(id: string): Promise<ChangeRequest | null> {
  const [row] = await sql<Record<string, unknown>[]>`
    SELECT * FROM change_requests WHERE id = ${id}::uuid`;
  return row ? toRequest(row) : null;
}

export async function countOpen(): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM change_requests
    WHERE status IN ('NEW','TRIAGED','IN_PROGRESS')`;
  return row?.n ?? 0;
}

export interface RequestImage {
  id: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}

export async function listImages(requestId: string): Promise<RequestImage[]> {
  const rows = await sql<Record<string, unknown>[]>`
    SELECT id, storage_key, mime_type, size_bytes
    FROM change_request_images
    WHERE request_id = ${requestId}::uuid
    ORDER BY created_at`;
  return rows.map((r) => ({
    id: r.id as string,
    storageKey: r.storage_key as string,
    mimeType: r.mime_type as string,
    sizeBytes: Number(r.size_bytes),
  }));
}

/** The storage key behind one image, for the admin-only serving route. */
export async function imageKey(imageId: string): Promise<string | null> {
  const [row] = await sql<{ storage_key: string }[]>`
    SELECT storage_key FROM change_request_images WHERE id = ${imageId}::uuid`;
  return row?.storage_key ?? null;
}

export async function attachImage(input: {
  requestId: string; storageKey: string; mimeType: string;
  sizeBytes: number; checksum: string;
}): Promise<void> {
  await sql`
    INSERT INTO change_request_images
      (request_id, storage_key, mime_type, size_bytes, checksum)
    VALUES (${input.requestId}::uuid, ${input.storageKey}, ${input.mimeType},
            ${input.sizeBytes}, ${input.checksum})`;
}

export interface CreateInput {
  title: string;
  body: string;
  reason: string | null;
  area: Area;
  urgency: Urgency;
  submittedByName: string;
  submittedByContact: string | null;
  submittedByUserId: string | null;
  ip: string | null;
  userAgent: string | null;
}

/**
 * A readable request number, unique per year.
 *
 * Counted rather than sequenced, so two submissions in the same second can
 * collide — which the unique index catches. Retrying with a fresh count is
 * enough: the loser simply takes the next number.
 */
async function nextReference(): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM change_requests
    WHERE reference LIKE ${`CR-${year}-%`}`;
  return `CR-${year}-${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

export async function createRequest(input: CreateInput): Promise<ChangeRequest> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const reference = await nextReference();
    try {
      const [row] = await sql<Record<string, unknown>[]>`
        INSERT INTO change_requests
          (reference, title, body, reason, area, urgency,
           submitted_by_name, submitted_by_contact, submitted_by_user_id,
           ip, user_agent)
        VALUES (${reference}, ${input.title}, ${input.body}, ${input.reason},
                ${input.area}, ${input.urgency}, ${input.submittedByName},
                ${input.submittedByContact},
                ${input.submittedByUserId ? sql`${input.submittedByUserId}::uuid` : null},
                ${input.ip}, ${input.userAgent?.slice(0, 400) ?? null})
        RETURNING *`;
      return toRequest(row!);
    } catch (err) {
      const duplicate = String(err).includes("change_requests_reference_idx");
      if (!duplicate || attempt === 2) throw err;
    }
  }
  throw new Error("could not allocate a request reference");
}

export type StatusError = "NOT_FOUND" | "RESOLUTION_REQUIRED";

export async function setStatus(
  id: string, status: Status, resolution: string | null,
): Promise<{ ok: true; request: ChangeRequest } | { ok: false; error: StatusError }> {
  // The database enforces this too; checking here produces a sentence rather
  // than a constraint violation.
  if (status === "DECLINED" && (!resolution || resolution.trim().length < 5)) {
    return { ok: false, error: "RESOLUTION_REQUIRED" };
  }
  const [row] = await sql<Record<string, unknown>[]>`
    UPDATE change_requests
    SET status = ${status},
        resolution = ${resolution?.trim() || null},
        updated_at = now()
    WHERE id = ${id}::uuid
    RETURNING *`;
  if (!row) return { ok: false, error: "NOT_FOUND" };
  return { ok: true, request: toRequest(row) };
}

/**
 * Where in the codebase each area lives.
 *
 * The point of the brief below is that somebody can act on a request without
 * first working out which part of the repository it concerns. A submitter
 * picking "pricing" already knows more than a grep would tell you.
 */
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
