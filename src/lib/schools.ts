import "server-only";
import { createHash } from "node:crypto";
import { sql } from "@db/client";
import { getSchoolAgreement, type SchoolParty } from "@/lib/contract";

/**
 * Schools, their agreement, and the order sheet behind every trip.
 *
 * A school is not a user of this platform — nobody from a school signs in.
 * It is a counterparty that operations talks to, signs a paper agreement
 * with, and then books trips for. So everything here is driven from the
 * console, and the school's own involvement is a signature on a document and
 * a name on an order sheet.
 */

export type SchoolStatus = "PROSPECT" | "ACTIVE" | "SUSPENDED" | "CLOSED";
export type OrderStatus = "DRAFT" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
export type Package = "STANDARD" | "PLUS" | "PREMIUM";

export interface School {
  id: string;
  name: string;
  idNumber: string;
  director: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: SchoolStatus;
  notes: string | null;
  createdAt: Date;
}

export interface SchoolAgreementSignature {
  contractVersion: string;
  locale: string;
  signedName: string;
  signedRole: string | null;
  bodyHash: string;
  method: "IN_PERSON" | "SCANNED" | "ELECTRONIC";
  signedAt: Date;
}

const rowToSchool = (r: Record<string, unknown>): School => ({
  id: r.id as string,
  name: r.name as string,
  idNumber: r.id_number as string,
  director: r.director as string,
  address: (r.address as string) ?? null,
  phone: (r.phone as string) ?? null,
  email: (r.email as string) ?? null,
  status: r.status as SchoolStatus,
  notes: (r.notes as string) ?? null,
  createdAt: r.created_at as Date,
});

/** The school as the agreement names it. */
export const asParty = (school: School): SchoolParty => ({
  name: school.name,
  idNumber: school.idNumber,
  director: school.director,
  address: school.address,
  phone: school.phone,
});

export async function listSchools(): Promise<(School & {
  signed: boolean; orders: number; nextTrip: Date | null;
})[]> {
  const rows = await sql<Record<string, unknown>[]>`
    SELECT s.*,
           EXISTS (
             SELECT 1 FROM school_agreement_signatures g
             WHERE g.school_id = s.id
               AND g.contract_version = current_contract_version('SCHOOL')
           ) AS signed,
           (SELECT count(*) FROM school_orders o WHERE o.school_id = s.id)::int AS orders,
           (SELECT min(o.trip_date) FROM school_orders o
             WHERE o.school_id = s.id AND o.status = 'CONFIRMED' AND o.trip_date >= current_date
           ) AS next_trip
    FROM school_clients s
    ORDER BY s.status = 'CLOSED', s.name`;
  return rows.map((r) => ({
    ...rowToSchool(r),
    signed: r.signed as boolean,
    orders: r.orders as number,
    nextTrip: (r.next_trip as Date) ?? null,
  }));
}

export async function getSchool(id: string): Promise<School | null> {
  const [row] = await sql<Record<string, unknown>[]>`
    SELECT * FROM school_clients WHERE id = ${id}::uuid`;
  return row ? rowToSchool(row) : null;
}

export interface CreateSchoolInput {
  name: string; idNumber: string; director: string;
  address: string | null; phone: string | null; email: string | null;
  notes: string | null; createdBy: string;
}

export async function createSchool(input: CreateSchoolInput): Promise<School> {
  const [row] = await sql<Record<string, unknown>[]>`
    INSERT INTO school_clients (name, id_number, director, address, phone, email, notes, created_by)
    VALUES (${input.name}, ${input.idNumber}, ${input.director}, ${input.address},
            ${input.phone}, ${input.email}, ${input.notes}, ${input.createdBy}::uuid)
    RETURNING *`;
  return rowToSchool(row!);
}

/** What this school signed, if anything, for the version currently on offer. */
export async function getSchoolSignature(
  schoolId: string,
): Promise<SchoolAgreementSignature | null> {
  const [row] = await sql<Record<string, unknown>[]>`
    SELECT contract_version, locale, signed_name, signed_role, body_hash, method, signed_at
    FROM school_agreement_signatures
    WHERE school_id = ${schoolId}::uuid
      AND contract_version = current_contract_version('SCHOOL')
    LIMIT 1`;
  if (!row) return null;
  return {
    contractVersion: row.contract_version as string,
    locale: row.locale as string,
    signedName: row.signed_name as string,
    signedRole: (row.signed_role as string) ?? null,
    bodyHash: row.body_hash as string,
    method: row.method as SchoolAgreementSignature["method"],
    signedAt: row.signed_at as Date,
  };
}

export type RecordSignatureError =
  | "NO_SCHOOL" | "NO_AGREEMENT" | "ALREADY_RECORDED" | "DETAILS_INCOMPLETE";

export interface RecordSignatureInput {
  schoolId: string;
  locale: string;
  signedName: string;
  signedRole: string | null;
  method: "IN_PERSON" | "SCANNED" | "ELECTRONIC";
  signedAt: Date;
  recordedBy: string;
}

/**
 * Record that a school signed the agreement.
 *
 * The hash is computed here rather than taken from the caller: what a school
 * signed on paper is whatever the console printed for them, and the console
 * prints the agreement resolved for that school. Recomputing it means the
 * stored hash always describes a document this system can reproduce, which is
 * the only thing that makes the record worth keeping.
 */
export async function recordSchoolSignature(
  input: RecordSignatureInput,
): Promise<{ ok: true } | { ok: false; error: RecordSignatureError }> {
  const school = await getSchool(input.schoolId);
  if (!school) return { ok: false, error: "NO_SCHOOL" };

  const agreement = await getSchoolAgreement(input.locale, asParty(school));
  if (!agreement) return { ok: false, error: "NO_AGREEMENT" };
  if (agreement.body.includes("____________")) {
    // A blank in a signed instrument is a defect, and the console should have
    // stopped this before printing. Refuse rather than record it.
    return { ok: false, error: "DETAILS_INCOMPLETE" };
  }

  const inserted = await sql<{ id: string }[]>`
    INSERT INTO school_agreement_signatures
      (school_id, contract_version, locale, signed_name, signed_role, body_hash,
       method, signed_at, recorded_by, evidence)
    VALUES (${input.schoolId}::uuid, ${agreement.version}, ${agreement.locale},
            ${input.signedName.trim()}, ${input.signedRole}, ${agreement.bodyHash},
            ${input.method}, ${input.signedAt}, ${input.recordedBy}::uuid,
            ${JSON.stringify({
              schoolName: school.name,
              schoolIdNumber: school.idNumber,
              schoolDirector: school.director,
              titleShown: agreement.title,
            })}::text::jsonb)
    ON CONFLICT (school_id, contract_version) DO NOTHING
    RETURNING id`;

  if (inserted.length === 0) return { ok: false, error: "ALREADY_RECORDED" };

  // A signed agreement is what turns a prospect into a school we can send a
  // bus to; the database refuses to confirm an order without one.
  await sql`
    UPDATE school_clients SET status = 'ACTIVE', updated_at = now()
    WHERE id = ${input.schoolId}::uuid AND status = 'PROSPECT'`;

  return { ok: true };
}

export interface SchoolOrder {
  id: string;
  reference: string;
  tripDate: Date;
  pickupPlace: string;
  destination: string;
  route: string | null;
  departAt: Date | null;
  returnEstimateAt: Date | null;
  students: number;
  chaperones: number;
  vehicleType: string | null;
  package: Package;
  safetyCoordinator: boolean;
  parentUpdates: boolean;
  totalPriceMinor: bigint;
  prepaidMinor: bigint;
  extraTerms: string | null;
  schoolContactName: string | null;
  schoolContactPhone: string | null;
  providerContactName: string | null;
  providerContactPhone: string | null;
  driverId: string | null;
  status: OrderStatus;
}

const rowToOrder = (r: Record<string, unknown>): SchoolOrder => ({
  id: r.id as string,
  reference: r.reference as string,
  tripDate: r.trip_date as Date,
  pickupPlace: r.pickup_place as string,
  destination: r.destination as string,
  route: (r.route as string) ?? null,
  departAt: (r.depart_at as Date) ?? null,
  returnEstimateAt: (r.return_estimate_at as Date) ?? null,
  students: r.students as number,
  chaperones: r.chaperones as number,
  vehicleType: (r.vehicle_type as string) ?? null,
  package: r.package as Package,
  safetyCoordinator: r.safety_coordinator as boolean,
  parentUpdates: r.parent_updates as boolean,
  totalPriceMinor: BigInt(r.total_price_minor as string | number),
  prepaidMinor: BigInt(r.prepaid_minor as string | number),
  extraTerms: (r.extra_terms as string) ?? null,
  schoolContactName: (r.school_contact_name as string) ?? null,
  schoolContactPhone: (r.school_contact_phone as string) ?? null,
  providerContactName: (r.provider_contact_name as string) ?? null,
  providerContactPhone: (r.provider_contact_phone as string) ?? null,
  driverId: (r.driver_id as string) ?? null,
  status: r.status as OrderStatus,
});

export async function listSchoolOrders(schoolId: string): Promise<SchoolOrder[]> {
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM school_orders WHERE school_id = ${schoolId}::uuid
    ORDER BY trip_date DESC`;
  return rows.map(rowToOrder);
}

/**
 * A human-readable order number, unique per year.
 *
 * Derived from a count rather than a sequence, so two people creating an order
 * in the same second can collide — which the unique index catches. Retrying
 * with a fresh count is enough: the loser of the race takes the next number.
 */
async function nextReference(): Promise<string> {
  const year = new Date().getFullYear();
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM school_orders
    WHERE reference LIKE ${`SCH-${year}-%`}`;
  return `SCH-${year}-${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

export interface CreateOrderInput {
  schoolId: string;
  tripDate: string;
  pickupPlace: string;
  destination: string;
  route: string | null;
  students: number;
  chaperones: number;
  vehicleType: string | null;
  package: Package;
  safetyCoordinator: boolean;
  parentUpdates: boolean;
  totalPriceMinor: bigint;
  prepaidMinor: bigint;
  extraTerms: string | null;
  schoolContactName: string | null;
  schoolContactPhone: string | null;
  createdBy: string;
}

export async function createSchoolOrder(input: CreateOrderInput): Promise<SchoolOrder> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const reference = await nextReference();
    try {
      const [row] = await sql<Record<string, unknown>[]>`
        INSERT INTO school_orders (
          school_id, reference, trip_date, pickup_place, destination, route,
          students, chaperones, vehicle_type, package, safety_coordinator,
          parent_updates, total_price_minor, prepaid_minor, extra_terms,
          school_contact_name, school_contact_phone, created_by)
        VALUES (
          ${input.schoolId}::uuid, ${reference}, ${input.tripDate}::date,
          ${input.pickupPlace}, ${input.destination}, ${input.route},
          ${input.students}, ${input.chaperones}, ${input.vehicleType},
          ${input.package}, ${input.safetyCoordinator}, ${input.parentUpdates},
          ${input.totalPriceMinor.toString()}::bigint,
          ${input.prepaidMinor.toString()}::bigint, ${input.extraTerms},
          ${input.schoolContactName}, ${input.schoolContactPhone},
          ${input.createdBy}::uuid)
        RETURNING *`;
      return rowToOrder(row!);
    } catch (err) {
      const isDuplicate = String(err).includes("school_orders_reference_idx");
      if (!isDuplicate || attempt === 2) throw err;
    }
  }
  throw new Error("could not allocate an order reference");
}

/** The agreement as this school's own copy, for printing. */
export const schoolAgreementFor = (school: School, locale: string) =>
  getSchoolAgreement(locale, asParty(school));

/**
 * Which package includes a Safety Coordinator by default.
 *
 * Article 7: PLUS and PREMIUM include one. STANDARD may still add one by
 * agreement, which is why the order stores the flag rather than deriving it.
 */
export const packageIncludesCoordinator = (pkg: Package): boolean =>
  pkg === "PLUS" || pkg === "PREMIUM";

export async function getSchoolOrder(
  id: string,
): Promise<(SchoolOrder & { schoolId: string }) | null> {
  const [row] = await sql<Record<string, unknown>[]>`
    SELECT * FROM school_orders WHERE id = ${id}::uuid`;
  return row ? { ...rowToOrder(row), schoolId: row.school_id as string } : null;
}

/** Move an order along its lifecycle. The database gates CONFIRMED itself. */
export async function setSchoolOrderStatus(
  id: string, status: OrderStatus, reason: string | null,
): Promise<void> {
  await sql`
    UPDATE school_orders
    SET status = ${status}, cancelled_reason = ${status === "CANCELLED" ? reason : null},
        updated_at = now()
    WHERE id = ${id}::uuid`;
}
