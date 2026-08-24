import "server-only";
import { createHash } from "node:crypto";
import { sql } from "@db/client";
import { config } from "@/lib/config";
import { writeAudit } from "@/lib/audit";
import type { Locale } from "@/lib/i18n";

/**
 * The driver agreement, and signing it.
 *
 * Approval is our decision to work with a driver. The signature is their
 * decision to work with us. A driver goes live only when both have happened —
 * enforced in the publish action and again by a trigger on driver_profiles.
 *
 * The agreement exists in Georgian and English only. Georgian governs; a
 * driver whose console language is Russian is shown the English text, because
 * signing a translation that does not exist would be worse than reading one
 * that does.
 */

/** Contract text is stored with placeholders so the entity can change without a deploy. */
const PLACEHOLDERS = {
  COMPANY_LEGAL_NAME: () => config.company.legalName,
  COMPANY_ID_NUMBER: () => config.company.idNumber,
  COMPANY_ADDRESS: () => config.company.address,
  SUPPORT_EMAIL: () => config.contact.email,
  COMMISSION_PERCENT: () => (config.policy.commissionRateBps / 100).toString(),
} as const;

export type ContractLocale = "en" | "ka";

/** The console renders in ka, en or ru; the agreement exists in two of those. */
export const contractLocale = (locale: string): ContractLocale => (locale === "ka" ? "ka" : "en");

export interface ContractDocument {
  version: string;
  locale: ContractLocale;
  title: string;
  /** Placeholders already resolved — this is the text the driver reads. */
  body: string;
  /** SHA-256 of `body`, i.e. of what was actually on the screen. */
  bodyHash: string;
  effectiveFrom: Date;
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
 * The commission percentage always resolves (it comes from configuration that
 * has a default), so only the three company fields can be outstanding.
 */
export function missingCompanyDetails(): string[] {
  const missing: string[] = [];
  if (!config.company.legalName.trim()) missing.push("COMPANY_LEGAL_NAME");
  if (!config.company.idNumber.trim()) missing.push("COMPANY_ID_NUMBER");
  if (!config.company.address.trim()) missing.push("COMPANY_ADDRESS");
  return missing;
}

export const companyDetailsComplete = (): boolean => missingCompanyDetails().length === 0;

function resolve(body: string): string {
  return body.replace(/\{\{([A-Z_]+)\}\}/g, (whole, key: string) => {
    const value = PLACEHOLDERS[key as keyof typeof PLACEHOLDERS]?.();
    return value ? value : whole;
  });
}

/**
 * The hash is taken AFTER substitution.
 *
 * The generated column on contract_versions hashes the stored template, which
 * answers "was the template edited?". A signature has to answer a different
 * question — "what did this person read?" — and the answer includes the
 * company name and commission rate that were resolved at the time.
 */
const hashBody = (body: string) => createHash("sha256").update(body, "utf8").digest("hex");

/** The agreement currently on offer, or null when none is published. */
export async function getActiveContract(locale: string): Promise<ContractDocument | null> {
  const want = contractLocale(locale);
  const [row] = await sql<{
    version: string; locale: string; title: string; body: string; effective_from: Date;
  }[]>`
    SELECT version, locale, title, body, effective_from
    FROM contract_versions
    WHERE published AND version = current_contract_version() AND locale = ${want}
    LIMIT 1`;
  if (!row) return null;

  const body = resolve(row.body);
  return {
    version: row.version,
    locale: row.locale as ContractLocale,
    title: row.title,
    body,
    bodyHash: hashBody(body),
    effectiveFrom: row.effective_from,
  };
}

/** What the driver signed, if anything, for the version currently on offer. */
export async function getSignature(driverId: string): Promise<ContractSignature | null> {
  const [row] = await sql<{
    contract_version: string; locale: string; signed_name: string; body_hash: string; signed_at: Date;
  }[]>`
    SELECT contract_version, locale, signed_name, body_hash, signed_at
    FROM contract_signatures
    WHERE driver_id = ${driverId}::uuid AND contract_version = current_contract_version()
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

export type SignError =
  | "NO_CONTRACT" | "NOT_APPROVED" | "ALREADY_SIGNED" | "NAME_MISMATCH"
  | "NOT_CONFIRMED" | "STALE";

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

  const contract = await getActiveContract(input.locale);
  if (!contract || !companyDetailsComplete()) return { ok: false, error: "NO_CONTRACT" };

  // The document may have been revised, or the commission rate changed, between
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

  const inserted = await sql<{ id: string }[]>`
    INSERT INTO contract_signatures
      (driver_id, contract_version, locale, signed_name, body_hash, ip, user_agent, evidence)
    VALUES (${input.driverId}::uuid, ${contract.version}, ${contract.locale},
            ${input.typedName.trim()}, ${contract.bodyHash}, ${input.ip},
            ${input.userAgent?.slice(0, 400) ?? null},
            ${JSON.stringify({
              companyLegalName: config.company.legalName,
              companyIdNumber: config.company.idNumber,
              commissionRateBps: config.policy.commissionRateBps,
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
      commissionRateBps: config.policy.commissionRateBps,
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
