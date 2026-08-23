import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requestPasswordReset } from "@/lib/auth/reset";
import { dispatchPending } from "@/lib/notifications";
import { assertSameOrigin, rateLimit, clientKey, CrossOriginError, seeOther } from "@/lib/security";
import { config } from "@/lib/config";

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
  } catch (err) {
    if (err instanceof CrossOriginError) return NextResponse.json({ error: "invalid" }, { status: 403 });
    throw err;
  }

  const limit = rateLimit(await clientKey("forgot"), 5, 900);
  const form = await request.formData();
  const email = z.string().email().safeParse(form.get("email"));
  const locale = String(form.get("locale") ?? "en");

  // The response is identical whether the address exists, whether it was
  // throttled, or whether the send failed. Anything else lets a caller test
  // which addresses are registered.
  if (limit.allowed && email.success) {
    await requestPasswordReset(email.data, locale);
    await dispatchPending(5).catch(() => {});
  }

  return seeOther("/forgot-password?sent=1");
}
