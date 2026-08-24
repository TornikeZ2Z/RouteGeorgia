# RouteGeorgia — private-driver marketplace

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

### File storage

Driver documents — identity papers and driving licences — and vehicle
photographs are uploaded to object storage. There are two settings:

`STORAGE_DRIVER=local` writes to `.storage/` in the working directory. Fine on
your own machine; **never in production**. A container filesystem is discarded
on every deploy, so a driver's passport disappears the next time anyone ships a
change. The app logs a loud error if it starts this way in production.

`STORAGE_DRIVER=s3` uses any S3-compatible store. Cloudflare R2 is the cheaper
fit: no egress charge, and files are streamed through the app rather than served
from the bucket.

**Setting up R2**, which takes about five minutes:

1. Cloudflare dashboard → **R2** → *Create bucket*. Name it `routegeorgia-files`.
   Location: automatic. Leave public access **off** — the app streams every file
   itself, so the bucket never needs to be reachable from the internet.
2. **R2 → Manage API tokens → Create API token**. Permission: *Object Read &
   Write*, scoped to that one bucket. Copy the Access Key ID and Secret Access
   Key; the secret is shown once.
3. Note your account endpoint, shown on the bucket's settings page as
   `https://<account-id>.r2.cloudflarestorage.com`.
4. Put these in Render (Environment → Add environment variable):

   | Name | Value |
   |---|---|
   | `STORAGE_DRIVER` | `s3` |
   | `S3_BUCKET` | `routegeorgia-files` |
   | `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
   | `S3_REGION` | `auto` |
   | `S3_ACCESS_KEY_ID` | from step 2 |
   | `S3_SECRET_ACCESS_KEY` | from step 2 |

The app **refuses to start** if `STORAGE_DRIVER=s3` and any of the bucket or
credentials are missing, rather than accepting an application and losing the
documents halfway through. A wrong secret shows up as a failed upload with the
provider's error in the server log.

For AWS S3 instead of R2, omit `S3_ENDPOINT` and set `S3_REGION` to the bucket's
real region.

**Two prefixes, one bucket.** `public-media/` holds vehicle photographs;
`restricted-kyc/` holds identity documents. They are separate so a bucket policy
can deny everything under `restricted-kyc/` independently. Nothing is ever
served straight from the bucket: public photos go through `/api/media/...`, and
KYC documents only through `/api/admin/documents/[id]`, which checks the
reviewer's permission and writes an audit entry for every single view. The
adapter refuses to produce a signed URL for a restricted object at all — a
presigned link is bearer access that leaves no record of being used.

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

### The lock file

The deploy runs `npm ci`, which refuses to install a `package-lock.json` that
disagrees with `package.json` — and two npm majors disagree about how this
project's dependencies resolve. Render runs **Node 22, which ships npm 10**. A
lock file written by npm 11 nests `esbuild` differently and npm 10 rejects it
with `Missing: esbuild@... from lock file`, so the build fails while everything
passes locally.

If you are on Node 24 or newer, regenerate and verify with npm 10:

```bash
npx npm@10 install --package-lock-only
npx npm@10 ci
```

Both must succeed before pushing. `npm ci` on your own npm is not evidence: it
is a different resolver reading the same file.

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
Profile, languages, vehicle, photo upload, documents with expiry tracking,
versioned price plans, availability calendar, **an order inbox with
acknowledgement, decline, trip milestones and cash confirmation, plus an
earnings page driven from the ledger.**

**Driver application** (`/en/drive`, `/ka/drive`, `/ru/drive`)
One public page a prospective driver can be sent a link to. It collects their
details, languages, vehicle and KYC documents, then creates the account, the
profile in the verification queue as SUBMITTED, the vehicle and the documents
as PENDING, and emails them a link to set their password. An application
grants nothing: approval and publication remain separate, staffed decisions.
Applying does not reveal whether an address already has an account.

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

89 tests. The database ones skip cleanly if Postgres is not running.

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
  server's filesystem, which is wiped on every deploy. See "File storage"
  below — the adapter is built, it just needs a bucket and four values.
- **Replace the routing provider.** The bundled estimator approximates road
  distance; quoted distance is a price input and a promise to the customer.
- **Replace the payment provider.** The sandbox settles without moving money.
  A real Georgian acquirer needs a legal entity and a merchant agreement.

## Going to production

You are already on a managed Postgres if you followed the recommended setup, so
there is nothing to migrate. Before real customers:

- Replace the routing provider with real road routing.
- Point `STORAGE_DRIVER` at a bucket, with the `restricted-kyc/` prefix denied
  public access.
- Put a real secret in `SESSION_SECRET` and delete every seeded account.
- Add MFA for staff. The schema has the column; the flow is not built.

Read `DECISIONS.md` before changing commission, cancellation or pricing
policy, and `REVIEW.md` for the open problems in the original specification.
