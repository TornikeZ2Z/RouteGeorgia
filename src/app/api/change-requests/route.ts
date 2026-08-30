import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { sql } from "@db/client";
import { config } from "@/lib/config";
import {
  createRequest, attachImage, formTokenMatches, AREAS,
} from "@/lib/change-requests";
import { queue as queueNotification, dispatchPending } from "@/lib/notifications";
import { getStorage, assertUploadAllowed, UploadRejectedError } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";
import {
  assertSameOrigin, rateLimit, clientKey, CrossOriginError, seeOther,
} from "@/lib/security";

/**
 * Change requests submitted from the team's form.
 *
 * The token in the URL is the only gate, and it is re-checked here rather
 * than trusted from the page that rendered the form: a POST can be made
 * without ever loading that page.
 *
 * Four fields and some screenshots. Contact, reason and urgency were asked
 * for originally and dropped — every extra box on a form nobody is obliged
 * to fill in is a reason to close the tab, and triage can set an urgency
 * once the request is in the queue.
 */
const Schema = z.object({
  token: z.string().min(16).max(200),
  title: z.string().trim().min(4).max(160),
  body: z.string().trim().min(10).max(4000),
  area: z.enum(AREAS),
  name: z.string().trim().min(2).max(120),
  /** Honeypot: real people never fill a field they cannot see. */
  website: z.string().max(0).optional(),
});

/** Screenshots only. A PDF is allowed by the storage layer but not here. */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGES = 5;

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
    area: form.get("area"),
    name: form.get("name"),
    website: form.get("website") || undefined,
  });

  const token = String(form.get("token") ?? "");

  // A bad token gets the same answer as a bad form: nothing that distinguishes
  // "wrong secret" from "wrong field" is worth telling an unauthenticated
  // caller.
  if (!parsed.success || !formTokenMatches(parsed.data.token)) {
    return seeOther(`/r/${token}?error=1`);
  }

  const limit = rateLimit(await clientKey("change-request"), 10, 3600);
  if (!limit.allowed) return seeOther(`/r/${parsed.data.token}?throttled=1`);

  // Validate every image before writing anything. Storing three of five and
  // then failing would leave a request whose evidence is silently incomplete.
  const files = form.getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_IMAGES);

  for (const file of files) {
    if (!IMAGE_TYPES.has(file.type)) {
      return seeOther(`/r/${parsed.data.token}?error=image`);
    }
    try {
      assertUploadAllowed(file.type, file.size);
    } catch (err) {
      if (err instanceof UploadRejectedError) {
        return seeOther(`/r/${parsed.data.token}?error=large`);
      }
      throw err;
    }
  }

  const h = await headers();
  const created = await createRequest({
    title: parsed.data.title,
    body: parsed.data.body,
    reason: null,
    area: parsed.data.area,
    urgency: "NORMAL",
    submittedByName: parsed.data.name,
    submittedByContact: null,
    submittedByUserId: null,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  });

  // Restricted, not public: a screenshot of the console shows real customer
  // names, phone numbers and pickup addresses.
  const storage = getStorage();
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storage.put("restricted-kyc", buffer, file.type);
    await attachImage({
      requestId: created.id,
      storageKey: stored.key,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
    });
  }

  if (config.contact.email) {
    await queueNotification(sql, {
      kind: "change_request.submitted",
      channel: "EMAIL",
      to: config.contact.email,
      subject: `${created.reference} — ${created.title}`,
      body:
        `${created.submittedByName} submitted a change request.\n\n` +
        `${created.title}\n\n${created.body}\n\n` +
        `Area: ${created.area}\n` +
        (files.length ? `Screenshots: ${files.length}\n` : "") +
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
    after: { reference: created.reference, area: created.area, images: files.length },
    reason: `submitted by ${created.submittedByName} through the team form`,
  });

  return seeOther(`/r/${parsed.data.token}?sent=${encodeURIComponent(created.reference)}`);
}
