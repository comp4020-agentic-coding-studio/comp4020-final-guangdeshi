# Crit 8 Reflection

## What was the breakthrough that moved the work forward?

The breakthrough was realizing that "multi-user" did not need to begin with
realtime synchronization.

If one visitor removes a stick and that change remains in the database, the
next visitor already experiences a world changed by someone before them.

This allowed me to reduce the project to one small but complete interaction:
remove one valid stick and leave that change behind.

## What did this work change about who I want to be as a software developer?

This work changed how I think about completeness.

More features do not automatically make a better product. I want to become
a developer who identifies the smallest interaction that proves the
important idea, makes it reliable, tests it, and only then adds more
complexity.
