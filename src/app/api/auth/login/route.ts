import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@db/client";
import { users } from "@db/schema";
import { createSession, findUserByEmail, getUserRoles } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";
import { config } from "@/lib/config";
import { assertSameOrigin, rateLimit, clientKey, CrossOriginError, seeOther } from "@/lib/security";

/**
 * Plain form POST rather than a server action, so sign-in works without
 * JavaScript and can be exercised by any HTTP client.
 */
const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

const STAFF = ["SUPPORT_AGENT", "OPERATIONS_MANAGER", "FINANCE_ADMIN", "CONTENT_ADMIN", "SUPER_ADMIN"];

/** A valid bcrypt hash of a value nobody can supply, used to equalise timing. */
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.9pJEHb5rB3EzP0GcPfMSSNkYy4kQ0Xy";

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
  } catch (err) {
    if (err instanceof CrossOriginError) return NextResponse.json({ error: "invalid" }, { status: 403 });
    throw err;
  }

  // Ten attempts per address per fifteen minutes. Enough for someone who has
  // genuinely forgotten which password they used; not enough to work through
  // a word list.
  const limit = rateLimit(await clientKey("login"), 10, 900);
  if (!limit.allowed) {
    return seeOther("/login?error=throttled", {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const form = await request.formData();
  const parsed = Schema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    next: form.get("next") || undefined,
  });

  const fail = (reason: string) => seeOther(`/login?error=${reason}`);

  if (!parsed.success) return fail("invalid");
  const { email, password, next } = parsed.data;

  const user = await findUserByEmail(email);

  // Always run a comparison so a missing account and a wrong password take
  // comparable time, and never reveal which one it was.
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);

  if (!user || !user.password_hash || !ok || user.status !== "ACTIVE") {
    await writeAudit({
      action: "auth.sign_in_failed", objectType: "user", objectId: user?.id ?? null,
      after: { email }, reason: "invalid credentials",
    });
    return fail("invalid");
  }

  const roles = await getUserRoles(user.id);
  await createSession(user.id, roles);
  await db.update(users).set({ lastAuthAt: new Date() }).where(eq(users.id, user.id));
  await writeAudit({ actorUserId: user.id, action: "auth.sign_in", objectType: "user", objectId: user.id });

  const destination =
    next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : roles.some((r) => STAFF.includes(r))
        ? "/admin"
        : "/driver";

  return seeOther(destination);
}
