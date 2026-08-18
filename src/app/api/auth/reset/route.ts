import { NextResponse, type NextRequest } from "next/server";
import { completePasswordReset } from "@/lib/auth/reset";
import { assertSameOrigin, rateLimit, clientKey, CrossOriginError } from "@/lib/security";
import { config } from "@/lib/config";

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
  } catch (err) {
    if (err instanceof CrossOriginError) return NextResponse.json({ error: "invalid" }, { status: 403 });
    throw err;
  }

  const limit = rateLimit(await clientKey("reset"), 10, 900);
  if (!limit.allowed) {
    return NextResponse.redirect(new URL("/reset-password?error=throttled", config.appUrl), { status: 303 });
  }

  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (password !== confirm) {
    return NextResponse.redirect(
      new URL(`/reset-password?token=${encodeURIComponent(token)}&error=mismatch`, config.appUrl),
      { status: 303 },
    );
  }

  const outcome = await completePasswordReset(token, password);
  const target = outcome.ok
    ? "/login?reset=1"
    : `/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(outcome.message)}`;

  return NextResponse.redirect(new URL(target, config.appUrl), { status: 303 });
}
