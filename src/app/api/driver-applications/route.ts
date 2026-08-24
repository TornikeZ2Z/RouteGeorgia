import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { assertSameOrigin, rateLimit, clientKey, CrossOriginError, seeOther } from "@/lib/security";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n";
import {
  ApplicationSchema, APPLICATION_LANGUAGES, APPLICATION_LEVELS,
  submitDriverApplication,
  type ApplicationError, type ApplicationLanguage,
} from "@/lib/driver-application";

/**
 * Driver applications from the public form.
 *
 * A plain form POST rather than a server action, so the page works on a phone
 * with JavaScript blocked or still loading. No files travel with it — the
 * driver uploads documents later from their own portal. The answer comes back
 * as a redirect carrying error CODES only — never the applicant's data. See
 * src/lib/driver-application.ts.
 */
const AMENITIES = ["air_conditioning", "wifi", "pets_allowed", "child_seat"] as const;
const CAPABILITIES = ["four_wheel_drive", "winter_tyres", "wheelchair_access"] as const;

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
  } catch (err) {
    if (err instanceof CrossOriginError) return NextResponse.json({ error: "invalid" }, { status: 403 });
    throw err;
  }

  const form = await request.formData();
  const locale = (() => {
    const value = String(form.get("locale") ?? "");
    return isLocale(value) ? value : DEFAULT_LOCALE;
  })();

  const back = (query: string, extra?: Record<string, string>) =>
    seeOther(`/${locale}/drive?${query}#apply`, extra);
  const fail = (codes: ApplicationError[], extra?: Record<string, string>) =>
    back(`error=${[...new Set(codes)].join(",")}`, extra);

  // Three applications an hour from one address. A driver who mistypes their
  // email and starts again is well within it; a script is not.
  const limit = rateLimit(await clientKey("driver-application"), 3, 3600);
  if (!limit.allowed) {
    return fail(["THROTTLED"], { "Retry-After": String(limit.retryAfterSeconds) });
  }

  const parsed = ApplicationSchema.safeParse(Object.fromEntries(
    [...form.entries()].filter(([, value]) => typeof value === "string"),
  ));
  if (!parsed.success) return fail(["INVALID"]);

  // Honeypot. Answer exactly as a success would, so a bot learns nothing.
  if (parsed.data.website) return back("sent=1");

  const languages: ApplicationLanguage[] = form.getAll("language")
    .map(String)
    .filter((code): code is ApplicationLanguage["language"] =>
      (APPLICATION_LANGUAGES as readonly string[]).includes(code))
    .map((language) => {
      const declared = String(form.get(`level_${language}`) ?? "CONVERSATIONAL");
      const level = (APPLICATION_LEVELS as readonly string[]).includes(declared)
        ? (declared as ApplicationLanguage["level"])
        : "CONVERSATIONAL";
      return { language, level };
    });

  const flags = (names: readonly string[]) =>
    Object.fromEntries(names.map((name) => [name, form.get(name) === "on"]));

  const h = await headers();
  const result = await submitDriverApplication(parsed.data, {
    amenities: flags(AMENITIES),
    capabilities: flags(CAPABILITIES),
    languages,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  });

  return result.ok ? back("sent=1") : fail(result.errors);
}
