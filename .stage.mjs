import "dotenv/config";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const stage = process.argv[2];
const [d] = await sql`SELECT d.id FROM driver_profiles d JOIN users u ON u.id=d.user_id
                      WHERE u.email_normalized='flowtest@example.com'`;
const id = d.id;

if (stage === "approve") {
  // what decideDriverAction does
  await sql`UPDATE driver_profiles SET status='APPROVED', approved_at=now(), updated_at=now() WHERE id=${id}::uuid`;
  console.log("driver APPROVED");
}
if (stage === "docs") {
  for (const t of ["IDENTITY", "DRIVING_LICENSE"]) {
    await sql`INSERT INTO driver_documents (driver_id, type, storage_key, mime_type, size_bytes,
                                            checksum, is_mandatory, state, expires_on)
              VALUES (${id}::uuid, ${t}::doc_type, ${'restricted-kyc/flow/' + t + '.jpg'}, 'image/jpeg',
                      1024, 'deadbeef', true, 'PENDING', current_date + 400)`;
  }
  console.log("driver uploaded 2 documents (PENDING)");
}
if (stage === "docs-approve") {
  await sql`UPDATE driver_documents SET state='APPROVED', reviewed_at=now()
            WHERE driver_id=${id}::uuid AND state='PENDING'`;
  console.log("documents APPROVED by staff");
}
if (stage === "vehicle") {
  await sql`UPDATE vehicles SET status='APPROVED', published=true WHERE driver_id=${id}::uuid`;
  console.log("vehicle APPROVED");
}
if (stage === "pricing") {
  const [v] = await sql`SELECT id FROM vehicles WHERE driver_id=${id}::uuid LIMIT 1`;
  await sql`INSERT INTO price_plans (driver_id, vehicle_id, version, status, rate_per_km_minor,
                                     rate_per_minute_minor, per_stop_fee_minor, overnight_fee_minor,
                                     minimum_fare_minor, season_factor_bps, currency, effective_from)
            VALUES (${id}::uuid, ${v.id}::uuid, 1, 'ACTIVE', 150, 0, 0, 0, 0, 10000, 'GEL', now())`;
  console.log("driver set pricing (ACTIVE plan)");
}
if (stage === "sign") {
  const [u] = await sql`SELECT user_id FROM driver_profiles WHERE id=${id}::uuid`;
  await sql`INSERT INTO contract_signatures (driver_id, contract_version, locale, signed_name, body_hash)
            VALUES (${id}::uuid, current_contract_version(), 'ka', 'ტესტ მძღოლი', 'flow-test-hash')`;
  console.log("driver SIGNED the agreement");
}
if (stage === "publish") {
  try {
    await sql`UPDATE driver_profiles SET published=true, updated_at=now() WHERE id=${id}::uuid`;
    console.log("PUBLISHED — the database trigger allowed it");
  } catch (e) {
    console.log("REFUSED BY DATABASE:", e.message.split("\n")[0]);
  }
}
await sql.end();
