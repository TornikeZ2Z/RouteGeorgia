"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { setStatus, getRequest, STATUSES, type Status } from "@/lib/change-requests";

export type ActionState = { ok: boolean; message?: string };

/**
 * Move a request along.
 *
 * Declining requires a written reason, enforced here and again by the
 * database. Somebody took the trouble to file it; closing it silently is how
 * you stop receiving them.
 */
export async function setRequestStatusAction(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("admin.requests.write");

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const resolution = String(formData.get("resolution") ?? "").trim() || null;

  if (!STATUSES.includes(status as Status)) {
    return { ok: false, message: "That is not a status a request can be in." };
  }

  const before = await getRequest(id);
  if (!before) return { ok: false, message: "That request is no longer on file." };

  const result = await setStatus(id, status as Status, resolution);
  if (!result.ok) {
    return {
      ok: false,
      message: result.error === "RESOLUTION_REQUIRED"
        ? "Say why it was declined — at least a sentence. The person who filed it will be told."
        : "That request is no longer on file.",
    };
  }

  await writeAudit({
    actorUserId: actor.id,
    actorRole: actor.roles[0] ?? null,
    action: "change_request.status_changed",
    objectType: "change_request",
    objectId: id,
    before: { status: before.status },
    after: { status },
    reason: resolution ?? "change request status updated from the console",
  });

  revalidatePath("/admin/requests");
  revalidatePath(`/admin/requests/${id}`);
  return { ok: true, message: `${before.reference} is now ${status.toLowerCase().replace("_", " ")}.` };
}
