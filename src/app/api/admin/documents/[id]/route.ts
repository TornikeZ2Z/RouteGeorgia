import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { sql } from "@db/client";
import { getStorage } from "@/lib/storage";

/**
 * Serve a driver's identity or licence document to a reviewer.
 *
 * Reviewers were being asked to approve documents they could not open. This
 * fixes that, carefully:
 *
 *   - requires the documents permission, not merely admin access
 *   - streams the file rather than exposing a storage URL, so nothing is
 *     shareable outside the console
 *   - writes an audit entry for every single view, because looking at
 *     somebody's passport is itself an event worth recording
 *   - forbids caching and indexing
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("admin.documents.read");
  const { id } = await params;

  const [doc] = await sql<{
    storage_key: string; mime_type: string | null; type: string; driver_id: string;
  }[]>`
    SELECT storage_key, mime_type, type::text AS type, driver_id
    FROM driver_documents WHERE id = ${id}::uuid`;

  if (!doc) return new NextResponse("Not found", { status: 404 });

  // Restricted KYC only. A public-media key here would mean something is wrong.
  if (!doc.storage_key.startsWith("restricted-kyc/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  await writeAudit({
    actorUserId: actor.id,
    action: "document.viewed",
    objectType: "driver_document",
    objectId: id,
    reason: `reviewer opened ${doc.type.toLowerCase()}`,
  });

  try {
    const body = await getStorage().get(doc.storage_key);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": doc.mime_type ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${doc.type.toLowerCase()}"`,
        "Cache-Control": "no-store, private",
        "X-Robots-Tag": "noindex, nofollow",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    // Seeded records point at files that were never uploaded.
    return new NextResponse("The file is not available in storage.", { status: 404 });
  }
}
