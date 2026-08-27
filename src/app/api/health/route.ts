import { NextResponse } from "next/server";
import { sql } from "@db/client";

export const dynamic = "force-dynamic";

/**
 * The commit this process was built from.
 *
 * Render sets RENDER_GIT_COMMIT during the build, so it is baked into the
 * running image rather than read at request time. Reported as the first seven
 * characters — enough to match against `git log`, not enough to be mistaken
 * for something to look up.
 *
 * This exists because "the site returns 200" says nothing about *which build*
 * is serving. Render keeps the previous version live when a build fails, so a
 * healthy response is exactly what a failed deploy looks like from outside.
 * That cost us a run of deploys that looked fine and were not.
 */
const BUILD = (process.env.RENDER_GIT_COMMIT ?? "").slice(0, 7) || "local";

/**
 * Health check for the host.
 *
 * Reports "ok" only if the database actually answers. A process that is up
 * but cannot reach Postgres serves errors on every page, and a health check
 * that ignores that is worse than none — it reports green while the site is
 * broken.
 *
 * Beyond up-or-down and the build id, deliberately reveals nothing.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await sql`SELECT 1`;
    return NextResponse.json(
      { status: "ok", build: BUILD, databaseMs: Date.now() - startedAt },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", build: BUILD, reason: "database unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
