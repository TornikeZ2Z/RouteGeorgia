import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/rbac";
import { getStorage } from "@/lib/storage";
import { imageKey } from "@/lib/change-requests";

/**
 * Screenshots attached to a change request.
 *
 * Behind the console's own permission, because these routinely show real
 * customer names, phone numbers and pickup addresses. Served by streaming the
 * object rather than handing out a storage URL, so nothing outlives the
 * request that authorised it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("admin.requests.read");
  } catch (err) {
    if (err instanceof ForbiddenError) return new NextResponse("Not found", { status: 404 });
    throw err;
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  const key = await imageKey(id);
  // Belt and braces: the column has a CHECK constraint saying the same thing,
  // and a route that assumes a prefix should verify it rather than trust it.
  if (!key || !key.startsWith("restricted-kyc/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const body = await getStorage().get(key);
    const ext = key.split(".").pop()?.toLowerCase();
    const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": type,
        // Never cached by a shared proxy: the permission was checked for this
        // viewer, not for whoever asks next.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
