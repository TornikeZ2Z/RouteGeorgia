# Route Georgia — private-driver marketplace

Phase 0 (foundation) and Phase 1 (supply and pricing) of the Georgia Travel
Marketplace specification, as a running application.

Live at <https://routegeorgia.ge>.

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

### Photos and public contact details

The design is photo-ready but ships with illustrated placeholders. Drop
licensed JPGs into `public/photos/` (see the README there for the expected
filenames) and the hero, service cards and About sections switch to them
automatically on the next deploy. Never commit photos you do not have the
rights to.

Set `SUPPORT_PHONE` in Render once the business SIM exists; the header and
footer show it automatically. `SUPPORT_EMAIL` defaults to
support@routegeorgia.ge — that mailbox must actually exist before launch.

### Demo data vs launch data

`db:seed` builds a full synthetic marketplace — 34 fake drivers with fabricated
ratings, trip counts and "verified" languages. That is right for development
and wrong for a public site: real visitors would see social proof nothing
earned, and could book drivers who do not exist.

When you are ready to trade, reset to reference data only:

```bash
ADMIN_EMAIL=you@yourdomain npm run db:seed:launch
```

Locations, routes, price bands and tours stay; supply is empty until real
drivers are onboarded at `/admin/drivers`; one administrator is created and
its one-time password printed once. Both seeds refuse to run against a
database that already contains bookings unless `FORCE_RESET=yes` — seeding
must never be able to erase trading history by accident.

### Sign-in accounts

`db:seed` prints a **freshly generated password** for all seeded accounts —
copy it from the terminal output. Set `SEED_PASSWORD` first if you want a
stable one locally:

```bash
SEED_PASSWORD=letmein-locally npm run db:seed
```

The password is generated rather than published because this seed gets run
against databases that public deployments read from. A fixed password in a
README is a way into a live operations console.

Every seeded account is fake. Delete them before real customers arrive.

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
| `npm run ship` | Type check, test, commit and push in one step |
| `npm test` | Run the test suite |
| `npm run typecheck` | Type check without building |
| `npm run build` | Production build |
| `npm run db:studio` | Browse the database in a GUI |
| `npm run db:seed` | Reload the test data from scratch |
| `npm run db:start` / `db:stop` | Local database only, not needed with a hosted one |

---

## What is built

**Public site** (`/en`, `/ka`, `/ru`)
Route builder with intermediate stops, filtered and sorted search over real
per-vehicle quotes, driver profiles with photo galleries and published reviews,
indexable route landing pages, a curated **tours catalogue** with written
itineraries, FAQ, sitemap, GEL/USD/EUR display currency.
**Checkout, booking, cash and card payment, a confirmation page, guest
manage-booking with cancellation, and booking-scoped messaging.** Every price
shows its full breakdown, and "Recommended" explains itself.

**Driver app** (`/driver`)
Application, languages, vehicle, photo upload, documents with expiry tracking,
versioned price plans, availability calendar, **an order inbox with
acknowledgement, decline, trip milestones and cash confirmation, plus an
earnings page driven from the ledger.**

**Operations console** (`/admin`)
Verification queue, document, vehicle and photo decisions with mandatory
reasons, language-interview recording, publish gate, **booking command centre
with acknowledgement-SLA alerts, review moderation**, locations and route
families, price bands, append-only audit log.

**Underneath**
Deny-by-default RBAC, opaque hashed session tokens, immutable quote snapshots
with replay, money as integer minor units throughout, and a database that
refuses to let a driver be double-booked.

## Security

Write endpoints reject cross-origin requests, sign-in and booking are rate
limited per address, and the site sends a strict Content-Security-Policy plus
HSTS. Nothing loads from a third party — no font CDN, no analytics script — so
the policy is genuinely restrictive rather than a list of exceptions.

Passwords are bcrypt, sessions are opaque tokens stored only as hashes, and a
password reset ends every existing session.

## What is deliberately not built

The partner/affiliate programme, driver payout execution, and live trip
tracking. Notifications print to the server
console rather than sending email — the outbox, templates and delivery
tracking are real, only the transport is a stub.

The routing and payment providers are working stubs behind adapters. Both are
a configuration change away from real ones, and both must be replaced before
taking real money. See `REVIEW.md`.

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

58 tests. The database ones skip cleanly if Postgres is not running.

They cover the things that are expensive to get wrong: rounding at scale,
quote determinism and replay, price bands, RBAC denials, and — against a real
database — the booking race (two transactions, one driver, one winner), audit
log immutability, and the constraint that stops an unapproved driver going live.

## Putting it online

Vercel hosts Next.js natively, deploys on every push, and has a free tier.
GitHub stores the code; it cannot run it.

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. Import the `traveller` repository.
3. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | your Neon connection string (the **pooled** one) |
   | `SESSION_SECRET` | a **new** 64-character hex string, not your local one |

   Generate the secret with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Leave `APP_URL` unset — it is derived from the deployment URL automatically.

4. Click **Deploy**. The build runs migrations first, then compiles.
5. Your site is live at `https://traveller-<something>.vercel.app`.

Every `git push` to `main` redeploys. Pull requests get their own preview URL.

### Before you share the link with anyone real

- **Delete the seeded accounts.** They are demonstration data with a
  generated password. Run `db:seed` only against a development database.
- **Move file storage off local disk.** `STORAGE_DRIVER=local` writes to the
  server's filesystem, which is wiped on every Vercel deploy. Driver documents
  and vehicle photos need S3 or Cloudflare R2 first.
- **Replace the routing provider.** The bundled estimator approximates road
  distance; quoted distance is a price input and a promise to the customer.
- **Replace the payment provider.** The sandbox settles without moving money.
  A real Georgian acquirer needs a legal entity and a merchant agreement.

## Going to production

You are already on a managed Postgres if you followed the recommended setup, so
there is nothing to migrate. Before real customers:

- Replace the routing provider with real road routing.
- Replace local file storage with S3 or R2, with the KYC prefix locked down.
- Put a real secret in `SESSION_SECRET` and delete every seeded account.
- Add MFA for staff. The schema has the column; the flow is not built.

Read `DECISIONS.md` before changing commission, cancellation or pricing
policy, and `REVIEW.md` for the open problems in the original specification.
