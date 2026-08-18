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

## Still needs your decision

| Question | Current default | Decide before |
|---|---|---|
| Brand and legal entity name | "Gamgzavri" placeholder | Any public content |
| Cash vs card first | Neither is built | Phase 2 — see `REVIEW.md`, cash-first is the riskier order |
| Cancellation policy | Free, not yet enforced | Checkout |
| Driver classification (contractor vs employee) | Assumed contractor | Any real payout |
| Who is merchant of record | Undecided | Payment provider contract |
| Deadhead recovery per route | Seeded estimates | Pilot — these are the first numbers to revise from data |
| Passenger transport licensing | Not assessed | Real bookings |

The last three are the ones that need a Georgian lawyer and accountant, not a
developer.
