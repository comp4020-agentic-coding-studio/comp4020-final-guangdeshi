# The spec

The [final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)
and its spec are on the course website, along with the specs for crits 8, 9 and
10, which run in this repo. The brief poses the problem; the spec is the fixed
contract.

## What ships

`invariants.test.ts` checks the two things the course relies on:

- `/` answers with a 200, which is what the deploy and the crit capture read
- `/readme/` publishes `README.md`. Markdown renderers all differ slightly, so
  it checks the README's headings rather than every word: each one has to
  appear, in order, in the HTML the server sends, since no script runs. Render
  it however you like, as long as it's there in full; the marker reads it there.

Both run against the **running** app over HTTP, so they hold whatever it's built
with. In CI that app is the image your `Dockerfile` builds, started with a
throwaway `/data`, and a red run blocks the deploy. Locally, start the app
however you run it and `pnpm check` finds it at `APP_URL` (default
`http://localhost:8080`). Keep them; don't delete them.

## Your checks

Everything else in `spec/` is yours to write. Any `spec/*.test.ts` runs with
`pnpm check`, against the same running app. Some lines of a spec only a person
can judge; those are left to the crit and the marker.

At a crit, a green `check` job is half the shipped mark, but it's never the
judgement of the work: your tutor checks what you deployed against the published
spec.

## Buy or Pass's own checks

The product pivoted from Bug Relay to Buy or Pass for the Final Project
(`docs/adr/0002-pivot-bug-relay-to-buy-or-pass.md`); Bug Relay's own
product-specific spec files (`bug-relay.test.ts`, `recommend.test.ts`) were
removed since that product's code no longer exists in `src/` — both remain
fully recoverable from git history and the `crit-8` tag. In their place:

- `unit.test.ts` — pure unit tests of password hashing (`src/auth.ts`) and
  input validation (`src/validation.ts`), no HTTP involved.
- `auth.test.ts` — registration, duplicate email/handle rejection, login/
  logout, session invalidation, and CSRF enforcement.
- `posts-and-opinions.test.ts` — post creation with an image, post editing,
  the one-opinion-per-(post,user) rule under concurrent submission, authors
  can't vote on their own post, unlisted visibility, server-side
  authorization boundaries (cross-user edit/delete rejected, only the post
  author records a purchase outcome), and the report/resolve flow.
- `uploads.test.ts` — a file that merely claims to be an image but fails to
  decode is rejected, an undersized image is rejected, a valid image is
  re-encoded to JPEG with EXIF stripped, the 1–4 image limit is enforced,
  and a path-traversal-shaped image id 404s rather than touching the
  filesystem.
- `discover.test.ts` — category filtering, text search, the "most
  discussed" sort, and keyset pagination.
- `profile.test.ts` — profile updates, the multi-checkbox interests field,
  avatar upload, and account-settings password change.
- `realtime.test.ts` — subscribes to a post's SSE stream directly and
  confirms a second user's opinion arrives as a pushed event in well under a
  second.

`scripts/verify-browser.mjs` and `scripts/verify-admin.mjs` cover the same
multi-user/realtime/authorization requirements end to end through real
Chromium browser contexts (`pnpm test:browser`, `pnpm test:admin`) —
run manually, not part of `pnpm check`, since they need Playwright's browser
binaries and a running app on a known port.
