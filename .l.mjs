import postgres from "postgres";
const url = "postgres://app:app@127.0.0.1:55432/routeplanner";
try {
  const sql = postgres(url, { max: 1, connect_timeout: 5, onnotice: () => {} });
  const r = await sql`SELECT version, locale, party_type, published FROM contract_versions ORDER BY party_type, locale`;
  console.log(`local contract_versions: ${r.length}`);
  for (const x of r) console.log(`   ${x.party_type}/${x.locale} ${x.version} published=${x.published}`);
  const m = await sql`SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 3`;
  console.log("latest migrations:", m.map(x=>x.filename).join(", "));
  await sql.end();
} catch (e) { console.log("local db:", e.message.slice(0,80)); }
