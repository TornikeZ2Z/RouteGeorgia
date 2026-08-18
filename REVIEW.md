# Review of the Technical Specification

Assessment of `Georgia_Travel_Marketplace_Technical_Specification.docx`
(v1.0, 18 August 2026), and what this codebase does differently.

The specification is well above the standard for seed-stage documentation.
The engineering core is sound and correctly opinionated: modular monolith over
microservices, Postgres as operational truth with Redis as accelerator only,
outbox pattern, exclusion constraint for driver overlap, money in integer minor
units, quote snapshot immutability, idempotency keys on money paths. The
13-state booking machine is complete. The acceptance-scenario table is the
strongest section — those are real tests, not aspirations.

What follows is where it will cause problems.

---

## 1. The pricing formula cannot express Georgian route economics

**The problem.** The spec prices every trip as:

```
route_cost = max(driver_minimum, distance_km * rate_per_km + minutes * rate_per_min)
gross      = route_cost * vehicle_factor * risk * season + addons
```

This assumes one per-km rate works for both Tbilisi→Mtskheta (25 km) and
Tbilisi→Batumi (372 km). It cannot. On a one-way intercity run the driver
returns empty, and that empty return is frequently the largest single cost.
Neither `return_km` nor any deadhead concept appears anywhere in the formula —
the only place a return leg is mentioned in the whole document is availability
blocking.

Drivers will respond rationally: inflate the per-km rate until Batumi is
viable. That same rate then makes every airport transfer uncompetitive. The
platform will read this as "our drivers are too expensive" when it is actually
a modelling failure.

A second, smaller error: `vehicle_factor` multiplies a rate the driver has
already set for that specific vehicle. A driver with a Land Cruiser prices the
Land Cruiser into their own rate, then gets a class multiplier on top.

**What this codebase does.** The empty return is an explicit, auditable input
on each route family:

- `return_km` — how far the driver must deadhead back
- `deadhead_recovery_bps` — what share of that the customer pays

City transfers recover ~10% (the driver finds a return fare easily). Remote
Svaneti recovers ~85% (nobody hires them in Mestia for the trip home). One
honest driver rate now works across the whole route book. `vehicle_factor` is
gone; vehicle class selects the price *band* that constrains the driver
instead.

`tests/pricing.test.ts` contains the case directly: the same 1.50 GEL/km rate
produces a believable airport transfer *and* a viable mountain run.

Multi-day work also has no cost model in the spec. Driver accommodation and
meals are real money on a 2–10 day itinerary. There is an `overnight_fee` input
here, but the multi-day builder itself is not built.

## 2. Cash bookings ship a phase before the ledger that tracks them

Phase 2 delivers "cash booking" end-to-end. Phase 3 delivers "ledger, cash
receivable". So the pilot accrues commission debt with no system to record it,
during exactly the period when the operator has least leverage over drivers.

Cash is also the payment mode with the highest disintermediation risk: the
driver holds 100% of the money and owes you 15% on trust. Running the entire
validation phase on it, before the wallet and credit-limit machinery exists, is
the sequencing most likely to lose real money.

**Suggested change.** Card first, or require a prepaid driver wallet before any
cash order is accepted. If cash must come first, the ledger moves to Phase 2
with it — they are one deliverable, not two.

## 3. Cash refunds are a hole in the ledger design

The commission table has a row for "partial refund after service" with an
"explicit allocation rule". On a card booking that works. On a cash booking the
platform never held the money — the driver collected all of it. A refund
therefore means paying out of pocket or clawing back against the commission
receivable, and neither path is specified anywhere.

This will surface in the first week of a pilot, because cash is the launch
payment mode.

## 4. "Instant confirmation" is a promise 30 drivers cannot keep

The MVP promises immediate confirmation for a chosen driver. It depends on
driver-maintained availability calendars, and drivers do not maintain
calendars — this is close to a universal finding in supply marketplaces.

The stated mitigation is a 10-minute acknowledgement SLA plus reassignment. But
reassignment needs an eligible replacement, and with 30 pilot drivers spread
over 5–10 route families the replacement pool for any given slot is often
empty. The promise breaks precisely when it matters.

**Suggested change.** Instant confirmation on your core route families where
you can guarantee depth; request-to-book with a fast human response everywhere
else. Under-promising here is much cheaper than a failed airport pickup.

## 5. The insurance check would pass while leaving the real exposure uncovered

The verification table requires insurance "policy/provider, coverage type,
expiry, vehicle match". A standard Georgian private motor policy typically
excludes carrying passengers for hire or reward. A driver can satisfy every
listed field with a policy that does not cover the activity at all.

This is the largest uninsured liability in the document and it reads as a
checkbox. Passenger/commercial cover needs to be named explicitly, and
publication blocked without it.

Related: passenger transport licensing for intercity private hire is not
mentioned. The spec flags payment licensing and data protection for legal
review but not this.

---

## Structural issue

The document is headed "market-validation MVP" and then specifies a production
marketplace: 12 backend modules, three front-ends, ten RBAC roles, double-entry
ledger, moderation queues, CMS, partner attribution, WCAG 2.2 AA, 99.9%
availability. Phases 0–4 before launch.

For a solo founder with AI assistance that is realistically six to twelve months
before the first paying customer. The question being validated — will tourists
pre-book a private driver online — could be answered in weeks with a landing
page, ten drivers and a manual process.

Those are two different documents, and the roadmap has inherited the wrong one.
This codebase builds the production shape you asked for, but the observation
stands: consider running a manual pilot in parallel rather than in series.

---

## Gaps

**Demand.** Supply onboarding is specified exhaustively. Acquisition is SEO
pages plus hotel QR codes. The benchmark's actual moat is years of accumulated
SEO and review volume — you launch against that with zero reviews, on a UI that
displays review count prominently. There is no mention of OTA distribution
(Viator, GetYourGuide), which is where a large share of Georgia transfer demand
actually books today.

**Ranking cold start.** `acknowledgement_reliability` and
`low_cancellation_score` are 25% of the recommended score and are unmeasurable
at launch. Weighting price at 0.30 in a driver-priced marketplace also
engineers a race to the bottom — undercutting becomes the only ranking lever a
driver has. Lowered to 0.20 here, with an explicit exploration allowance for
drivers who have no history yet.

**API cost.** Places autocomplete plus Distance Matrix at the stated 100
concurrent searches is a real line item for a bootstrapped build. Caching is
mentioned; a budget is not. This codebase ships a zero-cost estimator behind an
adapter so the decision can be deferred, not avoided.

**Driver compensation for late customer cancellation.** Absent from the ledger
design entirely. Free cancellation is customer-friendly and correct for
validation, but a driver who blocked a day and gets nothing is the fastest way
to lose your best supply. Track it from day one even while the fee is zero.

---

## Summary

Fix before writing more code: the pricing model, the cash/ledger sequencing,
and the insurance requirement. The first is implemented here; the second and
third are decisions only you can make.

Everything else is refinement of an already-strong document.
