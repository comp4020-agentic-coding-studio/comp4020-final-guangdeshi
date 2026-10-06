# Process overview

### Crit 8 — Pick-Up Sticks

For Crit 8, I deliberately built a very small proof of life instead of a
complete multiplayer game.

I chose Pick-Up Sticks because the core interaction is simple: a visitor
removes one stick, and that change remains for the next visitor.

I considered features such as realistic physics, collision detection,
realtime multiplayer, accounts, scoring, and more complex rules, but I
excluded them because they were not necessary to prove the main interaction.

The pile contains 24 sticks with fixed positions, rotations, lengths, and
z-index values. Instead of physical collision detection, only the highest
remaining stick can be removed.

Commit
[`8e3fb97`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/8e3fb97)
added the deterministic layout, server, and SQLite persistence. Removed
sticks are stored in the database, so they remain gone after reloads and
server restarts.

Commit
[`484eca1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/484eca1)
added tests for persistence, duplicate removal, and invalid removal.

Commit
[`f89a449`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-guangdeshi/commit/f89a449)
consolidated the README, PROCESS, and Crit 8 reflection.

The main lesson was that I did not need to build the whole multiplayer
system to prove the idea. A small persistent interaction was enough to show
that one visitor can change what the next visitor sees.
