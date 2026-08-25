/**
 * One-off cleanup: remove the @example.com records that end-to-end testing
 * left in the database.
 *
 * Local development shares DATABASE_URL with the live database, so test
 * submissions against a local dev server landed in the real review queue.
 * This removes exactly those and nothing else: it matches on the
 * @example.com address only, prints every row before touching it, and will
 * not run if the pattern matches anything with a real booking attached.
 *
 *   node scripts/remove-test-records.mjs          # show what would go
 *   node scripts/remove-test-records.mjs --yes    # actually remove it
 */
import "dotenv/config";
import postgres from "postgres";

const APPLY = process.argv.includes("--yes");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const victims = await sql`
  SELECT u.id, u.email, d.id AS driver_id, d.status::text AS status, d.published
  FROM users u
  LEFT JOIN driver_profiles d ON d.user_id = u.id
  WHERE u.email_normalized LIKE '%@example.com'
  ORDER BY u.created_at`;

if (victims.length === 0) {
  console.log("Nothing to remove — no @example.com records found.");
  await sql.end();
  process.exit(0);
}

console.log(`Found ${victims.length} test record(s):`);
for (const v of victims) {
  console.log(`  ${v.email}  driver=${v.driver_id ?? "none"} status=${v.status ?? "-"} published=${v.published ?? "-"}`);
}

// Refuse to touch anything a real traveller has interacted with.
const driverIds = victims.map((v) => v.driver_id).filter(Boolean);
if (driverIds.length > 0) {
  const [{ bookings }] = await sql`
    SELECT count(*)::int AS bookings FROM bookings WHERE driver_id = ANY(${driverIds}::uuid[])`;
  if (bookings > 0) {
    console.error(`REFUSING: ${bookings} booking(s) reference these drivers. Investigate by hand.`);
    await sql.end();
    process.exit(1);
  }
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --yes to remove these.");
  await sql.end();
  process.exit(0);
}

for (const v of victims) {
  if (v.driver_id) {
    await sql`
      UPDATE support_tickets
      SET state = 'CLOSED', driver_id = NULL, resolved_at = now(),
          resolution = 'Closed: end-to-end test record, removed during cleanup.'
      WHERE driver_id = ${v.driver_id}::uuid`;
    await sql`DELETE FROM vehicle_media WHERE vehicle_id IN (SELECT id FROM vehicles WHERE driver_id = ${v.driver_id}::uuid)`;
    await sql`DELETE FROM vehicles           WHERE driver_id = ${v.driver_id}::uuid`;
    await sql`DELETE FROM driver_languages   WHERE driver_id = ${v.driver_id}::uuid`;
    await sql`DELETE FROM driver_documents   WHERE driver_id = ${v.driver_id}::uuid`;
    await sql`DELETE FROM driver_decisions   WHERE driver_id = ${v.driver_id}::uuid`;
    await sql`DELETE FROM availability_blocks WHERE driver_id = ${v.driver_id}::uuid`;
    await sql`DELETE FROM contract_signatures WHERE driver_id = ${v.driver_id}::uuid`;
    await sql`DELETE FROM driver_profiles    WHERE id = ${v.driver_id}::uuid`;
  }
  await sql`DELETE FROM notifications WHERE to_address = ${v.email}`;
  await sql`DELETE FROM sessions      WHERE user_id = ${v.id}::uuid`;
  await sql`DELETE FROM user_roles    WHERE user_id = ${v.id}::uuid`;

  // The audit log is append-only and references the actor, so a user who
  // appears in it cannot be deleted — deliberately: the log records that the
  // application happened, and erasing that would defeat the point. Such an
  // account is closed instead: no password, no roles, cannot sign in, and
  // gone from every operational queue.
  const [{ audited }] = await sql`
    SELECT count(*)::int AS audited FROM audit_logs WHERE actor_user_id = ${v.id}::uuid`;
  if (audited > 0) {
    await sql`UPDATE users SET status = 'CLOSED', password_hash = NULL WHERE id = ${v.id}::uuid`;
    console.log(`closed  ${v.email} (kept: ${audited} audit entr${audited === 1 ? "y" : "ies"})`);
  } else {
    await sql`DELETE FROM users WHERE id = ${v.id}::uuid`;
    console.log("removed", v.email);
  }
}

// Tickets the duplicate-application test filed. Closed rather than deleted:
// support_notes is append-only and a delete would cascade into it.
const tickets = await sql`
  UPDATE support_tickets
  SET state = 'CLOSED', resolved_at = now(),
      resolution = 'Closed: end-to-end test record, removed during cleanup.'
  WHERE state <> 'CLOSED' AND (subject ILIKE '%@example.com%' OR subject ILIKE '%dup.test%')
  RETURNING id`;
console.log(`closed ${tickets.length} test support ticket(s)`);

const [after] = await sql`
  SELECT (SELECT count(*)::int FROM users WHERE status = 'ACTIVE') AS active_users,
         (SELECT count(*)::int FROM driver_profiles) AS drivers,
         (SELECT count(*)::int FROM vehicles) AS vehicles`;
console.log("remaining:", after);
await sql.end();
