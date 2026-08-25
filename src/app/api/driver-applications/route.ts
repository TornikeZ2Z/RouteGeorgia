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

  // Errors land on the error itself; success has nothing to scroll to.
  const back = (query: string, extra?: Record<string, string>) =>
    seeOther(`/${locale}/drive?${query}`, extra);
  const backToError = (query: string, extra?: Record<string, string>) =>
    seeOther(`/${locale}/drive?${query}#apply-error`, extra);
  const fail = (codes: ApplicationError[], extra?: Record<string, string>) =>
    backToError(`error=${[...new Set(codes)].join(",")}`, extra);

  // Two limits, because the two things being limited are not the same.
  //
  // Georgian mobile networks put many subscribers behind one address, and a
  // recruiter signing drivers up from an office is one address too. The old
  // single limit of three per hour counted a mistyped date of birth the same
  // as a created account, so an honest applicant who slipped twice was locked
  // out for an hour and — worse — sent back to an empty form. That is what
  // stopped a real driver from joining.
  //
  // So attempts are cheap and generous, while the expensive, abusable thing —
  // actually creating a driver record — stays tight, and is only charged for
  // once a submission has passed validation.
  const attempts = rateLimit(await clientKey("driver-application-attempt"), 40, 3600);
  if (!attempts.allowed) {
    return fail(["THROTTLED"], { "Retry-After": String(attempts.retryAfterSeconds) });
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

  const creations = rateLimit(await clientKey("driver-application"), 10, 3600);
  if (!creations.allowed) {
    return fail(["THROTTLED"], { "Retry-After": String(creations.retryAfterSeconds) });
  }

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
