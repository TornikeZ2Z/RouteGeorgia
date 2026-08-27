# Route Planner Design System

The single source of truth for how Route Planner looks, speaks and behaves.
The tokens live in `src/app/globals.css`; this document explains how to use
them. When this document and the code disagree, fix one of them the same day.

---

## 1. Brand foundations

**Idea.** A Georgian travel company with the authority of navy and the warmth
of gold. The photography carries the emotion; the interface carries the
trust. Nothing decorative competes with a photo of Ushguli.

**Logo.** The R monogram: a heavy letterform R whose left stem flows into a
road sweeping down-left, with a gold dashed centre line. Implemented in code
in `src/components/logo.tsx` (`RMark`, `Logo`). The wordmark is two-tone:
ROUTE in navy (white on dark), GEORGIA letterspaced in gold.
- On light surfaces: navy mark + navy/gold wordmark (`<Logo />`).
- On dark surfaces: white mark + white/gold wordmark (`<Logo dark />`).
- App icon / favicon: white mark on a navy rounded tile (`src/app/icon.png`).
- Never recolour the gold dashes; never set the wordmark in another face.
- The designer's final vector replaces `MarkPaths` in one file when it ships.

---

## 2. Colour

Four scales, defined as Tailwind v4 `@theme` tokens. Use tokens, never raw
hex, in components.

| Scale | Anchor | Role |
|---|---|---|
| `brand-*` | `brand-600 #0b1d33` (Deep Navy) | Primary actions, active states, emphasis text |
| `pine-*` | `pine-800 #0b1d33`, `pine-900 #071527` | Dark surfaces: header, footer, hero overlay, dark bands |
| `gold-*` | `gold-400/500 #d4af37` | The accent: icons, eyebrows, hero's second line, gold CTAs on dark |
| `ink-*` | `ink-900 #1e242c` text · `ink-500 #576579` muted · `ink-200/300` hairlines | Neutrals |

Semantic: `--color-danger #b3261e` with `--color-danger-bg`; success/warning/
info badge tints via `Badge` tones only.

**The gold law.** Gold is pigment, not paint:
- ON DARK: gold works at `gold-400` — icons, the Book-a-ride header button,
  the hero's second headline line, active carousel dot.
- ON LIGHT: gold text must use `gold-600 #a8871f` or darker (contrast);
  `gold-400` on white is reserved for icon strokes paired with a label.
- Never use gold for body text, borders of inputs, or backgrounds of large
  areas.

**The navy law.** Navy filled buttons are THE primary action on light
surfaces (See prices, Book this driver, form submits). On navy surfaces the
primary action is gold-filled; secondary is white-outline.

**Status colours** exist only in the consoles and booking states. Marketing
surfaces stay navy/gold/neutral — a red badge on the homepage is a bug.

---

## 3. Typography

**Face.** Montserrat (self-hosted via `@fontsource/montserrat`; weights
400/500/600/700/800). Georgian text falls back to Noto Sans Georgian —
never force Montserrat onto Georgian glyphs.

| Role | Classes | Notes |
|---|---|---|
| Display | `.font-display` (700, -0.015em, lh 1.12) + size `text-3xl…7xl` | Page titles, section headings, prices that matter |
| Body | default 16px / 1.5 | |
| Bold labels | `font-bold tracking-[-0.02em]` | The tightened bold is a brand signature |
| Eyebrow | `.eyebrow` (11px caps, 0.14em, gold-600) | One per section, above the heading |
| Micro/meta | `text-xs text-ink-500` | Timestamps, hints, captions |
| Small-caps field labels | `text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400` | Booking bar cells only |

Hero headline is two lines: line one white, line two `text-gold-400`.

---

## 4. Space, shape, elevation

- **Spacing rhythm:** sections `space-y-20 sm:space-y-28`; card padding
  `p-6` (dense `p-4`, hero cards `sm:p-8/10`); element gap 3–4 (12–16px).
- **Container:** `max-w-[1400px] 2xl:max-w-[1680px]`, gutters
  `px-4 sm:px-6 lg:px-10`.
- **Radius:** marketing surfaces `rounded-2xl` (16px); controls
  (buttons/inputs/pills) `rounded-xl` (12px); console tables may use
  `rounded-lg`. No other values.
- **Elevation:** flat by default with `border-ink-200` hairlines. Three
  shadows only:
  - resting card: `shadow-[0_1px_3px_rgba(11,29,51,.06)]`
  - hover/soft: `var(--shadow-soft)` — `0 10px 30px -12px rgba(11,29,51,.25)`
  - floating (booking widget): `var(--shadow-float)`
- **Motion:** 300–500ms ease transitions; hover lift `-translate-y-1` +
  soft shadow on linked cards; image zoom `group-hover:scale-105` inside
  `overflow-hidden`. Everything respects `prefers-reduced-motion` (global
  rule kills animation).

---

## 5. Iconography

Stroke icons on a 24-box, `stroke-width` 1.6–1.7, round caps/joins, drawn
inline as paths. Category set lives in `src/lib/map-icons.ts` (mountains,
sea, winter, wine, culture, nature) — reuse it; never introduce a second
icon style or emoji. Icon colour: gold on dark, `ink-900` or gold-600 on
light. Trust chips: `size-12 rounded-full border border-gold-400/70` ring
with a gold icon.

---

## 6. Components (source of truth in code)

| Component | File | Rules |
|---|---|---|
| Button | `components/ui.tsx` | primary navy / secondary white-outline / ghost / danger. Gold variant is hand-rolled for dark surfaces only |
| Card | `ui.tsx` | white, `rounded-2xl`, hairline + resting shadow |
| Field/Input/Select/Textarea | `ui.tsx` | label-above, `rounded-xl`, focus ring ink; errors in danger red with `role=alert` |
| Badge/Alert | `ui.tsx` | semantic tones; consoles and statuses only |
| Booking bar | `components/search-form.tsx` (wide) | one segmented white bar: gold icon + small-caps label + bold value per cell, hairline dividers, navy pill CTA with `→`. Native GET form — never break that |
| Booking tabs | `components/search-tabs.tsx` | pill row; active navy-filled, inactive `text-ink-500` |
| Hero carousel | `components/hero-carousel.tsx` | inline-script driven (works without React), gold active dot, decorative `alt=""` |
| Category cards | homepage | photo, navy gradient overlay, gold ring icon, title + destination names, hover lift+zoom |
| Explore map | `components/georgia-map.tsx` | schematic ink outline; category+season filter chips; pins = category icons; popover card with photo, one sentence, weather, two actions |
| Popovers/cards | | `rounded-2xl`, soft shadow, close affordance, Escape-closable |
| Logo | `components/logo.tsx` | see §1 |

**Forms philosophy:** every critical form is a native form first (real
`action`, named fields); JavaScript adds validation and polish. This is
load-bearing reliability, not nostalgia.

---

## 7. Photography

- Real places only, on the surface that claims them: a Kazbegi card shows
  Kazbegi. Generic mood imagery is allowed only on generic surfaces (hero,
  category cards).
- Sources: Route Planner's own photos, or openly licensed (CC BY / CC BY-SA /
  CC0 / public domain) with the author recorded in
  `src/lib/photo-credits.ts` and shown at `/credits`. Nothing else. Ever.
- Drop-in system: `public/photos/` — `hero.jpg…hero-5.jpg`,
  `categories/<cat>.jpg`, `destinations/<slug>.jpg`, `tours/<slug>.jpg`,
  `routes/<slug>.jpg`, `travellers/<name-country-place>.jpg` (consent
  required). Missing photo → deterministic illustration, never a grey box.
- Crops are made server-side to the slot's aspect; hero ≥2400px when the
  source allows. Never upscale beyond source pixels.

---

## 8. Voice and honesty rules

- Three languages always: en/ka/ru keys move together (parity test enforces).
- Numbers shown are real database numbers; zeros hide rather than lie.
  Invented social proof ("10,000+ travellers") does not ship.
- No driver-economics talk (commission, driver terms) on customer surfaces —
  that lives in the driver console.
- Claims match code: "free cancellation 24h" is written because the policy
  table says 24.
- Prices always "for the whole vehicle", charged in GEL; other currencies
  labelled as guidance.

---

## 9. Accessibility checklist

- Every interactive element keyboard-reachable; focus ring 2px navy.
- Decorative images `alt=""`+`aria-hidden`; informative images described.
- Tap targets ≥44px on booking-path controls.
- Text on photos always sits on a `pine-900` gradient overlay.
- Gold on white only at `gold-600+` for text-sized elements.
- Errors: text + colour, never colour alone; `role="alert"`.

---

## 10. Adding a page — the 10-point check

1. Eyebrow (gold-600 caps) → display heading → lead in `ink-500`.
2. Contained width, standard gutters, `space-y` rhythm.
3. Cards `rounded-2xl` hairline; controls `rounded-xl`.
4. One navy primary action per view; gold only per the gold law.
5. Photos licensed + credited; illustration fallback wired.
6. All three languages; parity test green.
7. Works without JavaScript if it's on the booking path.
8. Mobile: single column collapses, no horizontal scroll.
9. Focus states + alt text audited.
10. `deploy.bat` (tests) passes before ship.
