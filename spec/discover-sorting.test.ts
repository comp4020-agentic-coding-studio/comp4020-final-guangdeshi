// "Most discussed" sort: isolated from the shared HTTP test server/database
// that every other spec file in this suite points at. This file imports
// src/db.ts directly against its own private, disposable SQLite file,
// exercising the real listMostDiscussed() query end-to-end exactly as
// discover.test.ts originally did over HTTP — but with no other spec file
// able to add posts to the same database mid-test.
//
// Why this needed to move out of discover.test.ts: listMostDiscussed()
// (src/db.ts) is a deliberately bounded, unpaginated top-20 query — a
// correct design for a "most discussed" highlights view, not a bug (see
// its own comment). The original HTTP-level test asserted that a
// just-created, zero-opinion "quiet" post always appears somewhere in that
// top-20 window, which is a claim about the window's total contents, not
// just about relative ordering. Every spec file shares one running app and
// one database (spec/global-setup.ts), and vitest's default `isolate: true`
// runs each spec file in its own worker but NOT its own database — so
// concurrently-running files (comparison.test.ts, history-search.test.ts,
// influential-opinion.test.ts, posts-and-opinions.test.ts between them
// create 50+ public posts, most with zero opinions) could push the quiet
// post out of the window before the assertion ran. Root-caused by running
// the full suite against a freshly reset database (always green) versus a
// long-lived one accumulating cross-file posts (intermittently red) during
// the visual design audit — confirmed, not guessed.
//
// The fix is not a weaker assertion ("if the quiet post happens to still be
// there") — it's removing the shared mutable state the assertion's
// correctness depended on. Setting DATABASE_PATH before importing db.ts
// gives this file a database only it can write to, so "20 posts, exactly
// one with opinions" is a fact this file fully controls, not a probabilistic
// outcome of whichever other files happened to run concurrently.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const TEST_DB_DIR = `./data/discover-sort-test-${randomUUID()}`;
process.env.DATABASE_PATH = `${TEST_DB_DIR}/db.sqlite`;
process.env.UPLOAD_DIR = `${TEST_DB_DIR}/uploads`;
mkdirSync(TEST_DB_DIR, { recursive: true });

const { createPost, createUser, listMostDiscussed, upsertOpinion } = await import("../src/db.ts");

afterAll(() => {
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
});

function makeUser(prefix: string) {
  const id = randomUUID().slice(0, 8);
  return createUser(`${prefix}${id}@example.com`, `${prefix}${id}`, "not-a-real-hash", prefix);
}

describe("most-discussed sort (isolated database, no shared-state flakiness)", () => {
  it("orders posts by total opinion count, most first", () => {
    const author = makeUser("author");
    const voter1 = makeUser("voter1");
    const voter2 = makeUser("voter2");
    const voter3 = makeUser("voter3");

    const quiet = createPost(
      { authorId: author.id, title: "Quiet post with zero opinions", description: "d", priceCents: null, currency: null, categoryId: "computing", tags: [], visibility: "public" },
      [],
    );
    const popular = createPost(
      { authorId: author.id, title: "Popular post with three opinions", description: "d", priceCents: null, currency: null, categoryId: "computing", tags: [], visibility: "public" },
      [],
    );
    upsertOpinion(popular.id, voter1.id, "BUY", "Opinion one");
    upsertOpinion(popular.id, voter2.id, "PASS", "Opinion two");
    upsertOpinion(popular.id, voter3.id, "BUY", "Opinion three");

    const results = listMostDiscussed(20);
    const popularIndex = results.findIndex((p) => p.id === popular.id);
    const quietIndex = results.findIndex((p) => p.id === quiet.id);
    expect(popularIndex).toBeGreaterThanOrEqual(0);
    expect(quietIndex).toBeGreaterThanOrEqual(0);
    expect(popularIndex).toBeLessThan(quietIndex);
    expect(results[popularIndex].opinionCount).toBe(3);
    expect(results[quietIndex].opinionCount).toBe(0);
  });

  it("breaks ties between equally-discussed posts by recency, newest first", async () => {
    const author = makeUser("tieauthor");
    const voter = makeUser("tievoter");

    const older = createPost(
      { authorId: author.id, title: "Older post, one opinion", description: "d", priceCents: null, currency: null, categoryId: "computing", tags: [], visibility: "public" },
      [],
    );
    // created_at (src/db.ts's now()) is millisecond-precision but two
    // synchronous createPost calls back-to-back can still land on the exact
    // same millisecond (confirmed directly: `new Date().toISOString()`
    // called twice in a tight loop produced an identical value) — a prior
    // version of this test assumed distinct timestamps were automatic and
    // failed intermittently for exactly that reason. A short real delay is
    // the actual fix, not a timing assumption.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = createPost(
      { authorId: author.id, title: "Newer post, one opinion", description: "d", priceCents: null, currency: null, categoryId: "computing", tags: [], visibility: "public" },
      [],
    );
    expect(newer.createdAt > older.createdAt).toBe(true);
    upsertOpinion(older.id, voter.id, "BUY", "tie breaker vote 1");
    const voter2 = makeUser("tievoter2");
    upsertOpinion(newer.id, voter2.id, "BUY", "tie breaker vote 2");

    const results = listMostDiscussed(20);
    const olderIndex = results.findIndex((p) => p.id === older.id);
    const newerIndex = results.findIndex((p) => p.id === newer.id);
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(results[olderIndex].opinionCount).toBe(results[newerIndex].opinionCount);
    // Tied on opinion count: newer.created_at > older.created_at (asserted
    // above, not assumed), and listMostDiscussed's ORDER BY opinion_count
    // DESC, created_at DESC means the newer post must sort first.
    expect(newerIndex).toBeLessThan(olderIndex);
  });

  it("returns at most `limit` results even when more posts exist", () => {
    const author = makeUser("boundaryauthor");
    for (let i = 0; i < 25; i++) {
      createPost(
        { authorId: author.id, title: `Boundary post ${i}`, description: "d", priceCents: null, currency: null, categoryId: "computing", tags: [], visibility: "public" },
        [],
      );
    }
    const results = listMostDiscussed(20);
    expect(results.length).toBeLessThanOrEqual(20);
  });

  it("excludes unlisted posts from most-discussed", () => {
    const author = makeUser("unlistedauthor");
    const voter = makeUser("unlistedvoter");
    const unlisted = createPost(
      { authorId: author.id, title: "Unlisted discussed post", description: "d", priceCents: null, currency: null, categoryId: "computing", tags: [], visibility: "unlisted" },
      [],
    );
    upsertOpinion(unlisted.id, voter.id, "BUY", "should not surface");

    const results = listMostDiscussed(20);
    expect(results.some((p) => p.id === unlisted.id)).toBe(false);
  });
});
