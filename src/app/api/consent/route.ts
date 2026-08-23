import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@db/client";
import { getSessionUser } from "@/lib/auth/session";
import { assertSameOrigin, CrossOriginError, seeOther } from "@/lib/security";
import { config } from "@/lib/config";

/**
 * Record a cookie choice.
 *
 * The site sets only cookies it cannot work without — the sign-in session and
 * the chosen language and currency — so this is a notice rather than a
 * request for permission. It is still recorded: the consents table exists to
 * prove what someone was shown and when, which is the part that matters if
 * anybody ever asks.
 */
export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
  } catch (err) {
    if (err instanceof CrossOriginError) return NextResponse.json({ error: "invalid" }, { status: 403 });
    throw err;
  }

  const form = await request.formData();
  const accepted = form.get("choice") === "accept";
  const locale = String(form.get("locale") ?? "en");

  const jar = await cookies();
  jar.set("gt_cookie_notice", accepted ? "accepted" : "essential", {
    path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, httpOnly: false,
  });

  // Attach to an account when there is one; otherwise the row still records
  // that the notice was shown and answered, without inventing an identity.
  const user = await getSessionUser();
  if (user) {
    await sql`
      INSERT INTO consents (user_id, kind, policy_version, locale, accepted, evidence)
      VALUES (${user.id}::uuid, 'cookies', ${config.policy.version}, ${locale}, ${accepted},
              ${JSON.stringify({ source: "banner" })}::text::jsonb)`;
  }

  const back = String(form.get("returnTo") ?? "/");
  const safe = back.startsWith("/") && !back.startsWith("//") ? back : "/";
  return seeOther(safe);
}
