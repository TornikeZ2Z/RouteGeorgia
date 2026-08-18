import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { isDisplayCurrency } from "@/lib/currency";
import { isLocale } from "@/lib/i18n";
import { config } from "@/lib/config";

/**
 * Locale and currency switches. A plain form POST so they work without
 * JavaScript, and a redirect back to wherever the user was.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const jar = await cookies();

  const currency = String(form.get("currency") ?? "");
  if (isDisplayCurrency(currency)) {
    jar.set("gt_currency", currency, {
      path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, httpOnly: false,
    });
  }

  const raw = String(form.get("returnTo") ?? "/");
  // Only ever redirect to a path on this site.
  const safePath = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  const locale = String(form.get("locale") ?? "");
  const destination = isLocale(locale)
    ? safePath.replace(/^\/(en|ka|ru)(?=\/|$)/, `/${locale}`)
    : safePath;

  return NextResponse.redirect(new URL(destination, config.appUrl), { status: 303 });
}
