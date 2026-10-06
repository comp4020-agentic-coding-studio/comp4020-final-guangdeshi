# Pick-Up Sticks

Pick-Up Sticks is a small shared web interaction built for COMP4020.

A pile of 24 sticks is displayed on a tabletop. Only the current topmost
remaining stick can be removed.

When a visitor removes a stick, the action is stored in SQLite. The stick
remains gone after reloads and server restarts, so each visitor changes the
pile for whoever comes next.

## The core interaction

1. Open the pile.
2. Identify the removable stick.
3. Remove it.
4. Leave the changed pile behind for the next visitor.

## What "good" means

A good version should be:
- immediately understandable
- simple to interact with
- visually clear
- persistent
- shared, so one visitor changes what the next visitor sees

This version deliberately does not include realtime multiplayer, accounts,
scoring, physics, collision detection, or multiple game modes.

## Try it

https://comp4020-final-guangdeshi.fly.dev/
