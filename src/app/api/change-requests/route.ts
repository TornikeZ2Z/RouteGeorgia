import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { sql } from "@db/client";
import { config } from "@/lib/config";
import {
  createRequest, formTokenMatches, AREAS, URGENCIES,
} from "@/lib/change-requests";
import { queue as queueNotification, dispatchPending } from "@/lib/notifications";
import { writeAudit } from "@/lib/audit";
import {
  assertSameOrigin, rateLimit, clientKey, CrossOriginError, seeOther,
} from "@/lib/security";

/**
 * Change requests submitted from the team's form.
 *
 * The form has no login, so the token in the URL is the only gate. It is
 * re-checked here rather than trusted from the page that rendered the form:
 * a POST can be made without ever loading that page.
 *
 * A plain form POST, so the form works with JavaScript switched off.
 */
const Schema = z.object({
  token: z.string().min(16).max(200),
  title: z.string().trim().min(4).max(160),
  body: z.string().trim().min(10).max(4000),
  reason: z.string().trim().max(2000).optional(),
  area: z.enum(AREAS),
  urgency: z.enum(URGENCIES),
  name: z.string().trim().min(2).max(120),
  contact: z.string().trim().max(200).optional(),
  /** Honeypot: real people never fill a field they cannot see. */
  website: z.string().max(0).optional(),
});

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
  } catch (err) {
    if (err instanceof CrossOriginError) return NextResponse.json({ error: "invalid" }, { status: 403 });
    throw err;
  }

  const form = await request.formData();
  const parsed = Schema.safeParse({
    token: form.get("token"),
    title: form.get("title"),
    body: form.get("body"),
    reason: form.get("reason") || undefined,
    area: form.get("area"),
    urgency: form.get("urgency"),
    name: form.get("name"),
    contact: form.get("contact") || undefined,
    website: form.get("website") || undefined,
  });

  // A bad token gets the same answer as a bad form: nothing that distinguishes
  // "wrong secret" from "wrong field" is worth telling an unauthenticated
  // caller.
  if (!parsed.success || !formTokenMatches(parsed.data.token)) {
    return seeOther(`/r/${String(form.get("token") ?? "")}?error=1`);
  }

  // Generous, because a team working through a release may legitimately file
  // several in a row — but bounded, because the form has no login.
  const limit = rateLimit(await clientKey("change-request"), 10, 3600);
  if (!limit.allowed) {
    return seeOther(`/r/${parsed.data.token}?throttled=1`);
  }

  const h = await headers();
  const created = await createRequest({
    title: parsed.data.title,
    body: parsed.data.body,
    reason: parsed.data.reason ?? null,
    area: parsed.data.area,
    urgency: parsed.data.urgency,
    submittedByName: parsed.data.name,
    submittedByContact: parsed.data.contact ?? null,
    // No session is consulted: this route is for the tokened form, and the
    // console has its own path. Recorded as unverified, honestly.
    submittedByUserId: null,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  });

  // Someone has to learn a request exists. Queued through the same outbox as
  // everything else, so it retries and is visible when it fails.
  if (config.contact.email) {
    await queueNotification(sql, {
      kind: "change_request.submitted",
      channel: "EMAIL",
      to: config.contact.email,
      subject: `${created.reference} — ${created.title}`,
      body:
        `${created.submittedByName} submitted a change request.\n\n` +
        `${created.title}\n\n${created.body}\n\n` +
        (created.reason ? `Why: ${created.reason}\n\n` : "") +
        `Area: ${created.area}   Urgency: ${created.urgency}\n` +
        `${config.appUrl}/admin/requests/${created.id}`,
      dedupe: created.id,
    });
    await dispatchPending(5).catch(() => {});
  }

  await writeAudit({
    actorUserId: null,
    actorRole: null,
    action: "change_request.submitted",
    objectType: "change_request",
    objectId: created.id,
    after: { reference: created.reference, area: created.area, urgency: created.urgency },
    reason: `submitted by ${created.submittedByName} through the team form`,
  });

  return seeOther(`/r/${parsed.data.token}?sent=${encodeURIComponent(created.reference)}`);
}
