# Decision log

Choices baked into the code. Each one is reversible, but not cheaply — they
affect data, money or legal position. Read before changing.

## Settled in code

| Decision | Where | Notes |
|---|---|---|
| Money is integer minor units (tetri) as `bigint` | `src/lib/money.ts`, all `*_minor` columns | Floats are not permitted anywhere near a price |
| Canonical currency is GEL | `CANONICAL_CURRENCY` | Display currency is presentational only |
| Commission 15%, frozen per booking | `COMMISSION_RATE_BPS`, `bookings.commission_rate_bps` | Rate changes never rewrite history |
| Prices round to 0.50 GEL | `PRICE_ROUNDING_STEP_MINOR` | Applied once, at the end, before the split |
| Quotes are immutable snapshots | `quotes.inputs`, `quotes.breakdown` | Replayable months later |
| Driver overlap is a database constraint | `availability_no_overlap` | Not an application check |
| Audit log is append-only | trigger on `audit_logs` | UPDATE and DELETE raise |
| RBAC denies by default | `src/lib/rbac.ts` | Server-side on every action |
| Approval and publication are separate | `admin.drivers.decide` vs `.publish` | Different permissions |
| Sessions are opaque tokens, hashed at rest | `sessions.token_hash` | Staff sessions expire in 8 hours |
| Single Next.js app, not a five-app monorepo | — | Same module boundaries as folders; split later if ever needed |
| PostGIS deferred | `locations.lat/lon` | Nothing in Phase 1 needs geospatial queries. Add when radius search or service-area polygons arrive |
| jsonb params use `::text::jsonb` | `offers.ts`, `seed.ts` | postgres.js double-encodes any string bound to a jsonb column. Under test in `db.test.ts` |
| GEL is the only charge currency | `currency.ts` | USD/EUR are display conversions from a timestamped snapshot and are labelled as guidance |
| Brand palette | `globals.css` | Wine red #7B2936 primary, forest green #26483E for verified states, limestone #F4EFE6 background, charcoal #202625 text, muted gold #C99A45 for attention. Error red is deliberately NOT the wine brand colour |

## Changed from the original specification

**Pricing formula.** The spec priced everything as
`distance × rate_per_km × vehicle_factor`. That cannot express Georgian
intercity economics: on a one-way run the driver returns empty, and with one
per-km rate the only way to cover that is to inflate the rate, which then
overprices every short trip. The empty return is now an explicit input —
`return_km` and `deadhead_recovery_bps` per route family — so one honest driver
rate works for both a 18 km airport transfer and a 156 km mountain run.
`vehicle_factor` was dropped: the price plan already belongs to a specific
vehicle, so a class multiplier double-counted. Class now selects the price
*band* instead.

**Ranking weights.** The spec put 0.30 on price. In a marketplace where drivers
set their own prices, that makes undercutting the only way to rank. Lowered to
0.20, with rating and reliability raised. New drivers get a bounded exploration
allowance rather than a zero on signals they cannot yet have.

**Insurance requirement.** The spec asked for "insurance: policy, provider,
coverage type". A standard private motor policy usually excludes carrying
passengers for payment, so that check would have passed while leaving the
largest liability uncovered. The driver upload page now states that passenger
cover is required, and publication is blocked without an approved policy.

## Payment sequencing — decided

Cash and card ship together, and the ledger ships **with** them rather than a
phase later. `REVIEW.md` flagged that the original plan accrued commission debt
during the pilot with no system to record it. The resolution:

* A cash trip posts a commission receivable against the driver at completion.
* Each driver has a wallet with a credit limit (default 200 GEL).
* Once unpaid commission exceeds the limit, that driver stops being offered
  **cash** work. Card work is unaffected, so they can keep earning and settle.
* Card trips post to a clearing account, then split into driver payable and
  platform revenue. Nothing is derived from booking rows.

Cash is not optional in Georgian tourism, so removing it was never the answer.
Tracking it properly was.

## Still needs your decision

| Question | Current default | Decide before |
|---|---|---|
| Legal entity name and registration | Trading as Route Planner; entity not yet formed | Taking real payment |
| Driver credit limit | 200 GEL of unpaid commission | Pilot — tune from real behaviour |
| Payment provider | Sandbox stub behind an adapter | Taking real money |
| Cancellation policy | Free, not yet enforced | Checkout |
| Driver classification (contractor vs employee) | Assumed contractor | Any real payout |
| Who is merchant of record | Undecided | Payment provider contract |
| Deadhead recovery per route | Seeded estimates | Pilot — these are the first numbers to revise from data |
| Passenger transport licensing | Not assessed | Real bookings |

The last three are the ones that need a Georgian lawyer and accountant, not a
developer.

## Round trips are priced as one journey, not two

A wait-and-return books one driver for the whole span: both directions are
billed at the driver's per-km rate, the deadhead recovery disappears (the
driver comes home loaded), overnights are charged when the return crosses a
calendar day, and the calendar is blocked from pickup to return. This makes a
round trip reliably cheaper than two one-way bookings — which is the honest
economics and the selling point. Historic quote snapshots carry no roundTrip
field and replay byte-identically.

## Hourly hire is an inquiry, not a price

There are no per-hour rates in driver price plans yet, so the Hourly tab
routes to a form that lands in the support queue. Showing a made-up hourly
price would violate the "the price you see is the price" promise.

## No partner logos until there are partners

The approved mockup shows hotel and airport logos. Displaying trademarks of
companies we have no agreement with is both a legal exposure and a false
claim, so the partners strip stays out until real agreements exist.

## 2026-08-27 — Renamed to Route Planner

The name RouteGeorgia was already taken, so the platform now trades as
**Route Planner** on routeplanner.ge. Three things deliberately did not move:

* **The company.** The National Agency of Public Registry has the entity
  registered as რაუტ ჯორჯია / ROUTE GEORGIA. A contract has to name the party
  that exists, so the driver agreement still names it and now states that it
  trades under the name Route Planner.
* **The old domain.** routegeorgia.ge stays ours and stays attached to the
  service. Every link shared before the rename points there. It will redirect
  once the new domain resolves — gated behind REDIRECT_FORMER_DOMAIN, because
  turning it on early would send visitors from a working site to a dead one.
* **Applied migrations.** 0010–0013 keep the old brand in their text. They are
  the record of what ran; 0014 is what changed the database.

The word "Georgia" on its own is the country and appears throughout the copy.
Only the four brand forms were replaced.
