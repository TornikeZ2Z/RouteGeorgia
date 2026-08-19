import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "@db/client";
import { assertSameOrigin, rateLimit, clientKey, CrossOriginError } from "@/lib/security";

/**
 * Business, school and hourly-hire inquiries.
 *
 * These are leads, not bookings: no price, no driver, no calendar. They land
 * as support tickets so operations works them from the same queue as
 * everything else, with the contact details in the first note. A plain form
 * POST, so the pages work without JavaScript.
 */
const Schema = z.object({
  kind: z.enum(["business", "school", "hourly"]),
  locale: z.enum(["en", "ka", "ru"]).default("en"),
  returnTo: z.string().regex(/^\/[a-z]{2}\/[a-z-]+$/, "invalid return path"),
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().max(160).optional(),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(6).max(40),
  passengers: z.string().trim().max(20).optional(),
  city: z.string().trim().max(120).optional(),
  start: z.string().trim().max(40).optional(),
  hours: z.string().trim().max(20).optional(),
  message: z.string().trim().min(5).max(2000),
  /** Honeypot: real people never fill a field they cannot see. */
  website: z.string().max(0).optional(),
});

const CATEGORY = { business: "BUSINESS_INQUIRY", school: "SCHOOL_INQUIRY", hourly: "HOURLY_INQUIRY" } as const;

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin();
  } catch (err) {
    if (err instanceof CrossOriginError) return NextResponse.json({ error: "invalid" }, { status: 403 });
    throw err;
  }

  const limit = rateLimit(await clientKey("inquiry"), 5, 3600);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many inquiries. Please try again later." }, {
      status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const form = await request.formData();
  const parsed = Schema.safeParse(Object.fromEntries(form));
  const vehicleTypes = form.getAll("vehicleType").map(String).filter(Boolean);
  const packages = form.getAll("package").map(String).filter(Boolean);
  const origin = new URL(request.url).origin;

  if (!parsed.success) {
    const returnTo = String(form.get("returnTo") ?? "/en");
    const safe = /^\/[a-z]{2}\/[a-z-]+$/.test(returnTo) ? returnTo : "/en";
    return NextResponse.redirect(`${origin}${safe}?error=1#inquiry`, 303);
  }
  const d = parsed.data;

  const subject = `${d.kind === "business" ? "Business" : d.kind === "school" ? "School" : "Hourly hire"} inquiry — ${d.company || d.name}`;
  const detailLines = [
    `Name:    ${d.name}`,
    d.company ? `Company: ${d.company}` : null,
    `Email:   ${d.email}`,
    `Phone:   ${d.phone}`,
    d.city ? `City:    ${d.city}` : null,
    d.start ? `Start:   ${d.start}` : null,
    d.hours ? `Hours:   ${d.hours}` : null,
    d.passengers ? `Passengers: ${d.passengers}` : null,
    vehicleTypes.length ? `Vehicles: ${vehicleTypes.join(", ")}` : null,
    packages.length ? `Add-ons: ${packages.join(", ")}` : null,
    `Locale:  ${d.locale}`,
    "",
    d.message,
  ].filter((l): l is string => l !== null);

  await sql.begin(async (tx) => {
    const [ticket] = await tx<{ id: string }[]>`
      INSERT INTO support_tickets (subject, category, severity)
      VALUES (${subject}, ${CATEGORY[d.kind]}, 'SEV3')
      RETURNING id`;
    await tx`
      INSERT INTO support_notes (ticket_id, body)
      VALUES (${ticket!.id}::uuid, ${detailLines.join("\n")})`;
  });

  return NextResponse.redirect(`${origin}${d.returnTo}?sent=1#inquiry`, 303);
}
