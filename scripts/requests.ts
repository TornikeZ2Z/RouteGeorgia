/**
 * The change-request queue, on the command line.
 *
 * This exists so that reading the queue costs nobody a copy-and-paste. Claude
 * runs it, the requests land in the conversation already briefed, and work
 * starts when a human says so — which is the only step that should need one.
 *
 *   npm run requests               open requests, briefed
 *   npm run requests -- --all      include the closed ones
 *   npm run requests -- CR-2026-3  one request in full
 *   npm run requests -- --start CR-2026-3
 *   npm run requests -- --done CR-2026-3 "what changed"
 *   npm run requests -- --decline CR-2026-3 "why not"
 *   npm run requests -- --images CR-2026-3   save its screenshots locally
 */
import "dotenv/config";
import postgres from "postgres";
import { briefFor, type ChangeRequest } from "../src/lib/change-request-brief";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

const row = (r: Record<string, unknown>): ChangeRequest => ({
  id: r.id as string,
  reference: r.reference as string,
  title: r.title as string,
  body: r.body as string,
  reason: (r.reason as string) ?? null,
  area: r.area as ChangeRequest["area"],
  urgency: r.urgency as ChangeRequest["urgency"],
  submittedByName: r.submitted_by_name as string,
  submittedByContact: (r.submitted_by_contact as string) ?? null,
  submittedByUserId: (r.submitted_by_user_id as string) ?? null,
  status: r.status as ChangeRequest["status"],
  resolution: (r.resolution as string) ?? null,
  createdAt: r.created_at as Date,
  updatedAt: r.updated_at as Date,
});

const imageCount = async (id: string): Promise<number> => {
  const [c] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM change_request_images WHERE request_id = ${id}::uuid`;
  return c?.n ?? 0;
};

async function show(requests: ChangeRequest[]) {
  if (requests.length === 0) {
    console.log("Nothing open. Everything filed has been dealt with.");
    return;
  }
  for (const r of requests) {
    console.log("=".repeat(72));
    console.log(`${r.reference}   ${r.status}   filed ${r.createdAt.toISOString().slice(0, 10)}`);
    console.log("=".repeat(72));
    console.log(briefFor(r, await imageCount(r.id)));
    console.log();
  }
  console.log(`${requests.length} request${requests.length === 1 ? "" : "s"}.`);
  console.log("Say which one to work on. Nothing starts on its own.");
}

async function setStatus(ref: string, status: string, note: string | null) {
  if (status === "DECLINED" && (!note || note.trim().length < 5)) {
    console.error("Declining needs a reason — the person who filed it will be told.");
    process.exitCode = 1;
    return;
  }
  const updated = await sql<{ reference: string }[]>`
    UPDATE change_requests
    SET status = ${status}, resolution = ${note?.trim() || null}, updated_at = now()
    WHERE upper(reference) = upper(${ref})
    RETURNING reference`;
  if (updated.length === 0) {
    console.error(`No request called ${ref}.`);
    process.exitCode = 1;
    return;
  }
  console.log(`${updated[0]!.reference} is now ${status.toLowerCase().replace("_", " ")}.`);
}

/**
 * Pull a request's screenshots down to disk so they can be looked at.
 *
 * They live in the restricted bucket and are served only behind the console's
 * permission, so there is no URL to open — which leaves whoever is working the
 * request describing a picture they cannot see. This needs the S3 credentials
 * in .env; without them it says so rather than failing obscurely.
 */
async function saveImages(ref: string) {
  if (!process.env.S3_BUCKET) {
    console.error(
      [
        "Object storage is not configured locally, so the screenshots cannot",
        "be fetched. Add these to .env, with the same values the deployment",
        "uses: S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID and",
        "S3_SECRET_ACCESS_KEY.",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  const rows = await sql<{ id: string; storage_key: string; mime_type: string }[]>`
    SELECT i.id, i.storage_key, i.mime_type
    FROM change_request_images i
    JOIN change_requests r ON r.id = i.request_id
    WHERE upper(r.reference) = upper(${ref})
    ORDER BY i.created_at`;

  if (rows.length === 0) {
    console.log(`No screenshots on ${ref}.`);
    return;
  }

  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { getStorage } = await import("../src/lib/storage/index.js");
  const dir = `.request-images/${ref.toUpperCase()}`;
  mkdirSync(dir, { recursive: true });

  const storage = getStorage();
  for (const [i, row] of rows.entries()) {
    const ext = row.mime_type.split("/")[1] ?? "png";
    const out = `${dir}/${String(i + 1).padStart(2, "0")}.${ext}`;
    writeFileSync(out, await storage.get(row.storage_key));
    console.log("saved", out);
  }
  console.log("");
  console.log(`${rows.length} screenshot(s) in ${dir}/ — open them before working from the text alone.`);
}

const args = process.argv.slice(2);
const flag = args.find((a) => a.startsWith("--"));
const rest = args.filter((a) => !a.startsWith("--"));

try {
  if (flag === "--images") {
    await saveImages(rest[0] ?? "");
  } else if (flag === "--start" || flag === "--done" || flag === "--decline") {
    const status = flag === "--start" ? "IN_PROGRESS" : flag === "--done" ? "DONE" : "DECLINED";
    await setStatus(rest[0] ?? "", status, rest.slice(1).join(" ") || null);
  } else if (rest.length > 0) {
    const rows = await sql<Record<string, unknown>[]>`
      SELECT * FROM change_requests WHERE upper(reference) = upper(${rest[0]!})`;
    await show(rows.map(row));
  } else {
    const rows = flag === "--all"
      ? await sql<Record<string, unknown>[]>`
          SELECT * FROM change_requests
          ORDER BY status IN ('DONE','DECLINED'), created_at DESC`
      : await sql<Record<string, unknown>[]>`
          SELECT * FROM change_requests
          WHERE status IN ('NEW','TRIAGED','IN_PROGRESS')
          ORDER BY urgency = 'HIGH' DESC, created_at`;
    await show(rows.map(row));
  }
} finally {
  await sql.end();
}
