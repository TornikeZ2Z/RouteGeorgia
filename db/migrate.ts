/**
 * Plain-SQL forward migrator. Files in db/migrations are applied in filename
 * order inside a transaction and recorded in schema_migrations.
 *
 * We deliberately do not use drizzle-kit push here: the baseline uses
 * EXCLUDE constraints, generated columns and triggers that are clearer and
 * safer as hand-written SQL you can read and review.
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run `npm run db:start` first.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const dir = resolve(process.cwd(), "db/migrations");

async function main() {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;

  const applied = new Set(
    (await sql<{ version: string }[]>`SELECT version FROM schema_migrations`).map((r) => r.version),
  );

  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let count = 0;

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) continue;
    const body = readFileSync(resolve(dir, file), "utf8");
    process.stdout.write(`  applying ${file} … `);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (version) VALUES (${version})`;
    });
    console.log("ok");
    count++;
  }

  console.log(count === 0 ? "Database is up to date." : `Applied ${count} migration(s).`);
  await sql.end();
}

main().catch(async (err) => {
  console.error("\nMigration failed:", err.message);
  await sql.end();
  process.exit(1);
});
