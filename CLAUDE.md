# Your harness

This is the project harness for the **COMP4020/COMP8020 Final Project**
("Pick-Up Sticks"): one repository, built across crits 8, 9, 10 and the final
submission. What the product is and what "good" means for it belongs in
`README.md`; this file holds the process rules the agent is held to while
building it.

This harness is a **deliberate merge-forward**, not a copy, from the Crit 7
harness (`comp4020-crit7-GuangdeShi`), which was itself merged forward from
Assignment 2. Everything below is a workflow/process rule that survived both
merges because it doesn't depend on either prior project's product (a library
room-booking redesign, a fictional course). Anything that was really
Crit-7-specific — grounding claims in real ANU sources, preserving an existing
system's interaction model — was dropped, since this project starts from
nothing rather than extending something real.

## 1. Audit before acting

Before starting a new stage of work, check the repo's actual current state —
`git status`/`git log`, and the live spec on the course website — rather than
assuming it from memory or from this file. This file goes stale as the
project grows across ten weeks; what's true now is whatever a quick check
confirms.

## 2. Decision boundary

The agent may research, propose alternatives, implement an approved
direction, and verify it. When a genuinely ambiguous product or design
decision comes up — what "good" means for this app, what counts as a
"person," what persists versus expires, a stack choice — don't silently pick
one and move on. Name the decision, give the options considered, and either
wait for a call or take the smallest reasonable default that keeps things
moving, recording *which* default and *why* (a short decision record, e.g. in
`PROCESS.md`) so it can be revisited.

## 3. Stack is a real decision, not boilerplate

The final project brief deliberately ships no starter framework. Whatever
stack gets chosen is a real architectural decision and gets a short rationale
in `PROCESS.md` — not because the course asks for ceremony, but because the
project outgrowing a first choice (e.g. adding real-time in week 10) is
expected, and the record of *why* the first choice was made is what makes a
later switch legible rather than arbitrary.

## 4. Spec / backpressure philosophy

`spec/` protects the promises that can be checked mechanically — a route
responds, the core flow survives a reload, a shipped invariant holds. It is
backpressure, not a substitute for judgement: whether the app is actually
*good* — satisfying, legible, worth the visit — is a human call (the crit,
the tutor), not something a passing test proves. Say those open, judged
items out loud rather than quietly deciding no test is needed.

## 5. Verification before acceptance

Don't report a feature as working because the agent says so, because
`pnpm typecheck`/`pnpm test` is green, or because the code looks plausible.
For a UI change, that means actually exercising it — the golden path and at
least one edge case (a reload, a duplicate action, a restart) — before
calling it done.

If no real graphical browser or browser-automation tool is available in the
current environment, say so explicitly rather than reporting that browser
verification occurred. A built server driven over HTTP, or an automated test
suite, is real evidence, but it is not the same claim as "verified in a
browser," and shouldn't be presented as one.

## 6. Accessibility / invariant checks

`spec/invariants.test.ts` ships with the starter and stays green always — a
real title, a nav/landmark structure sane enough for a one-page app, alt text
where images exist, a mobile viewport meta tag. It's not this week's
contract, but it's still true of any page this app serves.

## 7. Git / commit discipline

Commit at meaningful stage boundaries — not one giant commit at the end, not
one per file save. Before staging: run `git status`/diff and actually look at
what's included; never stage blindly (`git add -A`/`git add .` without
review). Commit messages name the decision or capability that landed, not
"update files" or "progress." History isn't rewritten or squashed casually —
`PROCESS.md` and each week's reflection cite real commit hashes, so the log
has to stay an honest record of how the work actually went. Never force-push.

## 8. Secret handling

Never commit `mise.local.toml`, `.env` files, the Fly API token, or any other
credential. The repo's own `.githooks/pre-commit` secret scan and the CI
trufflehog scan are the backstop; don't bypass or disable them to get a
commit through.

## 9. Process evidence

`PROCESS.md` and `reflections/crit-N.md` cite real commit hashes or compare
ranges, not paraphrase what happened. Don't overwrite or destroy earlier
process/reflection material from a prior crit; extend it. `pnpm check:evidence`
enforces the mechanical parts of this (the files exist, cited commits exist).

## 10. Step-by-step execution and reporting

For any non-trivial stage of work: break it into a small number of concrete
steps, show the step list, execute one step at a time, and report back —
files touched, what was verified, what's next — before continuing. Where the
student has explicitly asked for a specific crit to be built efficiently and
end-to-end without stopping for minor decisions, that instruction governs for
that crit; this section is the default, not an override of an explicit
one-off request.

## 11. Scope control

Keep each crit to what that week's spec actually asks for. Don't add a
feature the brief doesn't ask for yet, however natural it seems to reach for
— real-time/multiplayer, accounts, AI features, and polish beyond the current
week's bar are all examples of scope that stays deferred until the week that
actually calls for it. When it's unclear whether something is in scope,
default to leaving it out and name the call (see section 2).

## 12. Communication language

Where the student has set a language preference for how the agent talks to
them, that preference governs the agent's own reports, explanations,
warnings, decisions, and questions — nothing else. Everything that ships in
or with the repo (code, code comments, commit messages, README, PROCESS.md,
reflections, and any other submission-facing content) stays in English
regardless of that preference.

---

## Current project state

```
PRODUCT:   Pick-Up Sticks — a small, persistent, single-player (for now)
           browser toy: a deterministic pile of ~24 sticks, remove the
           topmost one, the removal survives a reload/restart/redeploy.
STACK:     Plain Node.js (node:http, zero runtime npm dependencies) +
           node:sqlite for persistence, TypeScript run directly (Node 24
           type-stripping, no build step). Rationale in PROCESS.md.
STAGE:     Crit 8 — proof of life only. No real-time, no multiplayer, no
           accounts: those are explicitly Crit 9+ territory per the brief.
```
