# Design system

## Art direction

**"Editorial shopping magazine meets social feed."** The brief explicitly
asked to avoid a generic admin-dashboard look and purple-SaaS-gradient
aesthetics. The chosen direction: a warm, light, paper-like background
(`#faf6f0`, not pure white) that reads as a printed magazine page rather
than a software console; a serif display face (**Fraunces**, a variable
font with personality) for headlines and voice; a clean grotesque
(**Inter**) for everything functional (body text, forms, buttons). This
pairing — expressive serif headline + quiet sans body — is a standard
editorial-magazine convention, deliberately borrowed rather than a generic
"modern SaaS" sans-only system.

## Why these specific choices

- **Warm paper background instead of white or dark mode-first.** The
  product is about physical objects (purchases) and human judgment, not a
  data tool — a slightly warm off-white reads as inviting and tactile
  rather than clinical. Dark mode is still supported via
  `prefers-color-scheme`/`[data-theme]` overrides in `styles.css`, but light
  is the designed default.
- **Buy and Pass get their own deliberate colors, not a generic green/red
  pair.** `--color-buy: #1f7a4d` (a deep, confident green) and
  `--color-pass: #c0392b` (a warm brick red) were chosen to read clearly at
  a glance across a whole feed of cards, including for the most common forms
  of red-green color vision deficiency — both colors differ enough in
  lightness (not just hue) to stay distinguishable. Every stance badge pairs
  the color with an icon (👍/👎) and text label ("Buy"/"Pass"), so color is
  never the only signal.
- **Pill-shaped buttons and badges throughout.** A single consistent rounded
  shape language (999px radius) ties opinion badges, category pills, and
  primary actions together visually, reinforcing "this is the same kind of
  thing" across the UI.
- **High image-to-text ratio on cards and the post detail page.** Per the
  brief's "strong image hierarchy," product photos are large relative to
  metadata text — the post-detail gallery is a 1:1 aspect-ratio hero image,
  and discover cards lead with a 4:3 photo before any text.

## Typography scale

- Display (`--font-display`, Fraunces): hero headline, section headings
  (`h1`-`h3`), the definition-of-good callout.
- Body (`--font-body`, Inter): everything else — nav, forms, cards, buttons,
  the admin log.

## Layout and responsiveness

Designed desktop-first at 1440×900 and 1920×1080 (a `--container-width:
1180px` cap keeps content from stretching unreadably wide on a 1920px
screen), with every page's CSS also tested at 390×844 (iPhone-class mobile)
via `scripts/verify-browser.mjs`'s screenshot capture. Mobile-specific
adjustments (in `styles.css`'s `@media (max-width: 640px)` block): the post
detail's two-column grid collapses to one column, the admin log table drops
its less-critical columns rather than causing horizontal scroll, and the
hero's side-by-side CTAs stack vertically.

Mobile photo upload uses a plain `<input type="file" accept="image/*"
capture="environment">` — the `capture` attribute invites the device camera
directly on supporting mobile browsers, with graceful fallback to the normal
file picker everywhere else, per the brief's "mobile photo upload is a
priority."

## Empty, loading, and error states

Per the brief's "refined empty/loading/error states" requirement:
`src/render.ts`'s `emptyState()` component is reused across every
zero-results case (no posts yet, no search results, no activity, no
opinions) with a context-specific icon, message, and call-to-action rather
than a bare "no results" string. Error pages (`src/pages.ts`'s `errorPage`)
use the same component with an appropriate icon per status code family.

## Official Anthropic skills

This repository was inspected for the `frontend-design` and `webapp-testing`
Claude Code skills named in the brief. **Neither was available in this
environment's skill listing** — only the COMP4020 course plugin's skills and
a set of unrelated general-purpose skills were present. This is reported
accurately rather than fabricating their use: all visual design decisions in
this document were made through ordinary frontend engineering judgment (CSS
authored directly, informed by the design heuristics above), and all browser
testing was done with Playwright directly (`scripts/verify-browser.mjs`,
`scripts/screenshot-demo.mjs`), not through a packaged testing skill.
