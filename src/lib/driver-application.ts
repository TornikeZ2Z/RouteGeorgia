import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { sql } from "@db/client";
import { config } from "@/lib/config";
import { writeAudit } from "@/lib/audit";
import * as notify from "@/lib/notifications";

/**
 * Public driver applications.
 *
 * A prospective driver fills one form and becomes a real, reviewable file in
 * thesystem: an account they can sign into, a profile in the verification
 * queue, and a vehicle.
 *
 * Three rules this module exists to keep:
 *
 *   1. An application grants NOTHING. The profile lands as SUBMITTED, the
 *      vehicle as SUBMITTED, and the account gets DRIVER_APPLICANT — which
 *      carries a single permission, to edit their own application.
 *      Publication is still a separate, staffed decision.
 *   2. Nobody can learn from this form whether an email address is already
 *      registered. A duplicate produces the same page, the same wording and
 *      the same timing as a first application; operations gets told instead.
 *   3. The form asks for NOTHING that needs a document to hand. Identity,
 *      licence and registration are uploaded later from the driver's own
 *      page — asking a driver on a phone to photograph papers mid-form was
 *      where applications died. The publish gate still requires approved
 *      identity and licence before anyone goes live; only the moment moves.
 */

/**
 * Languages the form asks about.
 *
 * Every driver on this platform is Georgian, so Georgian is recorded as
 * native without asking — the same assumption the seed makes. What actually
 * changes which work a driver is offered is whether they can talk to an
 * English- or Russian-speaking traveller, so those are the only two questions
 * worth a checkbox. Anything else a driver speaks is added later, from their
 * own profile page, where it does not slow down an application.
 */
export const APPLICATION_LANGUAGES = ["en", "ru"] as const;

/** Recorded for every applicant without being asked. */
export const ASSUMED_LANGUAGE = { language: "ka", level: "NATIVE" } as const;

export const APPLICATION_LEVELS = ["BASIC", "CONVERSATIONAL", "FLUENT", "NATIVE"] as const;

export const APPLICATION_CLASSES = [
  "ECONOMY", "COMFORT", "MINIVAN", "SUV_4X4", "MINIBUS", "PREMIUM",
] as const;

const trimmed = (max: number) => z.string().trim().max(max);

export const ApplicationSchema = z.object({
  locale: z.enum(["en", "ka", "ru"]).default("en"),

  legalFirstName: trimmed(80).min(2),
  legalLastName: trimmed(80).min(2),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth."),
  email: trimmed(200).email(),
  phone: trimmed(40).min(6),
  baseLocationId: z.string().uuid().optional().or(z.literal("")),
  experienceYears: z.coerce.number().int().min(0).max(70),
  referralSource: trimmed(120).optional(),

  make: trimmed(40).min(1),
  model: trimmed(40).min(1),
  year: z.coerce.number().int().min(1990).max(new Date().getFullYear() + 1),
  color: trimmed(30).optional(),
  plate: trimmed(20).min(2),
  seats: z.coerce.number().int().min(1).max(60),
  luggage: z.coerce.number().int().min(0).max(60),

  /** Unticked consent is a failed submission, never a silent default. */
  consent: z.literal("on", { message: "Please confirm you accept the terms and the data notice." }),
  /**
   * Honeypot: a real applicant never fills a field they cannot see. Accepted
   * by the schema on purpose — the caller checks it and answers with the same
   * thank-you page a genuine submission gets, so a bot learns nothing from
   * the difference between a rejection and a success.
   */
  website: z.string().max(200).optional(),
});

export type ApplicationInput = z.infer<typeof ApplicationSchema>;

export interface ApplicationLanguage {
  language: (typeof APPLICATION_LANGUAGES)[number];
  level: (typeof APPLICATION_LEVELS)[number];
}

export interface ApplicationContext {
  amenities: Record<string, boolean>;
  capabilities: Record<string, boolean>;
  languages: ApplicationLanguage[];
  ip: string | null;
  userAgent: string | null;
}

/**
 * Failures are codes, not sentences.
 *
 * The form posts as a plain HTML form and the answer comes back through a
 * redirect, so anything the caller returns ends up in a URL. Codes keep the
 * applicant's name, email and licence details out of browser history, server
 * logs and referer headers, and they get translated on the page instead of
 * being written once in English.
 */
export const APPLICATION_ERRORS = [
  "INVALID", "AGE", "DOB", "EXPERIENCE", "PLATE_TAKEN", "THROTTLED",
] as const;

export type ApplicationError = (typeof APPLICATION_ERRORS)[number];

export const isApplicationError = (value: string): value is ApplicationError =>
  (APPLICATION_ERRORS as readonly string[]).includes(value);

export type ApplicationResult =
  | { ok: true }
  | { ok: false; errors: ApplicationError[] };

/** Age is a licensing question, not a preference. */
const MIN_AGE_YEARS = 21;
const INVITE_TTL_DAYS = 14;

const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");

function yearsSince(isoDate: string): number {
  const born = new Date(`${isoDate}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - born.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < born.getUTCDate())) age--;
  return age;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Checks that depend on more than one field, kept out of the zod schema so
 * they read as the business rules they are.
 */
export function validateApplication(
  input: ApplicationInput,
  languages: ApplicationLanguage[],
): ApplicationError[] {
  const errors: ApplicationError[] = [];

  const age = yearsSince(input.dateOfBirth);
  if (Number.isNaN(age) || age < MIN_AGE_YEARS) errors.push("AGE");
  else if (age > 90) errors.push("DOB");
  else if (input.experienceYears > age - 17) errors.push("EXPERIENCE");

  // No language check: Georgian is recorded for every applicant, so a driver
  // who speaks neither English nor Russian is a normal applicant, not an
  // incomplete one.
  void languages;

  return errors;
}

/**
 * Create everything a submitted application consists of.
 *
 * Returns `{ ok: true }` for a genuine new application AND for a repeat
 * submission from an address that already has an account — see rule 2 above.
 * Validation failures are the only thing a caller can distinguish.
 */
export async function submitDriverApplication(
  input: ApplicationInput,
  context: ApplicationContext,
): Promise<ApplicationResult> {
  const errors = validateApplication(input, context.languages);
  if (errors.length) return { ok: false, errors };

  const existing = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE email_normalized = lower(${input.email})`;

  if (existing.length > 0) {
    // Never say so. Operations gets a ticket with the details; if it is the
    // same person applying twice they hear back from a human either way.
    await fileDuplicateNotice(input);
    return { ok: true };
  }

  const inviteToken = randomBytes(32).toString("base64url");
  let driverId = "";
  let notificationId: string | null = null;

  try {
    await sql.begin(async (tx) => {
      const [user] = await tx<{ id: string }[]>`
        INSERT INTO users (email, phone, locale, status)
        VALUES (${input.email}, ${input.phone}, ${input.locale}, 'ACTIVE')
        RETURNING id`;
      const userId = user!.id;

      // No password is set here. Until they follow the emailed link and
      // choose one, password_hash is NULL and sign-in refuses the account.
      await tx`
        INSERT INTO login_tokens (user_id, purpose, token_hash, expires_at)
        VALUES (${userId}::uuid, 'password_reset', ${hashToken(inviteToken)},
                now() + (${INVITE_TTL_DAYS} || ' days')::interval)`;

      await tx`
        INSERT INTO user_roles (user_id, role)
        VALUES (${userId}::uuid, 'DRIVER_APPLICANT')`;

      const publicName = displayName(input.legalFirstName, input.legalLastName);

      const [driver] = await tx<{ id: string }[]>`
        INSERT INTO driver_profiles
          (user_id, handle, public_name, legal_first_name, legal_last_name, date_of_birth,
           base_location_id, status, submitted_at,
           applied_via, experience_years, referral_source)
        VALUES (${userId}::uuid,
                ${slugify(publicName)} || '-' || substr(md5(random()::text), 1, 4),
                ${publicName}, ${input.legalFirstName}, ${input.legalLastName},
                ${input.dateOfBirth}::date, ${input.baseLocationId || null}::uuid,
                'SUBMITTED', now(), 'public_form', ${input.experienceYears},
                ${input.referralSource || null})
        RETURNING id`;
      driverId = driver!.id;

      // Georgian first, then anything they ticked.
      await tx`
        INSERT INTO driver_languages (driver_id, language, declared_level)
        VALUES (${driverId}::uuid, ${ASSUMED_LANGUAGE.language}, ${ASSUMED_LANGUAGE.level}::proficiency)
        ON CONFLICT DO NOTHING`;

      for (const lang of context.languages) {
        // declared_level only. A verified level comes from an interview and
        // can never originate in something the applicant filled in.
        await tx`
          INSERT INTO driver_languages (driver_id, language, declared_level)
          VALUES (${driverId}::uuid, ${lang.language}, ${lang.level}::proficiency)
          ON CONFLICT DO NOTHING`;
      }

      const [vehicle] = await tx<{ id: string }[]>`
        INSERT INTO vehicles (driver_id, make, model, year, color, plate, class, seats, luggage,
                              amenities, capabilities, status)
        VALUES (${driverId}::uuid, ${input.make}, ${input.model}, ${input.year},
                ${input.color || null}, ${input.plate.toUpperCase()},
                ${inferVehicleClass(input.seats, context.capabilities)}::vehicle_class,
                ${input.seats}, ${input.luggage},
                ${JSON.stringify(context.amenities)}::text::jsonb,
                ${JSON.stringify(context.capabilities)}::text::jsonb,
                'SUBMITTED')
        RETURNING id`;
      void vehicle;

      await tx`
        INSERT INTO driver_wallets (driver_id, credit_limit_minor)
        VALUES (${driverId}::uuid, 20000) ON CONFLICT DO NOTHING`;

      // What they were shown and agreed to, with the evidence a data-protection
      // question would ask for.
      await tx`
        INSERT INTO consents (user_id, kind, policy_version, locale, accepted, evidence)
        VALUES (${userId}::uuid, 'driver_application', ${config.policy.version}, ${input.locale}, true,
                ${JSON.stringify({
                  source: "public_form",
                  ip: context.ip,
                  userAgent: context.userAgent?.slice(0, 400) ?? null,
                })}::text::jsonb)`;

      const [ticket] = await tx<{ id: string }[]>`
        INSERT INTO support_tickets (driver_id, subject, category, severity)
        VALUES (${driverId}::uuid,
                ${`Driver application — ${displayName(input.legalFirstName, input.legalLastName)}`},
                'DRIVER_APPLICATION', 'SEV3')
        RETURNING id`;
      await tx`
        INSERT INTO support_notes (ticket_id, body)
        VALUES (${ticket!.id}::uuid, ${[
          `Applied through the public form.`,
          ``,
          `Name:       ${input.legalFirstName} ${input.legalLastName} (shown as ${displayName(input.legalFirstName, input.legalLastName)})`,
          `Email:      ${input.email}`,
          `Phone:      ${input.phone}`,
          `Experience: ${input.experienceYears} year(s)`,
          `Languages:  ${context.languages.map((l) => `${l.language}:${l.level}`).join(", ")}`,
          `Vehicle:    ${input.year} ${input.make} ${input.model} — ${input.plate.toUpperCase()}`,
          `Class:      ${inferVehicleClass(input.seats, context.capabilities)} (inferred from seats and 4x4 — confirm on inspection)`,
          `Documents:  none yet — the driver uploads them from their portal after setting a password`,
          input.referralSource ? `Heard about us: ${input.referralSource}` : null,
          ``,
          `Review at ${config.appUrl}/admin/drivers/${driverId}`,
        ].filter((line): line is string => line !== null).join("\n")})`;

      notificationId = await notify.queue(tx, {
        kind: "message.received",
        to: input.email,
        locale: input.locale,
        subject: applicantEmail(input.locale, inviteToken).subject,
        body: applicantEmail(input.locale, inviteToken).body,
        dedupe: `driver_application:${driverId}`,
      });
    });
  } catch (err) {
    if (String(err).includes("vehicles_plate_uq")) return { ok: false, errors: ["PLATE_TAKEN"] };
    throw err;
  }

  await writeAudit({
    action: "driver.application_received",
    objectType: "driver_profile",
    objectId: driverId,
    after: {
      publicName: displayName(input.legalFirstName, input.legalLastName),
      email: input.email,
      appliedVia: "public_form",
      languages: context.languages.map((l) => l.language),
    },
    reason: "public application form",
  });

  /**
   * Send the queued confirmation now rather than waiting for a worker.
   *
   * The outbox row is committed with the application, so nothing is lost if
   * this fails — it is retried on the next dispatch. But the applicant's
   * set-password link is in that message, and it is the only route back into
   * their own file: a queue that nobody drains means a driver who applied and
   * then heard nothing.
   */
  if (notificationId) await notify.dispatchPending(1, [notificationId]).catch(() => {});

  return { ok: true };
}

/**
 * A second application from an address that already has an account. The
 * applicant sees the ordinary thank-you page; operations gets this.
 */
async function fileDuplicateNotice(input: ApplicationInput): Promise<void> {
  await sql.begin(async (tx) => {
    const [ticket] = await tx<{ id: string }[]>`
      INSERT INTO support_tickets (subject, category, severity)
      VALUES (${`Repeat driver application — ${input.email}`}, 'DRIVER_APPLICATION', 'SEV4')
      RETURNING id`;
    await tx`
      INSERT INTO support_notes (ticket_id, body)
      VALUES (${ticket!.id}::uuid, ${[
        `Somebody submitted the driver application form for an address that already has an account.`,
        `Nothing was created. Check whether they are stuck at sign-in, or whether someone else is using their address.`,
        ``,
        `Email: ${input.email}`,
        `Phone: ${input.phone}`,
        `Name:  ${input.legalFirstName} ${input.legalLastName}`,
      ].join("\n")})`;
  });
}

/**
 * What travellers see. The form no longer asks for it: a driver typing their
 * own display name produced everything from a bare first name to a full legal
 * name with a patronymic, and the convention on this site is settled anyway.
 */
export function displayName(first: string, last: string): string {
  const initial = last.trim().charAt(0);
  if (!initial) return first.trim();
  // Georgian Mkhedruli has no capitals in ordinary writing: toUpperCase() maps
  // it to Mtavruli, which is the all-caps display form and reads as shouting
  // in the middle of a name. Latin and Cyrillic initials are capitalised as
  // usual.
  const mkhedruli = /[ა-ჿ]/.test(initial);
  return `${first.trim()} ${mkhedruli ? initial : initial.toUpperCase()}.`;
}

/**
 * Vehicle class, inferred rather than asked.
 *
 * Applicants guessed at this and guessed wrong, and it decides which price
 * band applies — so it is worth getting from facts they cannot mistake. Seats
 * and four-wheel drive give the right answer for almost every car on Georgian
 * roads; operations confirms it when the vehicle is inspected, which was
 * always the real check.
 */
export function inferVehicleClass(
  seats: number,
  capabilities: Record<string, boolean>,
): (typeof APPLICATION_CLASSES)[number] {
  if (seats >= 8) return "MINIBUS";
  if (capabilities.four_wheel_drive) return "SUV_4X4";
  if (seats >= 5) return "MINIVAN";
  return "COMFORT";
}

/**
 * Georgian Mkhedruli to Latin, for handles only.
 *
 * A driver's public URL is built from their name. Stripping non-Latin
 * characters turned every Georgian name into nothing, so the whole Georgian
 * supply would share indistinguishable handles like "driver-7c18" — bad for
 * search, and unhelpful for anyone reading a link. This is the standard
 * national transliteration, close enough for a slug.
 */
const MKHEDRULI_TO_LATIN: Record<string, string> = {
  ა: "a", ბ: "b", გ: "g", დ: "d", ე: "e", ვ: "v", ზ: "z", თ: "t", ი: "i",
  კ: "k", ლ: "l", მ: "m", ნ: "n", ო: "o", პ: "p", ჟ: "zh", რ: "r", ს: "s",
  ტ: "t", უ: "u", ფ: "p", ქ: "k", ღ: "gh", ყ: "q", შ: "sh", ჩ: "ch", ც: "ts",
  ძ: "dz", წ: "ts", ჭ: "ch", ხ: "kh", ჯ: "j", ჰ: "h",
};

export function transliterate(value: string): string {
  return [...value].map((ch) => MKHEDRULI_TO_LATIN[ch] ?? ch).join("");
}

function slugify(name: string): string {
  return (
    transliterate(name).toLowerCase().normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "driver"
  );
}

/** Applicant confirmation, in the language they filled the form in. */
function applicantEmail(locale: string, token: string) {
  const link = `${config.appUrl}/reset-password?token=${token}`;
  const M = {
    en: {
      subject: "One step left — set your Route Georgia password",
      lines: [
        "Thank you — your application is in.",
        "",
        "Set your password here:",
        link,
        `The link works once and expires in ${INVITE_TTL_DAYS} days.`,
        "",
        "Then, from your driver page, photograph and upload your ID and driving licence",
        "(and the vehicle registration when you have it to hand). We can only review a",
        "complete file, and nothing goes live before we have checked those documents.",
        "",
        "After that: a short call about languages and routes, and you are ready to work.",
        "Most applications are answered within three working days.",
      ],
    },
    ka: {
      subject: "დარჩა ერთი ნაბიჯი — დააყენეთ პაროლი Route Georgia-ზე",
      lines: [
        "გმადლობთ — თქვენი განაცხადი მიღებულია.",
        "",
        "დააყენეთ პაროლი აქ:",
        link,
        `ბმული ერთხელ მუშაობს და ${INVITE_TTL_DAYS} დღეში იწურება.`,
        "",
        "შემდეგ, თქვენი მძღოლის გვერდიდან, გადაუღეთ ფოტო და ატვირთეთ პირადობის მოწმობა",
        "და მართვის მოწმობა (ავტომობილის რეგისტრაციაც, როცა ხელთ გექნებათ). განვიხილავთ",
        "მხოლოდ სრულ განაცხადს და ამ დოკუმენტების შემოწმებამდე პროფილი არ გამოქვეყნდება.",
        "",
        "ამის შემდეგ: მოკლე ზარი ენებსა და მარშრუტებზე — და მზად ხართ სამუშაოდ.",
        "განაცხადებს ჩვეულებრივ სამ სამუშაო დღეში ვპასუხობთ.",
      ],
    },
    ru: {
      subject: "Остался один шаг — задайте пароль Route Georgia",
      lines: [
        "Спасибо — ваша заявка принята.",
        "",
        "Задайте пароль здесь:",
        link,
        `Ссылка работает один раз и истекает через ${INVITE_TTL_DAYS} дней.`,
        "",
        "Затем со своей страницы водителя сфотографируйте и загрузите удостоверение",
        "личности и водительские права (и регистрацию автомобиля, когда она будет под",
        "рукой). Мы рассматриваем только полную заявку, и профиль не публикуется до",
        "проверки этих документов.",
        "",
        "Дальше: короткий звонок о языках и маршрутах — и вы готовы к работе.",
        "Обычно мы отвечаем в течение трёх рабочих дней.",
      ],
    },
  } as const;

  const m = M[(locale === "ka" || locale === "ru" ? locale : "en") as keyof typeof M];
  return { subject: m.subject, body: m.lines.join("\n") };
}
