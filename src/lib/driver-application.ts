import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { sql } from "@db/client";
import { config } from "@/lib/config";
import { writeAudit } from "@/lib/audit";
import * as notify from "@/lib/notifications";
import {
  getStorage, hashDocumentNumber, assertUploadAllowed, UploadRejectedError,
  type Bucket,
} from "@/lib/storage";

/**
 * Public driver applications.
 *
 * A prospective driver fills one form and becomes a real, reviewable file in
 * the system: an account they can sign into, a profile in the verification
 * queue, a vehicle, and their KYC documents in restricted storage.
 *
 * Three rules this module exists to keep:
 *
 *   1. An application grants NOTHING. The profile lands as SUBMITTED, the
 *      vehicle as SUBMITTED, every document as PENDING, and the account gets
 *      DRIVER_APPLICANT — which carries a single permission, to edit their own
 *      application. Publication is still a separate, staffed decision.
 *   2. Nobody can learn from this form whether an email address is already
 *      registered. A duplicate produces the same page, the same wording and
 *      the same timing as a first application; operations gets told instead.
 *   3. Files are written to storage before the database transaction opens,
 *      and deleted again if the transaction fails. A half-application with
 *      orphaned identity documents in a KYC bucket is the worst outcome here.
 */

/** Codes the search filters already know how to label. */
export const APPLICATION_LANGUAGES = [
  "ka", "en", "ru", "tr", "hy", "az", "de", "fr", "ar", "he",
] as const;

export const APPLICATION_LEVELS = ["BASIC", "CONVERSATIONAL", "FLUENT", "NATIVE"] as const;

export const APPLICATION_CLASSES = [
  "ECONOMY", "COMFORT", "MINIVAN", "SUV_4X4", "MINIBUS", "PREMIUM",
] as const;

/**
 * What we ask for, and what a reviewer cannot work without.
 *
 * Identity and licence are required: there is no assessing a driver without
 * them. Registration and insurance are accepted here but not demanded — a
 * driver filling this in on a phone at the roadside often has two of the four
 * to hand, and losing the application entirely is worse than chasing the rest
 * by email. Operations sees exactly which are outstanding.
 */
export const DOCUMENT_SLOTS = [
  { field: "identityFile", type: "IDENTITY", required: true, expiry: false },
  { field: "licenceFile", type: "DRIVING_LICENSE", required: true, expiry: true },
  { field: "registrationFile", type: "VEHICLE_REGISTRATION", required: false, expiry: false },
  { field: "insuranceFile", type: "INSURANCE", required: false, expiry: true },
] as const;

const trimmed = (max: number) => z.string().trim().max(max);

export const ApplicationSchema = z.object({
  locale: z.enum(["en", "ka", "ru"]).default("en"),

  legalFirstName: trimmed(80).min(2),
  legalLastName: trimmed(80).min(2),
  publicName: trimmed(80).min(2),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth."),
  email: trimmed(200).email(),
  phone: trimmed(40).min(6),
  baseLocationId: z.string().uuid().optional().or(z.literal("")),
  experienceYears: z.coerce.number().int().min(0).max(70),
  bio: trimmed(1200).optional(),
  emergencyContact: trimmed(80).optional(),
  referralSource: trimmed(120).optional(),

  make: trimmed(40).min(1),
  model: trimmed(40).min(1),
  year: z.coerce.number().int().min(1990).max(new Date().getFullYear() + 1),
  color: trimmed(30).optional(),
  plate: trimmed(20).min(2),
  vehicleClass: z.enum(APPLICATION_CLASSES),
  seats: z.coerce.number().int().min(1).max(60),
  luggage: z.coerce.number().int().min(0).max(60),

  licenceNumber: trimmed(60).optional(),
  licenceExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the licence expiry date."),
  insuranceExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),

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

export interface ApplicationFiles {
  /** Keyed by the DOCUMENT_SLOTS field name. */
  [field: string]: File | undefined;
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
  "INVALID", "AGE", "DOB", "EXPERIENCE", "LICENCE_EXPIRED", "INSURANCE_EXPIRED",
  "INSURANCE_FILE", "INSURANCE_EXPIRY", "NO_LANGUAGE", "IDENTITY_FILE",
  "LICENCE_FILE", "FILE_REJECTED", "PLATE_TAKEN", "THROTTLED",
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
  files: ApplicationFiles,
  languages: ApplicationLanguage[],
): ApplicationError[] {
  const errors: ApplicationError[] = [];

  const age = yearsSince(input.dateOfBirth);
  if (Number.isNaN(age) || age < MIN_AGE_YEARS) errors.push("AGE");
  else if (age > 90) errors.push("DOB");
  else if (input.experienceYears > age - 17) errors.push("EXPERIENCE");

  if (input.licenceExpiresOn <= today()) errors.push("LICENCE_EXPIRED");
  if (input.insuranceExpiresOn && input.insuranceExpiresOn <= today()) errors.push("INSURANCE_EXPIRED");
  if (input.insuranceExpiresOn && !hasFile(files.insuranceFile)) errors.push("INSURANCE_FILE");
  if (hasFile(files.insuranceFile) && !input.insuranceExpiresOn) errors.push("INSURANCE_EXPIRY");

  if (languages.length === 0) errors.push("NO_LANGUAGE");

  for (const slot of DOCUMENT_SLOTS) {
    const file = files[slot.field];
    if (slot.required && !hasFile(file)) {
      errors.push(slot.type === "IDENTITY" ? "IDENTITY_FILE" : "LICENCE_FILE");
      continue;
    }
    if (!hasFile(file)) continue;
    try {
      assertUploadAllowed(file.type, file.size);
    } catch (err) {
      if (err instanceof UploadRejectedError) {
        if (!errors.includes("FILE_REJECTED")) errors.push("FILE_REJECTED");
      } else throw err;
    }
  }

  return errors;
}

const hasFile = (file: File | undefined): file is File => file instanceof File && file.size > 0;

interface StagedDocument {
  type: string;
  key: string;
  checksum: string;
  sizeBytes: number;
  mimeType: string;
  expiresOn: string | null;
  numberHash: string | null;
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
  files: ApplicationFiles,
  context: ApplicationContext,
): Promise<ApplicationResult> {
  const errors = validateApplication(input, files, context.languages);
  if (errors.length) return { ok: false, errors };

  const existing = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE email_normalized = lower(${input.email})`;

  if (existing.length > 0) {
    // Never say so. Operations gets a ticket with the details; if it is the
    // same person applying twice they hear back from a human either way.
    await fileDuplicateNotice(input);
    return { ok: true };
  }

  // Storage first: object stores are not transactional, so the failure we can
  // actually recover from is "files written, database rejected".
  const staged: StagedDocument[] = [];
  const storage = getStorage();

  try {
    for (const slot of DOCUMENT_SLOTS) {
      const file = files[slot.field];
      if (!hasFile(file)) continue;
      const buffer = Buffer.from(await file.arrayBuffer());
      assertUploadAllowed(file.type, buffer.byteLength);
      const stored = await storage.put("restricted-kyc" satisfies Bucket, buffer, file.type);
      staged.push({
        type: slot.type,
        key: stored.key,
        checksum: stored.checksum,
        sizeBytes: stored.sizeBytes,
        mimeType: stored.mimeType,
        expiresOn:
          slot.type === "DRIVING_LICENSE" ? input.licenceExpiresOn
          : slot.type === "INSURANCE" ? (input.insuranceExpiresOn || null)
          : null,
        numberHash:
          slot.type === "DRIVING_LICENSE" && input.licenceNumber
            ? hashDocumentNumber(input.licenceNumber)
            : null,
      });
    }
  } catch (err) {
    await Promise.all(staged.map((d) => storage.remove(d.key).catch(() => {})));
    if (err instanceof UploadRejectedError) return { ok: false, errors: ["FILE_REJECTED"] };
    throw err;
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

      const [driver] = await tx<{ id: string }[]>`
        INSERT INTO driver_profiles
          (user_id, handle, public_name, legal_first_name, legal_last_name, date_of_birth,
           base_location_id, bio, emergency_contact, status, submitted_at,
           applied_via, experience_years, referral_source)
        VALUES (${userId}::uuid,
                ${slugify(input.publicName)} || '-' || substr(md5(random()::text), 1, 4),
                ${input.publicName}, ${input.legalFirstName}, ${input.legalLastName},
                ${input.dateOfBirth}::date, ${input.baseLocationId || null}::uuid,
                ${input.bio || null}, ${input.emergencyContact || null},
                'SUBMITTED', now(), 'public_form', ${input.experienceYears},
                ${input.referralSource || null})
        RETURNING id`;
      driverId = driver!.id;

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
                ${input.color || null}, ${input.plate.toUpperCase()}, ${input.vehicleClass}::vehicle_class,
                ${input.seats}, ${input.luggage},
                ${JSON.stringify(context.amenities)}::text::jsonb,
                ${JSON.stringify(context.capabilities)}::text::jsonb,
                'SUBMITTED')
        RETURNING id`;

      for (const doc of staged) {
        const attachToVehicle = doc.type === "VEHICLE_REGISTRATION" || doc.type === "INSURANCE";
        await tx`
          INSERT INTO driver_documents
            (driver_id, vehicle_id, type, storage_key, number_hash, mime_type, size_bytes,
             checksum, expires_on, is_mandatory, state)
          VALUES (${driverId}::uuid, ${attachToVehicle ? vehicle!.id : null}::uuid,
                  ${doc.type}::doc_type, ${doc.key}, ${doc.numberHash}, ${doc.mimeType},
                  ${doc.sizeBytes}, ${doc.checksum}, ${doc.expiresOn}::date, true, 'PENDING')`;
      }

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

      const outstanding = DOCUMENT_SLOTS
        .filter((s) => !staged.some((d) => d.type === s.type))
        .map((s) => s.type);

      const [ticket] = await tx<{ id: string }[]>`
        INSERT INTO support_tickets (driver_id, subject, category, severity)
        VALUES (${driverId}::uuid,
                ${`Driver application — ${input.publicName}`},
                'DRIVER_APPLICATION', 'SEV3')
        RETURNING id`;
      await tx`
        INSERT INTO support_notes (ticket_id, body)
        VALUES (${ticket!.id}::uuid, ${[
          `Applied through the public form.`,
          ``,
          `Name:       ${input.legalFirstName} ${input.legalLastName} (shown as ${input.publicName})`,
          `Email:      ${input.email}`,
          `Phone:      ${input.phone}`,
          `Experience: ${input.experienceYears} year(s)`,
          `Languages:  ${context.languages.map((l) => `${l.language}:${l.level}`).join(", ")}`,
          `Vehicle:    ${input.year} ${input.make} ${input.model} — ${input.plate.toUpperCase()} (${input.vehicleClass})`,
          `Documents:  ${staged.map((d) => d.type).join(", ") || "none"}`,
          outstanding.length ? `Outstanding: ${outstanding.join(", ")}` : `Outstanding: none`,
          input.referralSource ? `Heard about us: ${input.referralSource}` : null,
          ``,
          `Review at ${config.appUrl}/admin/drivers/${driverId}`,
        ].filter((line): line is string => line !== null).join("\n")})`;

      notificationId = await notify.queue(tx, {
        kind: "message.received",
        to: input.email,
        locale: input.locale,
        subject: applicantEmail(input.locale, inviteToken, outstanding.length).subject,
        body: applicantEmail(input.locale, inviteToken, outstanding.length).body,
        dedupe: `driver_application:${driverId}`,
      });
    });
  } catch (err) {
    await Promise.all(staged.map((d) => storage.remove(d.key).catch(() => {})));
    if (String(err).includes("vehicles_plate_uq")) return { ok: false, errors: ["PLATE_TAKEN"] };
    throw err;
  }

  // storage keys and document numbers are deliberately absent from the audit
  // payload: the log is read far more widely than the KYC bucket.
  await writeAudit({
    action: "driver.application_received",
    objectType: "driver_profile",
    objectId: driverId,
    after: {
      publicName: input.publicName,
      email: input.email,
      appliedVia: "public_form",
      documents: staged.map((d) => d.type),
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

function slugify(name: string): string {
  return (
    name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "driver"
  );
}

/** Applicant confirmation, in the language they filled the form in. */
function applicantEmail(locale: string, token: string, outstanding: number) {
  const link = `${config.appUrl}/reset-password?token=${token}`;
  const M = {
    en: {
      subject: "We have your Route Georgia driver application",
      lines: [
        "Thank you — your application is with our operations team.",
        "",
        "Set your password to finish your file and follow its progress:",
        link,
        `The link works once and expires in ${INVITE_TTL_DAYS} days.`,
        "",
        outstanding > 0
          ? "Some documents are still missing. Sign in and add them — we cannot approve an incomplete file."
          : "We have all four documents. Nothing else is needed from you right now.",
        "",
        "What happens next: we check your documents, then call you for a short language and route interview.",
        "Most applications are answered within three working days.",
      ],
    },
    ka: {
      subject: "თქვენი განაცხადი მიღებულია — Route Georgia",
      lines: [
        "გმადლობთ — თქვენი განაცხადი ჩვენს ოპერაციების გუნდთანაა.",
        "",
        "დააყენეთ პაროლი, რომ დაასრულოთ განაცხადი და თვალი ადევნოთ მის მიმდინარეობას:",
        link,
        `ბმული ერთხელ მუშაობს და ${INVITE_TTL_DAYS} დღეში იწურება.`,
        "",
        outstanding > 0
          ? "რამდენიმე დოკუმენტი ჯერ არ არის ატვირთული. შედით სისტემაში და დაამატეთ — არასრულ განაცხადს ვერ დავამტკიცებთ."
          : "ოთხივე დოკუმენტი მიღებულია. ამჟამად სხვა არაფერია საჭირო.",
        "",
        "შემდეგი ნაბიჯი: შევამოწმებთ დოკუმენტებს, შემდეგ დაგირეკავთ ენისა და მარშრუტების მოკლე გასაუბრებისთვის.",
        "განაცხადებს ჩვეულებრივ სამ სამუშაო დღეში ვპასუხობთ.",
      ],
    },
    ru: {
      subject: "Мы получили вашу заявку водителя — Route Georgia",
      lines: [
        "Спасибо — ваша заявка у нашей операционной команды.",
        "",
        "Задайте пароль, чтобы завершить заявку и следить за её статусом:",
        link,
        `Ссылка работает один раз и истекает через ${INVITE_TTL_DAYS} дней.`,
        "",
        outstanding > 0
          ? "Некоторых документов ещё нет. Войдите и добавьте их — неполную заявку мы одобрить не можем."
          : "Все четыре документа получены. Больше от вас пока ничего не нужно.",
        "",
        "Что дальше: мы проверим документы, затем позвоним для короткого собеседования о языках и маршрутах.",
        "Обычно мы отвечаем в течение трёх рабочих дней.",
      ],
    },
  } as const;

  const m = M[(locale === "ka" || locale === "ru" ? locale : "en") as keyof typeof M];
  return { subject: m.subject, body: m.lines.join("\n") };
}
