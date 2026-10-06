# Pick-Up Sticks

A small, persistent, browser-based pick-up sticks toy. A pile of 24 wooden
sticks sits scattered on a tabletop. You can take the one currently on top.
Take it, and it's gone — for you, for the next visitor, and for you again
tomorrow.

This is the week 9 ("It's alive!") proof of life for the final project. It's
deliberately small: one person, one action, one persistent trace. Real-time
and multiplayer are explicitly next, not now — see "What this isn't yet"
below.

## The core interaction

- The pile is laid out once, with a fixed seed, so it looks the same to
  everyone and on every visit. Nothing about the layout is randomised per
  request.
- Stacking order is the only rule: only the stick currently on top of the
  pile can be taken (a subtle glow on hover/focus marks it). No physics, no
  collision detection — the simplification is the point.
- Taking a stick writes the removal to the database before the page updates,
  so it's real the moment it happens, not just on screen.
- Reload, restart the server, or redeploy, and the pile is exactly as you
  left it: whatever's gone stays gone.

## What "good" means for this prototype

For this first version, good means:

- **Immediately understandable.** No instructions beyond "take one without
  disturbing the pile" and an obvious highlight on the one stick you can
  touch. A stranger shouldn't need to be told the rule.
- **Satisfying to interact with.** One clean action, a small persistent
  change in the world as a result. Nothing to configure, no onboarding.
- **Persistent.** The trace a visitor leaves is real: it survives their
  reload, a server restart, and a redeploy, because it lives in a database on
  the one durable volume this app gets, not in client-side state.
- **Visually legible.** The tabletop reads as a tabletop; the removable stick
  reads as removable; the remaining count is always visible and always
  accurate.
- **Leaves a visible trace for the next visitor.** The whole point of a
  shared pile is that it empties over time, in public, because real people
  took real sticks from it.

What this version is explicitly *not* trying to be good at yet: clever,
multiplayer, or polished. Those are later weeks' questions.

### What informed this

The brief points at writing on small, personal, low-stakes software as the
reference class for what "good" can mean at this scale, rather than assuming
bigger and more featureful is better by default:

- Robin Sloan, [*An app can be a home-cooked meal*](https://www.robinsloan.com/notes/home-cooked-app/)
  — software made for a small, specific audience (here: whoever happens to
  visit) can be "ruthlessly simple" and still be a complete, worthwhile
  thing, rather than a stripped-down version of something bigger.
- Ben Hoyt, [*The small web is beautiful*](https://benhoyt.com/writings/the-small-web-is-beautiful/)
  — fewer moving parts is a feature, not a limitation: it's part of why this
  prototype has no framework, no build step, and no runtime dependencies
  beyond Node itself.
- Parimal Satyal, [*Rediscovering the Small Web*](https://neustadt.fr/essays/the-small-web/)
  — a small, legible thing that does one thing plainly is worth more here
  than a feature-complete one that obscures what it's actually doing.

### What was chosen not to build (yet)

Authentication, accounts, chat, real-time sync, leaderboards, scoring, turn
systems, physics, drag-and-drop, multiple game modes, sound, and an admin
view are all deliberately out of scope for this version — not forgotten, just
not yet due. Real-time and multiplayer specifically are the brief's next
milestone (crit 9), not this one's.

## Try it

1. Open the app. The pile renders instantly, same as last time.
2. The one stick with a soft glow is the one you can take.
3. Click or tab-and-press-enter on it. It's gone, and the count updates.
4. Reload the page. It's still gone.
