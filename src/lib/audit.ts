import "server-only";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@db/client";
import { auditLogs } from "@db/schema";
import type { Role } from "@/lib/rbac";

/**
 * Append-only audit trail. The table blocks UPDATE and DELETE at the database
 * level, so this is evidence rather than a convenience log.
 *
 * Never pass raw document images, tokens, passwords or card data in
 * before/after — store references, not payloads.
 */
export interface AuditEntry {
  actorUserId?: string | null;
  actorRole?: Role | null;
  action: string;                  // e.g. "driver.approved"
  objectType: string;              // e.g. "driver_profile"
  objectId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  correlationId?: string;
}

export async function writeAudit(entry: AuditEntry): Promise<string> {
  const correlationId = entry.correlationId ?? randomUUID();
  let ip: string | null = null;
  try {
    ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch { /* outside a request context (jobs, seeds) */ }

  await db.insert(auditLogs).values({
    actorUserId: entry.actorUserId ?? null,
    actorRole: (entry.actorRole ?? null) as never,
    action: entry.action,
    objectType: entry.objectType,
    objectId: entry.objectId ?? null,
    before: (entry.before ?? null) as never,
    after: (entry.after ?? null) as never,
    reason: entry.reason ?? null,
    correlationId,
    ip,
  });
  return correlationId;
}

/** Strip fields that must never reach the audit log or analytics. */
export function redact<T extends Record<string, unknown>>(obj: T, extra: string[] = []): Partial<T> {
  const banned = new Set([
    "password", "passwordHash", "password_hash", "token", "tokenHash", "token_hash",
    "cardNumber", "pan", "cvv", "storageKey", "storage_key", "numberHash", "number_hash",
    ...extra,
  ]);
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !banned.has(k))) as Partial<T>;
}
