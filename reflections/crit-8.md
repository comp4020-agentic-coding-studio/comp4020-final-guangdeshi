# Crit 8 — It's alive!

**What was the breakthrough that moved the work forward?**

Realising that "smallest possible schema" and "no separate database server"
weren't competing constraints but the same constraint pointing at the same
answer: a single SQLite file on the one volume Fly already gives this app,
opened with Node's own built-in `node:sqlite` rather than reaching for a
package. Once that was settled, almost everything else simplified with it —
no ORM to configure, no second process to deploy, no dependency install step
in the Docker image at all. The whole app ended up with zero runtime npm
dependencies, which wasn't a goal going in, just what fell out of taking
"smallest possible" literally instead of as a figure of speech.

**What did this work change about who I want to be as a software developer?**

It's a small counterweight to a habit of reaching for a framework before
checking whether the problem needs one. A pile of sticks and a table that
records which ids are gone didn't need routing middleware, an ORM, or a
bundler — `node:http` and three SQL statements were enough, and having
nothing between the request and the response made every part of the
persistence story easy to state and easy to check by hand. I want to keep
asking "what's the smallest thing that's still honest about what it does"
before reaching for the bigger, more familiar tool, especially this early in
a project where the first choice is the one everything else gets built on.
