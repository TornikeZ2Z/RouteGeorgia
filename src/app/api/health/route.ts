import { NextResponse } from "next/server";
import { sql } from "@db/client";

export const dynamic = "force-dynamic";

/**
 * Health check for the host.
 *
 * Reports "ok" only if the database actually answers. A process that is up
 * but cannot reach Postgres serves errors on every page, and a health check
 * that ignores that is worse than none — it reports green while the site is
 * broken.
 *
 * Deliberately reveals nothing beyond up or down.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await sql`SELECT 1`;
    return NextResponse.json(
      { status: "ok", databaseMs: Date.now() - startedAt },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", reason: "database unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
