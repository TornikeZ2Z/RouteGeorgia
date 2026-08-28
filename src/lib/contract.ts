import "server-only";
import { createHash } from "node:crypto";
import { sql } from "@db/client";
import { config } from "@/lib/config";
import { getSettings, settlementPeriodLabel } from "@/lib/settings";
import { writeAudit } from "@/lib/audit";

/**
 * The agreements, and signing them.
 *
 * Two counterparties now sign: partner drivers, and schools. They share this
 * module because the hard parts are identical — which text was on the screen,
 * proved by a hash of the resolved body; a signature that cannot be edited
 * afterwards; and a gate that refuses to let the relationship start until the
 * signature exists. Only the party details and the act of signing differ.
 *
 * Both agreements exist in Georgian and English. Georgian governs; a reader
 * whose console language is Russian is shown the English text, because signing
 * a translation that does not exist would be worse than reading one that does.
 */

export type PartyType = "DRIVER" | "SCHOOL";
export type ContractLocale = "en" | "ka";

/** The console renders in ka, en or ru; the agreements exist in two of those. */
export const contractLocale = (locale: string): ContractLocale =>
  (locale === "ka" ? "ka" : "en");

/**
 * The driver as the agreement names them. Every field appears in the opening
 * paragraph and again in the schedule of details, so a gap here is a gap in
 * the counterparty's own identification.
 */
export interface DriverParty {
  name: string;
  personalNumber: string | null;
  phone: string | null;
  address: string | null;
}

export interface SchoolParty {
  name: string;
  idNumber: string;
  director: string;
  address: string | null;
  phone: string | null;
}

/**
 * Rendered where a party detail is not known yet. The result reads as a blank
 * on a form rather than as leaked template syntax, which matters because the
 * admin console previews the agreement before any counterparty exists.
 */
const BLANK = "____________";

export interface ContractDocument {
  partyType: PartyType;
  version: string;
  locale: ContractLocale;
  title: string;
  /** Placeholders already resolved — this is the text the signatory reads. */
  body: string;
  /** SHA-256 of `body`, i.e. of what was actually on the screen. */
  bodyHash: string;
  effectiveFrom: Date;
  /** True when no party was supplied: a blank template, not a signable copy. */
  isTemplate: boolean;
}

export interface ContractSignature {
  contractVersion: string;
  locale: string;
  signedName: string;
  bodyHash: string;
  signedAt: Date;
}

/**
 * Missing entity details, if any.
 *
 * The commercial terms always resolve (settings have defaults), so only the
 * company's own identification can be outstanding.
 */
export function missingCompanyDetails(): string[] {
  const missing: string[] = [];
  if (!config.company.legalName.trim()) missing.push("COMPANY_LEGAL_NAME");
  if (!config.company.idNumber.trim()) missing.push("COMPANY_ID_NUMBER");
  if (!config.company.address.trim()) missing.push("COMPANY_ADDRESS");
  if (!config.company.director.trim()) missing.push("COMPANY_DIRECTOR");
  return missing;
}

export const companyDetailsComplete = (): boolean => missingCompanyDetails().length === 0;

/**
 * What the driver still has to tell us before they can sign.
 *
 * The personal number and registered address are not collected during the
 * application — they are only needed at the moment of contracting, and asking
 * for them earlier would be collecting identity data with no use for it yet.
 */
export function missingDriverDetails(party: DriverParty): string[] {
  const missing: string[] = [];
  if (!party.name.trim()) missing.push("DRIVER_NAME");
  if (!party.personalNumber?.trim()) missing.push("DRIVER_PERSONAL_NUMBER");
  if (!party.address?.trim()) missing.push("DRIVER_ADDRESS");
  return missing;
}

/**
 * Contract text is stored with placeholders so the entity, the commercial
 * terms and the counterparty can change without a deploy.
 *
 * The commercial values are read at render time rather than baked in: the text
 * someone reads always shows the terms actually in force, and the signature
 * records those terms in its evidence so a later change cannot rewrite what
 * was agreed.
 */
async function placeholders(
  locale: ContractLocale,
  party?: DriverParty | SchoolParty,
): Promise<Record<string, string>> {
  const s = await getSettings();
  const commissionPercent = s.commission_rate_bps / 100;

  const base: Record<string, string> = {
    COMPANY_LEGAL_NAME: config.company.legalName,
    COMPANY_ID_NUMBER: config.company.idNumber,
    COMPANY_ADDRESS: config.company.address,
    COMPANY_DIRECTOR: config.company.director,
    SUPPORT_EMAIL: config.contact.email,

    COMMISSION_PERCENT: String(commissionPercent),
    DRIVER_SHARE_PERCENT: String(100 - commissionPercent),
    SETTLEMENT_PERIOD: settlementPeriodLabel(s.settlement_period_days, locale),
    TERMINATION_NOTICE_DAYS: String(s.termination_notice_days),

    CANCEL_FREE_HOURS: String(s.school_cancel_free_hours),
    CANCEL_TIER_A: String(s.school_cancel_tier_a_pct),
    CANCEL_TIER_B: String(s.school_cancel_tier_b_pct),
    CANCEL_TIER_C: String(s.school_cancel_tier_c_pct),
  };

  if (party && "personalNumber" in party) {
    base.DRIVER_NAME = party.name || BLANK;
    base.DRIVER_PERSONAL_NUMBER = party.personalNumber || BLANK;
    base.DRIVER_PHONE = party.phone || BLANK;
    base.DRIVER_ADDRESS = party.address || BLANK;
  } else if (party) {
    base.SCHOOL_NAME = party.name || BLANK;
    base.SCHOOL_ID_NUMBER = party.idNumber || BLANK;
    base.SCHOOL_DIRECTOR = party.director || BLANK;
    base.SCHOOL_ADDRESS = party.address || BLANK;
    base.SCHOOL_PHONE = party.phone || BLANK;
  }

  return base;
}

/**
 * Substitution leaves nothing behind.
 *
 * A placeholder with no value becomes a blank rather than surviving as
 * "{{DRIVER_ADDRESS}}" in a legal document. Whether a blank is acceptable is a
 * separate question, answered by the missing*Details checks before signing is
 * ever offered — this function's job is only to make sure the reader never
 * sees template syntax.
 */
function resolve(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{([A-Z_]+)\}\}/g, (_whole, key: string) => {
    const value = values[key];
    return value && value.trim() ? value : BLANK;
  });
}

/**
 * The hash is taken AFTER substitution.
 *
 * A signature has to answer "what did this person read?", and the answer
 * includes the company details, the commercial terms and the counterparty's
 * own name as they were resolved at that moment.
 */
const hashBody = (body: string) => createHash("sha256").update(body, "utf8").digest("hex");

/**
 * The agreement currently on offer to a counterparty, or null when none is
 * published.
 *
 * Called without a party it returns the blank template — which is what the
 * admin console previews, and what a driver sees before they have given their
 * legal details. Called with one it returns that party's own copy, and only
 * that copy can be signed.
 */
export async function getActiveContract(
  locale: string,
  partyType: PartyType = "DRIVER",
  party?: DriverParty | SchoolParty,
): Promise<ContractDocument | null> {
  const want = contractLocale(locale);
  const [row] = await sql<{
    version: string; locale: string; title: string; body: string; effective_from: Date;
  }[]>`
    SELECT version, locale, title, body, effective_from
    FROM contract_versions
    WHERE published
      AND party_type = ${partyType}
      AND version = current_contract_version(${partyType})
      AND locale = ${want}
    LIMIT 1`;
  if (!row) return null;

  const body = resolve(row.body, await placeholders(want, party));
  return {
    partyType,
    version: row.version,
    locale: row.locale as ContractLocale,
    title: row.title,
    body,
    bodyHash: hashBody(body),
    effectiveFrom: row.effective_from,
    isTemplate: party === undefined,
  };
}

/** Convenience wrapper: the school agreement for a named school. */
export const getSchoolAgreement = (locale: string, school?: SchoolParty) =>
  getActiveContract(locale, "SCHOOL", school);

/** What the driver signed, if anything, for the version currently on offer. */
export async function getSignature(driverId: string): Promise<ContractSignature | null> {
  const [row] = await sql<{
    contract_version: string; locale: string; signed_name: string; body_hash: string; signed_at: Date;
  }[]>`
    SELECT contract_version, locale, signed_name, body_hash, signed_at
    FROM contract_signatures
    WHERE driver_id = ${driverId}::uuid
      AND contract_version = current_contract_version('DRIVER')
    LIMIT 1`;
  if (!row) return null;
  return {
    contractVersion: row.contract_version,
    locale: row.locale,
    signedName: row.signed_name,
    bodyHash: row.body_hash,
    signedAt: row.signed_at,
  };
}

/** Every signature this driver has ever given, newest first. */
export async function listSignatures(driverId: string): Promise<ContractSignature[]> {
  const rows = await sql<{
    contract_version: string; locale: string; signed_name: string; body_hash: string; signed_at: Date;
  }[]>`
    SELECT contract_version, locale, signed_name, body_hash, signed_at
    FROM contract_signatures WHERE driver_id = ${driverId}::uuid
    ORDER BY signed_at DESC`;
  return rows.map((r) => ({
    contractVersion: r.contract_version, locale: r.locale, signedName: r.signed_name,
    bodyHash: r.body_hash, signedAt: r.signed_at,
  }));
}

/** The driver as the agreement names them, read from their own profile. */
export async function getDriverParty(driverId: string): Promise<DriverParty | null> {
  const [row] = await sql<{
    legal_first_name: string | null; legal_last_name: string | null;
    personal_number: string | null; legal_address: string | null; phone: string | null;
  }[]>`
    SELECT d.legal_first_name, d.legal_last_name, d.personal_number, d.legal_address,
           u.phone
    FROM driver_profiles d
    JOIN users u ON u.id = d.user_id
    WHERE d.id = ${driverId}::uuid`;
  if (!row) return null;
  return {
    name: [row.legal_first_name, row.legal_last_name].filter(Boolean).join(" ").trim(),
    personalNumber: row.personal_number,
    phone: row.phone,
    address: row.legal_address,
  };
}

export type SignError =
  | "NO_CONTRACT" | "NOT_APPROVED" | "ALREADY_SIGNED" | "NAME_MISMATCH"
  | "NOT_CONFIRMED" | "STALE" | "DETAILS_INCOMPLETE";

export type SignResult = { ok: true } | { ok: false; error: SignError };

/**
 * Names are compared loosely: case, punctuation and spacing are ignored, and
 * both the legal first and last name from the driver's own application must
 * appear in what they typed. It rejects an idle "ok" in the box without
 * demanding a character-exact match of a name they typed months earlier.
 */
const normalise = (value: string) =>
  value.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");

export function nameMatches(typed: string, first: string | null, last: string | null): boolean {
  const got = normalise(typed);
  if (got.length < 3) return false;
  const parts = [first, last].filter((p): p is string => !!p && p.trim().length > 0);
  if (parts.length === 0) return true;
  return parts.every((part) => got.includes(normalise(part)));
}

export interface SignInput {
  driverId: string;
  userId: string;
  locale: string;
  typedName: string;
  confirmed: boolean;
  /** The hash the page rendered. Guards against signing a revised document. */
  bodyHash: string;
  ip: string | null;
  userAgent: string | null;
}

export async function signContract(input: SignInput): Promise<SignResult> {
  if (!input.confirmed) return { ok: false, error: "NOT_CONFIRMED" };

  const party = await getDriverParty(input.driverId);
  if (!party) return { ok: false, error: "NOT_APPROVED" };
  if (missingDriverDetails(party).length > 0) return { ok: false, error: "DETAILS_INCOMPLETE" };

  // The driver's own copy, not the template: the hash must cover their name,
  // personal number and address as printed.
  const contract = await getActiveContract(input.locale, "DRIVER", party);
  if (!contract || !companyDetailsComplete()) return { ok: false, error: "NO_CONTRACT" };

  // The document may have been revised, or a commercial term changed, between
  // the page rendering and the button being pressed. Signing the older text
  // would produce a signature for something no longer on offer.
  if (contract.bodyHash !== input.bodyHash) return { ok: false, error: "STALE" };

  const [driver] = await sql<{ status: string; legal_first_name: string | null; legal_last_name: string | null }[]>`
    SELECT status::text AS status, legal_first_name, legal_last_name
    FROM driver_profiles WHERE id = ${input.driverId}::uuid`;
  if (!driver) return { ok: false, error: "NOT_APPROVED" };
  if (driver.status !== "APPROVED") return { ok: false, error: "NOT_APPROVED" };

  if (!nameMatches(input.typedName, driver.legal_first_name, driver.legal_last_name)) {
    return { ok: false, error: "NAME_MISMATCH" };
  }

  const settings = await getSettings();
  const inserted = await sql<{ id: string }[]>`
    INSERT INTO contract_signatures
      (driver_id, contract_version, locale, signed_name, body_hash, ip, user_agent, evidence)
    VALUES (${input.driverId}::uuid, ${contract.version}, ${contract.locale},
            ${input.typedName.trim()}, ${contract.bodyHash}, ${input.ip},
            ${input.userAgent?.slice(0, 400) ?? null},
            ${JSON.stringify({
              companyLegalName: config.company.legalName,
              companyIdNumber: config.company.idNumber,
              companyDirector: config.company.director,
              commissionRateBps: settings.commission_rate_bps,
              settlementPeriodDays: settings.settlement_period_days,
              terminationNoticeDays: settings.termination_notice_days,
              driverPersonalNumber: party.personalNumber,
              driverAddress: party.address,
              titleShown: contract.title,
            })}::text::jsonb)
    ON CONFLICT (driver_id, contract_version) DO NOTHING
    RETURNING id`;

  if (inserted.length === 0) return { ok: false, error: "ALREADY_SIGNED" };

  // The signature row can vanish with the driver record; this entry cannot.
  await writeAudit({
    actorUserId: input.userId,
    actorRole: "DRIVER",
    action: "driver.contract_signed",
    objectType: "driver_profile",
    objectId: input.driverId,
    after: {
      contractVersion: contract.version,
      locale: contract.locale,
      signedName: input.typedName.trim(),
      bodyHash: contract.bodyHash,
      commissionRateBps: settings.commission_rate_bps,
    },
    reason: "electronic signature of the driver agreement",
  });

  return { ok: true };
}

/**
 * Parsed into headings and paragraphs for rendering. Same convention as
 * content_pages: a line beginning "## " opens a section, blank lines separate
 * paragraphs, and anything before the first heading is the introduction.
 */
export interface ContractSection { heading: string; paragraphs: string[] }

export function parseContract(body: string): { intro: string[]; sections: ContractSection[] } {
  const intro: string[] = [];
  const sections: ContractSection[] = [];
  let current: ContractSection | null = null;

  for (const block of body.split(/\n\s*\n/)) {
    const text = block.trim();
    if (!text) continue;
    if (text.startsWith("## ")) {
      if (current) sections.push(current);
      current = { heading: text.slice(3).trim(), paragraphs: [] };
    } else if (current) {
      current.paragraphs.push(text.replace(/\n/g, " "));
    } else {
      intro.push(text.replace(/\n/g, " "));
    }
  }
  if (current) sections.push(current);
  return { intro, sections };
}
