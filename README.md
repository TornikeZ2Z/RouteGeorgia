# Gamgzavri — Georgia private-driver marketplace

Phase 0 (foundation) and Phase 1 (supply and pricing) of the Georgia Travel
Marketplace specification, as a running application.

Working name only. Pick a real brand before anything goes public.

---

## What you need

Node.js 20 or newer, and a Postgres database.

Check Node with `node --version`. If it is missing, install the LTS build from
<https://nodejs.org>, then open a **new** terminal window — the PATH only
updates for new windows.

## Getting it running

```bash
npm install
```

If npm reports that install scripts were blocked (npm 11 and newer does this by
default), approve them before going further, or `tsx` will not run:

```bash
npm approve-scripts esbuild
npm approve-scripts @embedded-postgres/windows-x64   # only if you want the local database
npm rebuild
npx tsx --version                                    # should print a version
```

### Database — pick one

**Hosted (recommended).** Create a free project at <https://neon.tech> or
<https://supabase.com>, copy the connection string, and put it in `.env`:

```
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
```

If `.env` does not exist yet, copy `.env.example` to `.env` first and generate a
session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Local, no account needed.** `npm run db:start` downloads and runs a private
Postgres — no Docker required. Convenient on macOS and Linux. On Windows the
bundled build is a beta and can hang during first-time initialisation; if
`db:start` sits on "Initialising" for more than 90 seconds, use a hosted
database instead rather than debugging it.

### Then

```bash
npm run db:migrate   # create the schema
npm run db:seed      # load 34 test drivers, 15 locations, 14 routes
npm run dev          # http://localhost:3000
```

### Sign-in accounts

All seeded accounts use the password `GamgzavriDev2026!`.
Every one of them is fake. Delete them before you deploy anything.

| Email | Role | What they can do |
|---|---|---|
| `admin@example.com` | Super admin | Everything, including the audit log |
| `ops@example.com` | Operations manager | Approve drivers, verify documents, publish |
| `support@example.com` | Support agent | Read only — decisions are blocked |
| `finance@example.com` | Finance admin | Money surfaces (not built yet) |
| `driver1@example.com` | Published driver | Profile, vehicle, pricing, availability |
| `driver27@example.com` | Applicant | Sits in the verification queue |

Worth trying: sign in as `support@example.com` and open a driver record. You
can read it, but the decision panel is gone and `/admin/locations` returns an
error. That is server-side RBAC, not a hidden button.

### Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm test` | Run the test suite |
| `npm run typecheck` | Type check without building |
| `npm run build` | Production build |
| `npm run db:studio` | Browse the database in a GUI |
| `npm run db:seed` | Reload the test data from scratch |
| `npm run db:start` / `db:stop` | Local database only, not needed with a hosted one |

---

## What is built

**Public site** (`/en`, `/ka`, `/ru`)
Route builder with intermediate stops, search results with real per-vehicle
quotes, filters (class, language, 4x4, child seat, pets, Wi-Fi, rating) and
sorting, driver profiles with photo galleries, indexable route landing pages at
`/transfers/from-x-to-y`, an FAQ, a sitemap and GEL/USD/EUR display currency.
Every price shows its full breakdown, and "Recommended" explains itself.

**Driver app** (`/driver`)
Application, languages, vehicle, photo upload, document upload with expiry
tracking, versioned price plans, availability calendar.

**Operations console** (`/admin`)
Verification queue, document and vehicle decisions with mandatory reasons,
photo moderation queue, language-interview recording, publish gate, locations
and route families, price bands, append-only audit log.

**Underneath**
Deny-by-default RBAC, opaque hashed session tokens, immutable quote snapshots
with replay, money as integer minor units throughout, and a database that
refuses to let a driver be double-booked.

## What is deliberately not built

No booking, no payments, no ledger, no chat, no reviews, no notifications.
Those are Phases 2 and 3. The search flow issues real quotes and stops before
checkout, on purpose — see `REVIEW.md` for why the original phase order needs
changing before you build them.

The routing provider is a distance estimate, not road routing. Fine for
development; replace it before quoting real customers.

---

## How it is organised

```
db/
  migrations/0001_baseline.sql   plain SQL, the source of truth for the schema
  schema.ts                      Drizzle mirror, used for queries
  seed.ts                        synthetic test data
scripts/pg.mjs                   local Postgres control
src/
  lib/
    config.ts        typed environment; nothing else reads process.env
    money.ts         integer minor units, all rounding lives here
    pricing/engine.ts  pure, deterministic quote calculation
    rbac.ts          roles and permissions
    auth/            password hashing, sessions
    availability.ts  calendar; overlap enforced by the database
    offers.ts        search: routing + eligibility + pricing + ranking
    routing/         directions provider adapter
    storage/         object storage adapter
    i18n/            EN, KA, RU with observable fallback
  app/
    [locale]/        public site
    driver/          driver app
    admin/           operations console
tests/               invariant and integration tests
```

Two rules worth keeping:

1. **Money never touches a float.** It is `bigint` minor units from the
   database to the screen. `src/lib/money.ts` owns every rounding decision.
2. **The database enforces what matters.** Driver overlap, audit immutability,
   the commission split, and "only approved drivers can be published" are
   constraints and triggers. Application code is a second line of defence.

## Tests

```bash
npm test
```

37 tests. The database ones skip cleanly if Postgres is not running.

They cover the things that are expensive to get wrong: rounding at scale,
quote determinism and replay, price bands, RBAC denials, and — against a real
database — the booking race (two transactions, one driver, one winner), audit
log immutability, and the constraint that stops an unapproved driver going live.

## Going to production

You are already on a managed Postgres if you followed the recommended setup, so
there is nothing to migrate. Before real customers:

- Replace the routing provider with real road routing.
- Replace local file storage with S3 or R2, with the KYC prefix locked down.
- Put a real secret in `SESSION_SECRET` and delete every seeded account.
- Add MFA for staff. The schema has the column; the flow is not built.

Read `DECISIONS.md` before changing commission, cancellation or pricing
policy, and `REVIEW.md` for the open problems in the original specification.
