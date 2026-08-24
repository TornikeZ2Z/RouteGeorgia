import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";

/**
 * Staff impersonation of a driver ("view as").
 *
 * A member of operations opens the driver console AS a specific driver: same
 * pages, same data, same actions. It exists because "the driver says the
 * price form rejects them" is undebuggable from a screenshot, and because
 * operations is asked to fix drivers' settings for them daily.
 *
 * The rules that keep it honest:
 *
 *   1. The staff session stays what it is. Impersonation is a second,
 *      SIGNED, short-lived cookie carried alongside it — never a real
 *      session for the driver, so there is no driver token to leak and
 *      nothing to revoke beyond deleting the cookie.
 *   2. It only works while the underlying session is a staff session that
 *      holds the issuing permission. A stolen impersonation cookie without
 *      the staff session cookie is useless.
 *   3. Only driver accounts can be impersonated. Never staff — a manager
 *      must not be able to become a SUPER_ADMIN by "viewing as" one.
 *   4. Every entry the audit log writes while the cookie is live is marked
 *      with the real staff identity. The driver's history never silently
 *      absorbs an action a staff member took.
 */

export const IMPERSONATION_COOKIE = "gt_impersonate";

/** Long enough to fix a driver's settings; short enough to not be a standing key. */
export const IMPERSONATION_TTL_MINUTES = 60;

const sign = (payload: string) =>
  createHmac("sha256", `impersonation:${config.sessionSecret}`).update(payload).digest("hex");

export interface ImpersonationClaim {
  /** The driver being viewed. */
  targetUserId: string;
  /** The member of staff doing the viewing. */
  staffUserId: string;
  expiresAt: Date;
}

export function createImpersonationToken(targetUserId: string, staffUserId: string): string {
  const expires = Date.now() + IMPERSONATION_TTL_MINUTES * 60_000;
  const payload = `v1.${targetUserId}.${staffUserId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

/** Null for anything malformed, forged or expired — never an exception. */
export function verifyImpersonationToken(token: string | undefined): ImpersonationClaim | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return null;

  const [, targetUserId, staffUserId, expiresRaw, mac] = parts as [string, string, string, string, string];
  const payload = `v1.${targetUserId}.${staffUserId}.${expiresRaw}`;
  const expected = sign(payload);
  if (mac.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(mac, "utf8"), Buffer.from(expected, "utf8"))) return null;

  const expiresAt = new Date(Number(expiresRaw));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) return null;

  return { targetUserId, staffUserId, expiresAt };
}
