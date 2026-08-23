# RouteGeorgia — Website Modernization Plan

*Prepared 23 Aug 2026, against the Route Georgia Design System v1.0 ("Round 1" identity).*

## Where we stand

The site is live on the navy/gold identity with the customer journey verified end-to-end (search → checkout → confirmation, tours, language switching). But it was built *toward* the identity sheets before the full design-system package existed. Now that the package is here, an audit against it shows the site is roughly 80% aligned: colors and Montserrat match, but the logo is a stand-in, the body typeface is wrong, several component rules are violated, and the accessibility baseline is only partly met.

This plan is split into what I will implement (Phases 1–4) and what only you can do (Phase 5 and Operations). Each phase is one deploy.

---

## Phase 1 — Brand correctness (the logo)

**The problem.** The site header, footer, favicon and share card use an R-monogram I drew in code as a placeholder. The design system contains the real mark: a large R whose negative space forms a winding road, with gold dashes tracing the centre line — a much richer drawing, with strict usage rules.

**What I will do:**

1. Replace the coded monogram with the real vector paths from the package: `mark-primary.svg` on light surfaces, `mark-reverse.svg` on the navy header and dark panels, `mark-mono.svg` reserved for print contexts.
2. Use `lockup-horizontal.svg` (mark + ROUTE / GEORGIA wordmark) as the default signature in the header and footer, per the logo hierarchy — the standalone mark only where the name is visible nearby.
3. Regenerate the favicon set from `favicon.svg` and rebuild `og.jpg` (the social share card) with the real mark.
4. Respect the rulebook: minimum sizes (160 px lockup / 24 px mark), clear space of one road-width, no shadows, no gradients, no recolored road.
5. Put the raw SVGs in the repo under `public/brand/` so emails and future materials pull from one source.

## Phase 2 — Design-token alignment

The site's Tailwind tokens are close but not identical to `tokens.json`. I will align them exactly:

1. **Typography:** add **Inter** (self-hosted, like Montserrat) as the reading face for paragraphs, forms and data. Montserrat stays for headings, navigation and labels only, weights 500–700. Today everything is Montserrat, which makes long text heavier than the system intends.
2. **Colors:** adopt the full navy scale (950 `#050D16` → 600 `#255374`), with Route Blue `#183A5B` for hover states; add the light golds (`#E2C266`, `#F7EFD9`); align the neutral scale; add the four semantic feedback colors (success/warning/danger/info) and use them in booking status badges and form errors.
3. **Motion:** the system's three durations (120/220/420 ms) and standard easing `cubic-bezier(.2,.8,.2,1)` as CSS variables, applied consistently, plus `prefers-reduced-motion` support.
4. **Radius and shadows:** map to the system's sm/md/lg/xl/round and three shadow levels.

## Phase 3 — Component modernization

Bringing the UI in line with the component guidelines:

1. **Buttons:** enforce the hierarchy — navy for the normal next step, **gold reserved for the single journey-defining action per screen** (currently gold appears more than once on some pages), outline for secondary, ghost for cancel. Sentence case, verb first.
2. **Navigation:** the header currently has seven items (Transfers, Tours, Build my route, For business, For schools, About us, Drive with us); the system caps primary navigation at five. I'll consolidate — likely Transfers, Tours, Build my route, plus a "Company" group for Business/Schools/About, with Drive with us staying as a distinct call-out.
3. **Forms:** labels stay visible above fields everywhere (no placeholder-only labels), helper/error text directly under the control, `autocomplete` attributes on the checkout (name, email, tel) so browsers can fill them, and user input preserved after validation errors.
4. **Focus and targets:** the 3 px gold focus ring on every interactive element, and minimum 44×44 px touch targets (some map pins and footer links are under this today).
5. **Cards:** one subject, one destination per card; consistent media ratios inside each collection (tour cards vs. category cards currently differ slightly).

## Phase 4 — Accessibility and polish baseline

1. Skip link on content-heavy pages; DOM order matches reading order.
2. Contrast audit: gold text on white is decoration-only per the system — I'll find and fix any instance used for real copy.
3. Alt-text pass: meaningful images described by purpose, decorative photography gets empty alt.
4. 200% browser-zoom test on the booking flow; fix anything that clips.
5. All-caps limited to short labels and the wordmark (a few section eyebrows currently set sentences in caps).
6. Travel-content rule: road-closure/seasonal warnings appear before promotional copy on tour pages (relevant for Kazbegi and mountain routes in winter).

---

## Phase 5 — Content and photography (you, with my help)

1. **Original photos.** The hero photos you sent arrived WhatsApp-compressed (capped at ~1200 px, visibly soft on large screens). Re-send them **as documents/files**, not as photos, and I'll regenerate every size. The design system's photography rules are the filter: real routes, natural light, people as participants not props, no oversaturation.
2. **Copy voice pass.** The system's voice is "a trusted local guide — lead with the useful fact, then add atmosphere." Once you approve the English tone, I'll carry it into Georgian and Russian (the parity test already guards completeness, not tone).
3. **Legal texts.** Your lawyer's terms/privacy/cancellation texts go in through `/admin/content` — no developer needed.

## Operations backlog (you — unchanged from before, in priority order)

1. **Resend account** → I wire real booking emails the same day (currently emails only log to the server console).
2. **SUPPORT_PHONE env var + support@routegeorgia.ge mailbox** → contact page and footer become real.
3. **Payment provider decision** (bank sit-down) → card payments; cash works today.
4. **Render paid tier + R2 storage** when you announce launch (free tier sleeps; driver documents need durable storage).
5. **Wipe demo data / launch seed** when the first real driver signs.

---

## Suggested order and effort

| Phase | Who | Effort | Deploy |
|---|---|---|---|
| 1 — Logo | me | one session | yes |
| 2 — Tokens | me | one session | yes (visual diff check after) |
| 3 — Components | me | one–two sessions | yes |
| 4 — Accessibility | me | one session | yes |
| 5 — Content/photos | you + me | as material arrives | rolling |
| Operations | you | account setups | n/a |

Phases 1 and 2 can ship together. After each design-heavy deploy, remember: if the change "doesn't land," it's the Render build cache — Manual Deploy → **Clear build cache & deploy**.
