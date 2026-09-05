# Handover — moving Route Planner to on-premise hosting

**Audience:** the engineer taking over operations, and any Claude instance
assisting them. Written 2026-08-29 by the Claude session that built the
current contract system and set up mail.

Read the whole of "Things that will bite you" before touching anything. Most
of it was learned expensively.

---

## 1. What this is

A private-driver marketplace for Georgia, live at <https://routeplanner.ge>.
Travellers book a whole vehicle with a driver; drivers apply, are vetted, sign
an agreement, and are published. Schools are a separate B2B counterparty with
their own contract and per-trip order sheets.

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19 |
| Language | TypeScript, strict |
| Styling | Tailwind 4 |
| Database | PostgreSQL 18, accessed with `postgres` (not `pg`) + Drizzle |
| Validation | Zod 4 |
| Auth | Own implementation. DB-backed sessions, bcryptjs, RBAC in `src/lib/rbac.ts` |
| Object storage | S3-compatible (`STORAGE_DRIVER=s3`), currently Cloudflare R2 |
| Mail | Nodemailer over SMTP, or Resend over HTTPS |
| SMS | smsoffice.ge HTTP API |
| Tests | Vitest, 192 passing |

The codebase is heavily commented, and the comments explain *why* rather than
*what*. They are worth reading — several encode decisions that are not
obvious and that you would otherwise undo by accident.

## 2. Where it runs today

- **App:** Render web service `traveller` (`srv-da24ksbncjis738h3p00`),
  region Frankfurt, currently the **Free** plan, auto-deploying from `main`
  of `github.com/TornikeZ2Z/RoutePlanner`.
- **Database:** Neon Postgres, `eu-central-1`, pooled connection.
- **Object storage:** Cloudflare R2.
- **DNS:** Cloudflare, zones `routeplanner.ge` and `routegeorgia.ge`.
- **Mail:** Google Workspace on `routeplanner.ge`; Cloudflare Email Routing
  forwards `routegeorgia.ge` into the same inbox.

## 3. What actually has to move

The good news: this is a small migration. Verified against production on
2026-08-29.

**Database — 12 MB, 52 tables, 26 non-empty.** The largest table has 27 rows.
Real content is 27 locations, 5 tours with translations, 6 contract versions,
price bands, and 4 user accounts. There is **one** real driver (`SUBMITTED`,
not yet approved) and **zero** bookings.

**Object storage — empty.** `driver_documents` has zero rows. Nothing has
been uploaded that can be lost. If you migrate before drivers start uploading,
you never have to move a single file.

**Sessions are in the database** (`sessions`, 10 rows), so migrating the
database keeps people signed in. Losing them is harmless — everyone signs in
again.

**Postgres extensions required:** `pgcrypto` (for `gen_random_uuid()`),
`btree_gist` (for the driver-availability `EXCLUDE` constraint — the schema
will not build without it), `plpgsql`.

**Nothing about email or DNS moves.** See section 7.

---

## 4. Server prerequisites

- **Node.js ≥ 20.9.** Production currently runs Node 22. Use 22 LTS.
- **PostgreSQL 18** with the three extensions above. 16 or 17 will very
  probably work, but nothing has been tested on them.
- **Outbound HTTPS** to `smsoffice.ge`, and to the routing provider
  (`router.project-osrm.org` by default).
- **Outbound SMTP** on port 465 — *check this before you commit to a plan*.
  See section 7.
- A reverse proxy terminating TLS (nginx/Caddy) in front of `next start`.
- A process manager that restarts on failure and on boot (systemd or PM2).

The app is a long-running Node server, not a static export. It needs a real
process, not just a web root.

## 5. Migrating the repository

The history is worth keeping — the commit messages explain design decisions
that exist nowhere else.

```bash
git clone --mirror https://github.com/TornikeZ2Z/RoutePlanner.git
cd RoutePlanner.git
git remote set-url --push origin git@<new-host>:<owner>/routeplanner.git
git push --mirror
```

Then clone normally to work in. Afterwards:

- Point the new remote's CI/deploy hook at the new server.
- **Disconnect Render's auto-deploy** once the new host serves, or two
  environments will fight over the same database.

Repository conventions:

- **`npm ci`, never `npm install`,** in build or deploy. There is a
  `check:lockfile` script guarding this. `npm install` silently drifts the
  lockfile and has already caused one broken deploy.
- `.env` is not committed. `.env.example` and `.env.production.example` show
  the shape.
- `render.yaml` exists but is **not authoritative** — the Render service was
  created by hand, so only the dashboard settings ever applied. Do not trust
  it as a description of production. Delete it once you are off Render.

## 6. Migration runbook

Do this in order. Steps 1–6 are reversible; the cutover is step 7.

**1. Stand up Postgres.** Create the database and enable extensions:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

**2. Copy the data.** With 12 MB, a plain dump is fine:

```bash
pg_dump --no-owner --no-acl "$OLD_DATABASE_URL" > routeplanner.sql
psql "$NEW_DATABASE_URL" < routeplanner.sql
```

Use `pg_dump` from a client matching the **server** major version (18), or it
will refuse. Do not use `--clean`; you are restoring into an empty database.

**3. Verify the copy** before trusting it:

```sql
SELECT count(*) FROM schema_migrations;   -- expect 16
SELECT count(*) FROM users;               -- expect 4
SELECT count(*) FROM contract_versions;   -- expect 6
SELECT version, locale, published FROM contract_versions ORDER BY version;
```

**4. Build and run the app** with the new `DATABASE_URL`:

```bash
npm ci
npm run typecheck && npm test
npm run build
npm start
```

Tests must pass **before** you consider the environment good. 28 of the 192
are integration tests that run only when a database is reachable — they skip
silently otherwise. **If you see "28 skipped", your `DATABASE_URL` is not
reaching the test process,** and you have verified nothing about the database.

**5. Confirm health** on the new host, not through the old domain:

```bash
curl http://localhost:3000/api/health
```

Expect `{"status":"ok","build":"...","databaseMs":N}`. `status:"degraded"`
means the process is up but Postgres is unreachable — that is the failure this
endpoint exists to catch.

**6. Run migrations forward** (should be a no-op if the dump was current):

```bash
npm run db:migrate
```

**7. Cut over.** Lower the DNS TTL a day ahead. Then in Cloudflare, change the
`routeplanner.ge` A record from Render's IP to the new server, and the `www`
CNAME accordingly. Watch `/api/health` on the new host and the access log.

**8. Turn off Render** only after 24 hours of clean traffic, and after taking a
final dump in case anything was written during the overlap.

---

## 7. What does NOT move

**All mail configuration is on the domain, not the host.** DKIM, SPF, DMARC
and MX are DNS records on `routeplanner.ge`. They follow the domain and need
no work during the move. As of 2026-08-29 all four are correct and verified:

```
MX      routeplanner.ge         → smtp.google.com (priority 1)
SPF     routeplanner.ge         → v=spf1 include:_spf.google.com ~all
DKIM    google._domainkey       → active in Google Admin, key matches DNS exactly
DMARC   _dmarc.routeplanner.ge  → v=DMARC1; p=none; rua=mailto:info@routeplanner.ge; fo=1
DMARC   _dmarc.routegeorgia.ge  → v=DMARC1; p=none; rua=mailto:info@routegeorgia.ge; fo=1
```

`routegeorgia.ge` is the former trading name. It still receives mail through
Cloudflare Email Routing, forwarding to `info@routeplanner.ge`. Leave it.

**DMARC is deliberately `p=none`** — monitor, do not enforce. Once a few weeks
of aggregate reports confirm SPF and DKIM align on real sends, tighten to
`p=quarantine`, then `p=reject`. Do not jump straight to `reject`; that is how
people silently destroy their own deliverability.

The Google Workspace app password already provisioned for `info@routeplanner.ge`
works from any host. Carry `SMTP_PASSWORD` across unchanged.

---

## 8. Things that will bite you

### Outbound SMTP is blocked more often than you expect

This cost a full debugging cycle. Render's free plan blocks outbound ports
25, 465 and 587 — in their words, *"Free web services can't send outbound
network traffic on ports 25, 465, or 587, commonly used for SMTP."* The
symptom is not an auth error; it is a **connection timeout** that looks like a
credentials problem and is not.

Many ISPs and datacentres block the same ports. **Test this on the new server
before assuming mail works:**

```bash
nc -vz smtp.gmail.com 465
```

If it hangs, SMTP is blocked. The fallback is already in the codebase: set
`RESEND_API_KEY` and the app sends over HTTPS instead, no code change needed
(`getTransport()` in `src/lib/notifications.ts` prefers SMTP and falls back).
Resend needs its own DKIM record on the domain.

There is a test message sitting in the `notifications` outbox in `FAILED`
state from this diagnosis. It will retry and deliver itself the moment
sending works — a free end-to-end proof. Leave it there.

### `/api/health` reports the build, and that matters

`BUILD` comes from `RENDER_GIT_COMMIT`, which **only Render sets**. On the new
host it will report `"local"` and you lose the ability to tell which commit is
serving.

This is not cosmetic. A failed deploy leaves the *previous* version running and
returning HTTP 200 — a healthy response is exactly what a failed deploy looks
like from outside. That cost a run of deploys that looked fine and were not.

Set an equivalent at build time, e.g. in your deploy script:

```bash
export RENDER_GIT_COMMIT=$(git rev-parse HEAD)
npm run build
```

Better: rename it to something host-neutral in `src/app/api/health/route.ts`
and set that. Either way, **verify deploys by fingerprint, never by 200.**

### Two environment flags can take the site down instantly

- `ENFORCE_CANONICAL_HOST` — redirects the hosting subdomain to the custom
  domain.
- `REDIRECT_FORMER_DOMAIN` — redirects `routegeorgia.ge` to `routeplanner.ge`.

Both are opt-in *because enabling either before DNS resolves sends every
visitor to an address that does not answer.* Set them to `true` only after the
new host is confirmed serving on the real domain. The reasoning is written out
at length in `next.config.ts`; read it before changing either.

### Migrations are forward-only and must never be edited

`db/migrations/*.sql`, applied in filename order, each inside a transaction,
recorded in `schema_migrations`. **Never edit a migration that has been
applied anywhere.** Add a new one.

`0016` demonstrates the pattern for amending contract text: it *refuses to run
at all* if any signature exists, because rewriting text somebody has signed
would falsify the record.

### Georgian text is everywhere

Contracts, UI copy, place names. Everything must be UTF-8 end to end —
database, connection, terminal, editor. `psql` on a mis-set Windows console
will mangle Georgian and make you think the data is corrupt. It usually is
not. Verify through the application, not the console.

### Money is `bigint` minor units

Never floats. Tetri, not lari. `src/lib/money.ts` has the helpers. A booking
freezes its commission rate at creation so historic statements never change
retroactively.

---

## 9. Invariants enforced by the database

These are deliberate. If a migration or an ORM change trips one, the
constraint is almost certainly right and your code is wrong.

**Append-only tables.** UPDATE is refused by trigger on `audit_logs`,
`contract_signatures`, `school_agreement_signatures`, `ledger_entries`,
`booking_revisions`, `booking_status_history`, `driver_decisions`,
`support_notes`. Evidence that can be edited is not evidence.

**A driver cannot be published without a signed agreement.**
`driver_publish_requires_signature_trg` fires on the transition into
`published` and checks for a signature against the *currently published*
contract version. Drivers already live are not retroactively pulled down, but
the next publish applies the current rule.

**A school cannot be sent a confirmed booking without a signed agreement.**
`school_order_requires_agreement_trg`, same shape, on `school_orders`.

**Driver availability cannot overlap.** An `EXCLUDE USING gist` constraint —
this is why `btree_gist` is required.

**Contract signatures store a hash of the resolved text**, not a pointer to a
row that can later be edited. The hash covers the company details, the
commercial terms *and* the driver's own name and personal number as they were
at signing. Two drivers get different documents and different hashes; the
blank template is different again.

Rule of thumb: **if it is legal evidence or money, the database defends it and
the application cannot be trusted to.**

---

## 10. Environment variables

Secrets are marked ✱ — never commit them, never log them.

| Variable | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` ✱ | Postgres connection | Use a pooled endpoint |
| `SESSION_SECRET` ✱ | Signs sessions | ≥16 chars. Regenerate per environment |
| `APP_URL` | Public address | Canonical tags, email links, return URLs |
| `NODE_ENV` | `production` | |
| `PORT` | Listen port | |
| `ENFORCE_CANONICAL_HOST` | Redirect host → domain | **Leave `false` until DNS is live** |
| `REDIRECT_FORMER_DOMAIN` | routegeorgia → routeplanner | **Same warning** |
| `COMPANY_LEGAL_NAME` | Printed in every contract | |
| `COMPANY_ID_NUMBER` | Printed in every contract | `437377704` — set in the deployment environment, not defaulted in code. A second number, `405773322`, was given verbally and disagrees with this one; confirm against the registry extract before anyone signs. |
| `COMPANY_ADDRESS` | Printed in every contract | Still generic — see §12 |
| `SUPPORT_EMAIL` | Public contact | |
| `SUPPORT_PHONE` | Header/footer; hidden when empty | |
| `STORAGE_DRIVER` | `local` or `s3` | **`local` loses uploads on redeploy** |
| `S3_BUCKET` / `S3_ENDPOINT` / `S3_REGION` | Object storage | |
| `S3_ACCESS_KEY_ID` ✱ / `S3_SECRET_ACCESS_KEY` ✱ | Object storage | |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` | Mail | `smtp.gmail.com`, `465`, `info@routeplanner.ge` |
| `SMTP_PASSWORD` ✱ | Google app password | Works from any host |
| `MAIL_FROM` | Envelope sender | `Route Planner <info@routeplanner.ge>` |
| `RESEND_API_KEY` ✱ | HTTPS mail fallback | Only if SMTP ports are blocked |
| `SMSOFFICE_API_KEY` ✱ | SMS gateway | |
| `SMSOFFICE_SENDER` | SMS sender name | `RoutePlan` — see below |
| `ROUTING_PROVIDER` | `osrm` or `haversine` | `osrm` is a free public service |
| `ROUTING_API_KEY` ✱ | Paid routing, if used | |
| `COMMISSION_RATE_BPS` | Fallback only | Live value is in `platform_settings` |

**The SMS sender name has a trap.** smsoffice.ge allows only letters, digits,
`-` and `.`, maximum 11 characters — **no spaces.** "Route Plan" cannot be
registered. It is `RoutePlan`, and the code sanitises anything else with a
one-time warning (`normalizeSender`). The value here must match exactly what
smsoffice has approved.

Commercial terms — commission, settlement cycle, notice period, school
cancellation ladder — live in `platform_settings` and are editable from
`/admin/pricing`, **not** in environment variables. They are substituted into
contract text at render time, so changing one changes the next contract
anybody opens and nothing already signed.

---

## 11. Verification checklist

Run all of this against the new host before cutting DNS, and again after.

```bash
npm run typecheck                    # clean
npm test                             # 192 tests; all pass with a DB reachable
curl -s localhost:3000/api/health    # status ok, build = the commit you deployed
```

Then by hand:

- [ ] `/`, `/ka`, `/en`, `/ru` all render
- [ ] `/ka/schools` shows the three packages and the Safety Coordinator section
- [ ] `/login` accepts the admin account
- [ ] `/admin` loads; `/admin/schools` lists schools
- [ ] `/admin/pricing` shows commission **15.00%** and the agreement terms form
- [ ] `/driver/contract` renders the agreement **with no `{{PLACEHOLDER}}` text
      and no `____________` blanks** on the company side
- [ ] A search returns priced offers (exercises the routing provider)
- [ ] Uploading a driver document succeeds and reads back (exercises S3)

That contract check is the one people skip. A leaked placeholder in a legal
document is the failure mode the whole substitution layer exists to prevent,
and `tests/contract-render.test.ts` guards it — but only against a database it
can reach.

---

## 12. Open items at handover

Ordered by how much they matter.

1. **Mail cannot send yet.** Blocked only by the Render port restriction.
   Everything else — DNS, DKIM, DMARC, app password, app config — is done and
   verified. On a server with outbound 465 it should work immediately.
2. **`COMPANY_ADDRESS` is the generic "თბილისი, საქართველო"** rather than the
   registered street address. It prints in every contract. Not blocking, but
   it should be the real address before volume.
3. **`SMSOFFICE_SENDER` awaits approval** from smsoffice.ge. Key and sender are
   both configured; SMS starts working when they approve `RoutePlan`.
4. **One driver is waiting.** Sandro Avsajanishvili, status `SUBMITTED`. The
   flow is: approve the application and the vehicle in `/admin/drivers/<id>`,
   then he can enter his personal number and address and sign the agreement,
   then he can be published.
5. **Schools have a contract and an admin section but no self-service portal.**
   Deliberate. Schools are managed by operations; they sign on paper and
   operations raises the order sheets. Do not assume a portal was forgotten.
6. **Deferred by design:** return-leg/last-minute transfer board (needs fleet
   density to be useful), and automatic commission collection (needs a payment
   provider decision).

---

## 13. Where to look in the code

| Concern | File |
|---|---|
| Configuration and env validation | `src/lib/config.ts` |
| Contracts, signing, placeholder substitution | `src/lib/contract.ts` |
| Schools, agreements, order sheets | `src/lib/schools.ts` |
| Pricing engine (versioned, deterministic) | `src/lib/pricing/engine.ts` |
| Commercial settings | `src/lib/settings.ts` |
| Mail and SMS transports | `src/lib/notifications.ts` |
| Permissions | `src/lib/rbac.ts` |
| Object storage | `src/lib/storage/index.ts` |
| Schema history | `db/migrations/` |
| Design decisions and their reasoning | `DECISIONS.md` |

`DECISIONS.md` and the migration comments are the real documentation. The
comments explain why something is the way it is, which is the part you cannot
reconstruct from the code.

---

*Anything unclear here is a defect in this document. It was written with full
access to the running system; if it does not match what you find, trust what
you find and correct this file.*
