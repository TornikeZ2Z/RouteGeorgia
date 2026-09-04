import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { sql } from "@db/client";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import * as notify from "@/lib/notifications";
import { config } from "@/lib/config";

/**
 * Password reset.
 *
 * Without this a driver who forgets their password has no route back in at
 * all — the only fix was a member of staff editing the database. For a
 * workforce signing in on phones that is not a theoretical problem.
 *
 * The design follows the same rules as the rest of the auth code: only hashes
 * are stored, the token is single use, and requesting a reset for an address
 * that does not exist looks exactly the same as one that does.
 */
const TOKEN_TTL_MINUTES = 60;
const hash = (v: string) => createHash("sha256").update(v).digest("hex");

/**
 * Always resolves, whether or not the address exists. Telling an anonymous
 * caller which email addresses are registered is an information leak.
 */
export async function requestPasswordReset(email: string, locale: string): Promise<void> {
  const [user] = await sql<{ id: string; email: string; locale: string }[]>`
    SELECT id, email, locale FROM users
    WHERE email_normalized = lower(${email}) AND status = 'ACTIVE'`;
  if (!user) return;

  const token = randomBytes(32).toString("base64url");

  await sql.begin(async (tx) => {
    // One live reset at a time: an older link stops working the moment a new
    // one is asked for.
    await tx`
      UPDATE login_tokens SET consumed_at = now()
      WHERE user_id = ${user.id}::uuid AND purpose = 'password_reset' AND consumed_at IS NULL`;

    await tx`
      INSERT INTO login_tokens (user_id, purpose, token_hash, expires_at)
      VALUES (${user.id}::uuid, 'password_reset', ${hash(token)},
              now() + (${TOKEN_TTL_MINUTES} || ' minutes')::interval)`;

    await notify.queue(tx, {
      kind: "message.received",
      to: user.email,
      locale: user.locale ?? locale,
      subject: "Reset your RoutePlanner password",
      body: [
        `Someone asked to reset the password for this address.`,
        ``,
        `${config.appUrl}/reset-password?token=${token}`,
        ``,
        `The link works once and expires in ${TOKEN_TTL_MINUTES} minutes.`,
        `If it was not you, ignore this — nothing has changed.`,
      ].join("\n"),
      dedupe: `${user.id}:${token.slice(0, 12)}`,
    });
  });

  await writeAudit({
    actorUserId: user.id, action: "auth.reset_requested",
    objectType: "user", objectId: user.id,
  });
}

export interface ResetOutcome { ok: boolean; message: string }

export async function completePasswordReset(token: string, password: string): Promise<ResetOutcome> {
  const problems = validatePassword(password);
  if (problems.length > 0) return { ok: false, message: problems.join(" ") };

  const [claimed] = await sql<{ user_id: string }[]>`
    UPDATE login_tokens SET consumed_at = now()
    WHERE token_hash = ${hash(token)} AND purpose = 'password_reset'
      AND consumed_at IS NULL AND expires_at > now()
    RETURNING user_id`;

  if (!claimed) {
    return { ok: false, message: "That link has expired or has already been used. Request another." };
  }

  await sql`
    UPDATE users SET password_hash = ${await hashPassword(password)}, updated_at = now()
    WHERE id = ${claimed.user_id}::uuid`;

  // A password change should end every existing session. If the reset was
  // prompted by someone else having access, leaving their session alive
  // defeats the point.
  await revokeAllSessions(claimed.user_id);

  await writeAudit({
    actorUserId: claimed.user_id, action: "auth.password_reset",
    objectType: "user", objectId: claimed.user_id,
    reason: "completed via emailed link; all sessions ended",
  });

  return { ok: true, message: "Your password has been changed. Sign in with the new one." };
}
