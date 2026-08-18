import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db, sql } from "@db/client";
import { users, userRoles, sessions } from "@db/schema";
import { ForbiddenError, type Permission, type Role, can } from "@/lib/rbac";
import { config } from "@/lib/config";

const COOKIE = "gt_session";
const TTL_DAYS = 14;
/** Staff sessions are short-lived: the spec requires short privileged sessions. */
const STAFF_TTL_HOURS = 8;

const STAFF_ROLES: ReadonlySet<Role> = new Set([
  "SUPPORT_AGENT", "OPERATIONS_MANAGER", "FINANCE_ADMIN", "CONTENT_ADMIN", "SUPER_ADMIN",
]);

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface SessionUser {
  id: string;
  email: string;
  locale: string;
  roles: Role[];
  isStaff: boolean;
}

/** Issues an opaque token; only its SHA-256 hash is ever persisted. */
export async function createSession(userId: string, roles: Role[]): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const staff = roles.some((r) => STAFF_ROLES.has(r));
  const expires = new Date(
    Date.now() + (staff ? STAFF_TTL_HOURS * 3600_000 : TTL_DAYS * 86_400_000),
  );

  const hdrs = await headers();
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: expires,
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent")?.slice(0, 400) ?? null,
  });

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
    expires,
  });
  return token;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const rows = await sql<{ id: string; email: string; locale: string; roles: Role[] | null }[]>`
    SELECT u.id, u.email, u.locale,
           array_remove(array_agg(r.role), NULL)::text[] AS roles
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN user_roles r ON r.user_id = u.id
    WHERE s.token_hash = ${hashToken(token)}
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND u.status = 'ACTIVE'
    GROUP BY u.id`;

  const row = rows[0];
  if (!row) return null;
  const roles = row.roles ?? [];
  return {
    id: row.id, email: row.email, locale: row.locale, roles,
    isStaff: roles.some((r) => STAFF_ROLES.has(r)),
  };
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await db.update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(COOKIE);
}

/** Revoke every active session for a user (password change, suspected takeover). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
}

/**
 * Not signed in and not signed in with the wrong role are different problems
 * and get different answers:
 *
 *   no session      → redirect to the sign-in page. There is nothing to
 *                     explain; the person simply needs to log in.
 *   wrong role      → throw ForbiddenError, caught by the route's error
 *                     boundary, which explains that the page is not available
 *                     to them. Redirecting here would send someone in a loop.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** The single gate every protected server action and page must pass through. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.roles, permission)) throw new ForbiddenError(permission);
  return user;
}

export async function getUserRoles(userId: string): Promise<Role[]> {
  const rows = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role as Role);
}

export async function findUserByEmail(email: string) {
  const rows = await sql<{ id: string; email: string; password_hash: string | null; status: string; locale: string }[]>`
    SELECT id, email, password_hash, status, locale FROM users
    WHERE email_normalized = lower(${email}) LIMIT 1`;
  return rows[0] ?? null;
}
