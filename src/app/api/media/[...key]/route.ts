import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

/**
 * Public vehicle media.
 *
 * Only the public-media prefix is served here. Restricted KYC objects live
 * under a different prefix and are refused outright, so a leaked or guessed
 * key can never expose an identity document through this route.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const storageKey = key.join("/");

  if (!storageKey.startsWith("public-media/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const body = await getStorage().get(storageKey);
    const ext = storageKey.split(".").pop()?.toLowerCase();
    const type =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=3600, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
