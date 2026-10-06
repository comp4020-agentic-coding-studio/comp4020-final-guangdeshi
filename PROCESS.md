# Process overview

## Crit 8 — proof of life

The brief for this week was explicitly small: deploy a first working version
of the final project, doing one real thing for a stranger, with a trace that
survives their return. The feature list, real-time, and polish were all
explicitly deferred to later crits, so the work stayed scoped to exactly
that.

### Stack decision

The repo ships with no framework and a placeholder Dockerfile; choosing a
stack was this week's first real decision. `fly.toml` fixes the deploy shape
(one 256 MB machine, one persistent volume at `/data`, no separate database
server), and the brief says to start from the smallest schema that can carry
the core interaction. Given that:

- **Runtime:** plain Node.js, using only built-ins (`node:http`,
  `node:sqlite`, `node:fs`) — no Express, no bundler, no framework. The app is
  small enough that a framework would be weight without benefit, and it keeps
  the Docker image to "copy the source, run `node`," with nothing to build or
  install at image-build time.
- **Language:** TypeScript, run directly — Node 24 strips types at load time,
  so there's no compile step; `pnpm typecheck` is the only build-adjacent
  check, and it runs against the same source the server executes.
- **Persistence:** `node:sqlite` (Node's built-in SQLite binding) against a
  single file on the mounted volume, rather than a separate database
  package or service. It's marked experimental by Node, but it's the
  smallest possible way to get a real, durable, queryable store without
  adding a dependency or a second Fly app — which the course setup doesn't
  support anyway.

This is a first choice, not a permanent one. If the project outgrows plain
`node:http` once real-time lands in crit 9 (e.g. needing WebSocket/SSE
plumbing a raw server makes awkward), that's a switch to make then, with its
own record of why — not a reason to add machinery now that this week doesn't
need.

### What shipped

- A deterministic 24-stick pile (`src/sticks.ts`): a fixed-seed PRNG computed
  once at module load, so the layout is identical on every request, every
  restart, and every redeploy — never regenerated from `Math.random()`.
- Stacking order as the only game rule: the stick with the highest z-index
  among the ones not yet removed is the single removable one, marked with a
  subtle hover/focus glow. No physics, no collision detection.
- A `removed_sticks (stick_id, removed_at)` table on the one persistent
  volume. Removal is authoritative server-side — a request is only accepted
  if the stick it names is still the current topmost one — so a duplicate or
  replayed removal can't double-count or corrupt the state.
- `/readme/` renders `README.md` through a small built-in Markdown renderer
  (headings, paragraphs, lists, blockquotes, inline code/bold/italic/links).

Commits:
[`4183f5b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/4183f5b)
carried the harness forward from crit 7.
[`8e3fb97`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/8e3fb97)
is the app itself — the pile, the server, persistence, the README renderer.
[`484eca1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/484eca1)
adds this week's own spec tests (removal, reload, duplicate-removal
rejection) alongside the shipped invariants.

### Verification

No real graphical browser or browser-automation tool was available in this
environment, so visual rendering at desktop and mobile widths was not
checked in an actual browser — that's a disclosed gap, not a claim. What was
verified, against the real running server over HTTP (not from reading the
code):

- `pnpm typecheck` and `pnpm test` both green (5 tests: the 2 shipped
  invariants plus this week's 3).
- The golden path by hand: load `/`, confirm the stick count and the one
  glowing removable stick, `POST /api/remove` for it, confirm the count drops
  and the stick leaves the markup.
- Persistence across a restart: killed the running server process and
  started a fresh one against the same database file — the removed stick was
  still gone and the count was unchanged.
- Duplicate/invalid removal: re-submitting the same (now-removed) stick id,
  and submitting an unknown id, both come back `409` and leave the count
  untouched.
- `/readme/` returns `200` and the rendered page carries every `README.md`
  heading, in order.

Docker build itself wasn't tested locally (no `docker` binary in this
environment); CI builds and runs the same `Dockerfile` on every push, which
is the first real build-and-boot check.
