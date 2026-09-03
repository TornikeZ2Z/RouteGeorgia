/**
 * Fill the console's Texts section with the legal pages that already exist.
 *
 * content_pages is an override layer: /[locale]/legal/[slug] renders the code
 * default from lib/legal.ts unless a PUBLISHED row here matches slug+locale.
 * Nothing had ever been overridden, so the table was empty and the Texts
 * screen showed a blank list — which is what CR-2026-0007 reported.
 *
 * This writes each document out in the body convention the override parser
 * expects ("## " opens a section, blank lines separate paragraphs), as an
 * UNPUBLISHED draft. Draft is the point: the live pages keep rendering the
 * code default exactly as before, so seeding changes nothing a visitor sees,
 * and the team gets the real text on screen to edit. Publishing a row is then
 * a deliberate act by whoever edits it.
 *
 * Idempotent: re-running refreshes only rows still untouched (published=false
 * and body unchanged). It will not overwrite an edit somebody has made.
 *
 *   npx tsx scripts/seed-content-pages.ts          # show what would be written
 *   npx tsx scripts/seed-content-pages.ts --yes    # write it
 */
import "dotenv/config";
import { sql } from "../db/client";
import { getLegalDocument, LEGAL_SLUGS } from "../src/lib/legal";

const APPLY = process.argv.includes("--yes");

/** The inverse of getOverride()'s parser in [locale]/legal/[slug]/page.tsx. */
function renderBody(doc: NonNullable<ReturnType<typeof getLegalDocument>>): string {
  const blocks: string[] = [];
  if (doc.intro.trim()) blocks.push(doc.intro.trim());
  for (const section of doc.sections) {
    if (section.heading.trim()) blocks.push(`## ${section.heading.trim()}`);
    for (const para of section.body) {
      if (para.trim()) blocks.push(para.trim());
    }
  }
  return blocks.join("\n\n");
}

let written = 0;
let skipped = 0;

for (const slug of LEGAL_SLUGS) {
  // lib/legal.ts ignores its locale argument — the documents are English only,
  // which is a real gap for Georgian readers and reported separately. Seeding
  // the English row is honest: the page already falls back to it per locale.
  const doc = getLegalDocument(slug, "en");
  if (!doc) {
    console.log(`  ${slug}: no document in lib/legal.ts, skipped`);
    continue;
  }
  const body = renderBody(doc);

  const [existing] = await sql<{ id: string; published: boolean; body: string }[]>`
    SELECT id, published, body FROM content_pages WHERE slug = ${slug} AND locale = 'en'`;

  if (existing && (existing.published || existing.body !== body)) {
    console.log(`  ${slug}: already edited here, left alone`);
    skipped++;
    continue;
  }

  console.log(
    `  ${slug}: "${doc.title}" — ${doc.sections.length} sections, ${body.length} chars` +
    `${existing ? " (refresh)" : " (new draft)"}`,
  );

  if (APPLY) {
    await sql`
      INSERT INTO content_pages (slug, locale, kind, title, body, published, updated_at)
      VALUES (${slug}, 'en', 'PAGE', ${doc.title}, ${body}, false, now())
      ON CONFLICT (slug, locale) DO UPDATE
        SET title = EXCLUDED.title, body = EXCLUDED.body, updated_at = now()`;
    written++;
  }
}

console.log(
  APPLY
    ? `\nWrote ${written} draft(s); left ${skipped} edited row(s) alone.`
    : `\nDry run. Nothing written — pass --yes to write.`,
);
await sql.end();
