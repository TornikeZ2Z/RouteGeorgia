"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { parseMajor } from "@/lib/money";
import {
  createSchool, createSchoolOrder, recordSchoolSignature, setSchoolOrderStatus,
  getSchoolOrder, packageIncludesCoordinator, type Package,
} from "@/lib/schools";

export type ActionState = { ok: boolean; message?: string };

const trimmedOrNull = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
};

const SchoolInput = z.object({
  name: z.string().trim().min(2).max(160),
  // Georgian legal entities carry a 9-digit identification code, but the field
  // is kept permissive: a school registered under an older format should not
  // be unenterable because of a validator.
  idNumber: z.string().trim().min(5).max(20),
  director: z.string().trim().min(3).max(160),
});

export async function createSchoolAction(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("admin.schools.write");

  const parsed = SchoolInput.safeParse({
    name: formData.get("name"),
    idNumber: formData.get("idNumber"),
    director: formData.get("director"),
  });
  if (!parsed.success) {
    return { ok: false, message: "A school needs its registered name, identification code and director." };
  }

  let school;
  try {
    school = await createSchool({
      ...parsed.data,
      address: trimmedOrNull(formData.get("address")),
      phone: trimmedOrNull(formData.get("phone")),
      email: trimmedOrNull(formData.get("email")),
      notes: trimmedOrNull(formData.get("notes")),
      createdBy: actor.id,
    });
  } catch (err) {
    if (String(err).includes("school_clients_id_number_idx")) {
      return { ok: false, message: "A school with that identification code is already on file." };
    }
    throw err;
  }

  await writeAudit({
    actorUserId: actor.id, actorRole: actor.roles[0] ?? null,
    action: "school.created", objectType: "school_client", objectId: school.id,
    after: { name: school.name, idNumber: school.idNumber },
    reason: "school added to the client list",
  });

  revalidatePath("/admin/schools");
  redirect(`/admin/schools/${school.id}`);
}

const METHODS = ["IN_PERSON", "SCANNED", "ELECTRONIC"] as const;

/**
 * Record a signature that happened somewhere this system cannot see.
 *
 * A written reason is required. Unlike a driver's click, nothing here is
 * self-evidencing: the only account of how this document came to be signed is
 * the one the member of staff writes down.
 */
export async function recordSchoolSignatureAction(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("admin.schools.agreement");

  const schoolId = String(formData.get("schoolId") ?? "");
  const signedName = String(formData.get("signedName") ?? "").trim();
  const method = String(formData.get("method") ?? "");
  const signedAtRaw = String(formData.get("signedAt") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (signedName.length < 3) return { ok: false, message: "Enter the name of the person who signed." };
  if (!METHODS.includes(method as (typeof METHODS)[number])) {
    return { ok: false, message: "Choose how the agreement was signed." };
  }
  if (reason.length < 10) {
    return { ok: false, message: "Describe how this signature was obtained — at least a sentence." };
  }

  const signedAt = signedAtRaw ? new Date(signedAtRaw) : new Date();
  if (Number.isNaN(signedAt.getTime())) return { ok: false, message: "That signature date is not a date." };
  if (signedAt.getTime() > Date.now() + 60_000) {
    return { ok: false, message: "A signature cannot be dated in the future." };
  }

  const result = await recordSchoolSignature({
    schoolId,
    locale: String(formData.get("locale") ?? "ka"),
    signedName,
    signedRole: trimmedOrNull(formData.get("signedRole")),
    method: method as (typeof METHODS)[number],
    signedAt,
    recordedBy: actor.id,
  });

  if (!result.ok) {
    const message = {
      NO_SCHOOL: "That school is no longer on file.",
      NO_AGREEMENT: "No school agreement is published, so there is nothing to have signed.",
      ALREADY_RECORDED: "A signature for this version is already recorded.",
      DETAILS_INCOMPLETE: "The agreement still has blanks. Fill in the school's details, and the company's, first.",
    }[result.error];
    return { ok: false, message };
  }

  await writeAudit({
    actorUserId: actor.id, actorRole: actor.roles[0] ?? null,
    action: "school.agreement_signed", objectType: "school_client", objectId: schoolId,
    after: { signedName, method, signedAt: signedAt.toISOString() },
    reason,
  });

  revalidatePath(`/admin/schools/${schoolId}`);
  return { ok: true, message: "Recorded. This school can now be sent confirmed orders." };
}

const PACKAGES = ["STANDARD", "PLUS", "PREMIUM"] as const;

/**
 * Create the order sheet for one trip — Annex 1 of the agreement.
 *
 * Created as a DRAFT whatever the school has signed, so a trip can be planned
 * and priced before the paperwork is back. Confirming it is the step the
 * database gates on a signature.
 */
export async function createSchoolOrderAction(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("admin.schools.write");

  const schoolId = String(formData.get("schoolId") ?? "");
  const students = Number(String(formData.get("students") ?? ""));
  const chaperones = Number(String(formData.get("chaperones") ?? "0") || "0");
  const pkg = String(formData.get("package") ?? "STANDARD");

  if (!Number.isInteger(students) || students < 1 || students > 500) {
    return { ok: false, message: "Enter the number of pupils, between 1 and 500." };
  }
  if (!Number.isInteger(chaperones) || chaperones < 0 || chaperones > 100) {
    return { ok: false, message: "Enter the number of accompanying adults, up to 100." };
  }
  if (!PACKAGES.includes(pkg as Package)) {
    return { ok: false, message: "Choose one of the three packages." };
  }

  const tripDate = String(formData.get("tripDate") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) {
    return { ok: false, message: "Enter the date of the trip." };
  }

  const pickupPlace = String(formData.get("pickupPlace") ?? "").trim();
  const destination = String(formData.get("destination") ?? "").trim();
  if (pickupPlace.length < 2 || destination.length < 2) {
    return { ok: false, message: "An order sheet needs an assembly point and a destination." };
  }

  let totalPriceMinor: bigint;
  let prepaidMinor: bigint;
  try {
    totalPriceMinor = parseMajor(String(formData.get("totalPrice") ?? "0").trim() || "0");
    prepaidMinor = parseMajor(String(formData.get("prepaid") ?? "0").trim() || "0");
  } catch {
    return { ok: false, message: "Enter the prices as plain numbers, for example 1250.00" };
  }
  if (prepaidMinor > totalPriceMinor) {
    return { ok: false, message: "The prepayment cannot be more than the total price." };
  }

  // Article 7 says PLUS and PREMIUM include a coordinator. A STANDARD booking
  // may still add one, so the tick box only ever adds.
  const safetyCoordinator =
    packageIncludesCoordinator(pkg as Package) || formData.get("safetyCoordinator") === "on";

  const order = await createSchoolOrder({
    schoolId,
    tripDate,
    pickupPlace,
    destination,
    route: trimmedOrNull(formData.get("route")),
    students,
    chaperones,
    vehicleType: trimmedOrNull(formData.get("vehicleType")),
    package: pkg as Package,
    safetyCoordinator,
    parentUpdates: formData.get("parentUpdates") === "on",
    totalPriceMinor,
    prepaidMinor,
    extraTerms: trimmedOrNull(formData.get("extraTerms")),
    schoolContactName: trimmedOrNull(formData.get("schoolContactName")),
    schoolContactPhone: trimmedOrNull(formData.get("schoolContactPhone")),
    createdBy: actor.id,
  });

  await writeAudit({
    actorUserId: actor.id, actorRole: actor.roles[0] ?? null,
    action: "school.order_created", objectType: "school_order", objectId: order.id,
    after: { reference: order.reference, tripDate, students, package: pkg },
    reason: "school excursion order sheet created",
  });

  revalidatePath(`/admin/schools/${schoolId}`);
  return { ok: true, message: `Order ${order.reference} created as a draft.` };
}

const ORDER_STATUSES = ["DRAFT", "CONFIRMED", "COMPLETED", "CANCELLED"] as const;

export async function setSchoolOrderStatusAction(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("admin.schools.write");

  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = trimmedOrNull(formData.get("reason"));

  if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) {
    return { ok: false, message: "That is not a status an order can be in." };
  }
  if (status === "CANCELLED" && (!reason || reason.length < 5)) {
    return { ok: false, message: "Say why the trip was cancelled — the cancellation ladder depends on it." };
  }

  const order = await getSchoolOrder(orderId);
  if (!order) return { ok: false, message: "That order is no longer on file." };

  try {
    await setSchoolOrderStatus(orderId, status as (typeof ORDER_STATUSES)[number], reason);
  } catch (err) {
    // The trigger refuses to confirm an order for a school that has not signed.
    if (String(err).includes("has not signed the school agreement")) {
      return {
        ok: false,
        message: "This school has not signed the agreement yet, so the order cannot be confirmed.",
      };
    }
    throw err;
  }

  await writeAudit({
    actorUserId: actor.id, actorRole: actor.roles[0] ?? null,
    action: "school.order_status_changed", objectType: "school_order", objectId: orderId,
    before: { status: order.status }, after: { status },
    reason: reason ?? "school order status changed from the console",
  });

  revalidatePath(`/admin/schools/${order.schoolId}`);
  return { ok: true, message: `Order ${order.reference} is now ${status.toLowerCase()}.` };
}
