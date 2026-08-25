import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { assertSameOrigin, CrossOriginError, seeOther } from "@/lib/security";
import { sql } from "@db/client";

/**
 * Mark the signed-in driver's notifications read.
 *
 * A plain form POST rather than a server action so the bell needs no
 * JavaScript. Scoped to the caller's own rows by the WHERE clause — there is
 * no id in the request to tamper with.
 */
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
  } catch (err) {
    if (err instanceof CrossOriginError) return NextResponse.json({ error: "invalid" }, { status: 403 });
    throw err;
  }

  const user = await getSessionUser();
  if (!user) return seeOther("/login?next=/driver");

  await sql`
    UPDATE notifications SET read_at = now()
    WHERE user_id = ${user.id}::uuid AND read_at IS NULL`;

  const referer = request.headers.get("referer");
  // Only ever bounce back inside the driver console, never to a supplied URL.
  const back = referer && new URL(referer, "http://localhost").pathname.startsWith("/driver")
    ? new URL(referer, "http://localhost").pathname
    : "/driver";
  return seeOther(back);
}
