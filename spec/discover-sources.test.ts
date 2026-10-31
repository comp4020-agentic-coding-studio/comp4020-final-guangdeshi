// Discover content-source refinement: "All questions" / "Community" /
// "Demo examples" (src/db.ts's listFeed/listMostDiscussed `source` param,
// src/server.ts's handleDiscover, src/pages.ts's discoverPage). Isolated
// from the shared HTTP test server/database the same way
// discover-sorting.test.ts is, for the same reason: creating an is_demo=1
// post is only possible by calling src/db.ts's createPost() directly (the
// real HTTP /posts/new path never accepts a client-supplied isDemo flag —
// see src/server.ts's handleCreatePost, which never reads one), so this
// file needs direct db.ts access, and giving it a private database avoids
// any cross-file interleaving with the dozens of real posts every other
// spec file creates over HTTP against the shared one.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const TEST_DB_DIR = `./data/discover-sources-test-${randomUUID()}`;
process.env.DATABASE_PATH = `${TEST_DB_DIR}/db.sqlite`;
process.env.UPLOAD_DIR = `${TEST_DB_DIR}/uploads`;
mkdirSync(TEST_DB_DIR, { recursive: true });

const { createUser, createDemoUser, createPost, listFeed, listMostDiscussed, upsertOpinion } = await import(
  "../src/db.ts"
);

afterAll(() => {
  if (existsSync(TEST_DB_DIR)) rmSync(TEST_DB_DIR, { recursive: true, force: true });
});

function makeUser(prefix: string) {
  const id = randomUUID().slice(0, 8);
  return createUser(`${prefix}${id}@example.com`, `${prefix}${id}`, "not-a-real-hash", prefix);
}
function makeDemoUser(prefix: string) {
  const id = randomUUID().slice(0, 8);
  return createDemoUser(`${prefix}${id}@example.com`, `${prefix}${id}`, "not-a-real-hash", `${prefix} (Demo)`);
}

function makeRealPost(authorId: string, title: string, categoryId = "computing") {
  return createPost(
    { authorId, title, description: "d", priceCents: null, currency: null, categoryId, tags: [], visibility: "public" },
    [],
  );
}
function makeDemoPost(authorId: string, title: string, categoryId = "computing") {
  return createPost(
    { authorId, title, description: "d", priceCents: null, currency: null, categoryId, tags: [], visibility: "public", isDemo: true },
    [],
  );
}

describe("listFeed source filtering", () => {
  it("1. source=all includes both eligible real and demo posts", () => {
    const realAuthor = makeUser("realauthor");
    const demoAuthor = makeDemoUser("demoauthor");
    const real = makeRealPost(realAuthor.id, "A real post about a real decision ALLSRC1");
    const demo = makeDemoPost(demoAuthor.id, "A demo scenario about a decision ALLSRC2");

    const { posts } = listFeed({ source: "all", limit: 50 });
    const ids = posts.map((p) => p.id);
    expect(ids).toContain(real.id);
    expect(ids).toContain(demo.id);
  });

  it("2. source=community excludes all demo posts", () => {
    const realAuthor = makeUser("realauthor2");
    const demoAuthor = makeDemoUser("demoauthor2");
    const real = makeRealPost(realAuthor.id, "Real post COMMSRC1");
    const demo = makeDemoPost(demoAuthor.id, "Demo post COMMSRC2");

    const { posts } = listFeed({ source: "community", limit: 50 });
    const ids = posts.map((p) => p.id);
    expect(ids).toContain(real.id);
    expect(ids).not.toContain(demo.id);
    expect(posts.every((p) => !p.isDemo)).toBe(true);
  });

  it("3. source=demo excludes all real posts", () => {
    const realAuthor = makeUser("realauthor3");
    const demoAuthor = makeDemoUser("demoauthor3");
    const real = makeRealPost(realAuthor.id, "Real post DEMOSRC1");
    const demo = makeDemoPost(demoAuthor.id, "Demo post DEMOSRC2");

    const { posts } = listFeed({ source: "demo", limit: 50 });
    const ids = posts.map((p) => p.id);
    expect(ids).toContain(demo.id);
    expect(ids).not.toContain(real.id);
    expect(posts.every((p) => p.isDemo)).toBe(true);
  });

  it("the default source (no `source` passed at all) behaves exactly like the pre-refinement 'real only' feed, for every pre-v2/pre-refinement caller", () => {
    const realAuthor = makeUser("realauthor4");
    const demoAuthor = makeDemoUser("demoauthor4");
    const real = makeRealPost(realAuthor.id, "Real post DEFAULTSRC1");
    const demo = makeDemoPost(demoAuthor.id, "Demo post DEFAULTSRC2");

    const { posts } = listFeed({ limit: 50 });
    const ids = posts.map((p) => p.id);
    expect(ids).toContain(real.id);
    expect(ids).not.toContain(demo.id);
  });

  it("4. category filter composes correctly with every source", () => {
    const realAuthor = makeUser("realauthor5");
    const demoAuthor = makeDemoUser("demoauthor5");
    const realComputing = makeRealPost(realAuthor.id, "Real computing post CATSRC1", "computing");
    const realAudio = makeRealPost(realAuthor.id, "Real audio post CATSRC2", "audio");
    const demoComputing = makeDemoPost(demoAuthor.id, "Demo computing post CATSRC3", "computing");
    const demoAudio = makeDemoPost(demoAuthor.id, "Demo audio post CATSRC4", "audio");

    const all = listFeed({ source: "all", categoryId: "computing", limit: 50 }).posts.map((p) => p.id);
    expect(all).toContain(realComputing.id);
    expect(all).toContain(demoComputing.id);
    expect(all).not.toContain(realAudio.id);
    expect(all).not.toContain(demoAudio.id);

    const community = listFeed({ source: "community", categoryId: "computing", limit: 50 }).posts.map((p) => p.id);
    expect(community).toContain(realComputing.id);
    expect(community).not.toContain(demoComputing.id);

    const demo = listFeed({ source: "demo", categoryId: "computing", limit: 50 }).posts.map((p) => p.id);
    expect(demo).toContain(demoComputing.id);
    expect(demo).not.toContain(realComputing.id);
  });

  it("5. search composes correctly with source", () => {
    const realAuthor = makeUser("realauthor6");
    const demoAuthor = makeDemoUser("demoauthor6");
    const realMatch = makeRealPost(realAuthor.id, "SearchableDiscoverSourceWidget real one");
    const demoMatch = makeDemoPost(demoAuthor.id, "SearchableDiscoverSourceWidget demo one");
    const realNoMatch = makeRealPost(realAuthor.id, "Totally unrelated real post");

    const all = listFeed({ source: "all", search: "SearchableDiscoverSourceWidget", limit: 50 }).posts.map((p) => p.id);
    expect(all).toContain(realMatch.id);
    expect(all).toContain(demoMatch.id);
    expect(all).not.toContain(realNoMatch.id);

    const demoOnly = listFeed({ source: "demo", search: "SearchableDiscoverSourceWidget", limit: 50 }).posts.map((p) => p.id);
    expect(demoOnly).toContain(demoMatch.id);
    expect(demoOnly).not.toContain(realMatch.id);
  });

  it("8. unlisted posts never leak through any source, including source=all", () => {
    const realAuthor = makeUser("realauthor7");
    const unlisted = createPost(
      {
        authorId: realAuthor.id,
        title: "Unlisted post UNLISTEDSRC1",
        description: "d",
        priceCents: null,
        currency: null,
        categoryId: "computing",
        tags: [],
        visibility: "unlisted",
      },
      [],
    );
    const all = listFeed({ source: "all", limit: 50 }).posts.map((p) => p.id);
    const community = listFeed({ source: "community", limit: 50 }).posts.map((p) => p.id);
    expect(all).not.toContain(unlisted.id);
    expect(community).not.toContain(unlisted.id);
  });

  it("10. pagination does not duplicate or silently omit results for source=all", () => {
    const author = makeUser("pageauthor");
    const demoAuthor = makeDemoUser("pagedemoauthor");
    const createdIds: string[] = [];
    for (let i = 0; i < 12; i++) {
      createdIds.push(makeRealPost(author.id, `Pagination real post PGSRC ${String(i).padStart(2, "0")}`, "gaming").id);
    }
    for (let i = 0; i < 12; i++) {
      createdIds.push(makeDemoPost(demoAuthor.id, `Pagination demo post PGSRC ${String(i).padStart(2, "0")}`, "gaming").id);
    }

    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const page = listFeed({ source: "all", categoryId: "gaming", cursor, limit: 5 });
      for (const p of page.posts) {
        expect(seen.has(p.id), `post ${p.id} appeared on two pages`).toBe(false);
        seen.add(p.id);
      }
      pages += 1;
      if (!page.nextCursor || pages > 20) break;
      cursor = page.nextCursor;
    }
    for (const id of createdIds) {
      expect(seen.has(id), `post ${id} was silently omitted across pagination`).toBe(true);
    }
  });
});

describe("listMostDiscussed source filtering and engagement integrity", () => {
  it("7. a demo post's opinion count never contributes to a real post's rank, and vice versa — each source's ranking only ever reflects its own posts' own real opinion rows", () => {
    const realAuthor = makeUser("mdrealauthor");
    const demoAuthor = makeDemoUser("mddemoauthor");
    const voter1 = makeUser("mdvoter1");
    const voter2 = makeUser("mdvoter2");
    const voter3 = makeUser("mdvoter3");

    const quietReal = makeRealPost(realAuthor.id, "Quiet real post MD1");
    const popularDemo = makeDemoPost(demoAuthor.id, "Popular demo post MD2");
    // Three real opinions land on the DEMO post — a demo post's opinions are
    // still real rows in the same `opinions` table (the seed script uses the
    // same upsertOpinion every real submission uses), so its own count is a
    // genuine, unfabricated number. The property under test is narrower:
    // that count must never leak into or inflate a *different*, real post's
    // rank just because both happen to be eligible under source=all.
    upsertOpinion(popularDemo.id, voter1.id, "BUY", "o1");
    upsertOpinion(popularDemo.id, voter2.id, "PASS", "o2");
    upsertOpinion(popularDemo.id, voter3.id, "BUY", "o3");

    const communityResults = listMostDiscussed(20, "community");
    const quietInCommunity = communityResults.find((p) => p.id === quietReal.id);
    expect(quietInCommunity, "the real post must still be ranked under source=community").toBeTruthy();
    expect(quietInCommunity!.opinionCount).toBe(0);
    expect(communityResults.some((p) => p.id === popularDemo.id)).toBe(false);

    const allResults = listMostDiscussed(20, "all");
    const popularInAll = allResults.find((p) => p.id === popularDemo.id);
    const quietInAll = allResults.find((p) => p.id === quietReal.id);
    expect(popularInAll!.opinionCount).toBe(3);
    expect(quietInAll!.opinionCount).toBe(0);
    // The demo post's real 3-opinion count legitimately outranks the real
    // post's real 0 — this is "most discussed" doing its job across a mixed
    // source, not an engagement number being invented for either post.
    expect(allResults.findIndex((p) => p.id === popularDemo.id)).toBeLessThan(
      allResults.findIndex((p) => p.id === quietReal.id),
    );
  });

  it("source=demo's most-discussed ranking excludes every real post", () => {
    const realAuthor = makeUser("mdrealauthor2");
    const demoAuthor = makeDemoUser("mddemoauthor2");
    const voter = makeUser("mdvoter4");
    const realPopular = makeRealPost(realAuthor.id, "Popular real post MD3");
    upsertOpinion(realPopular.id, voter.id, "BUY", "o");
    const demoPost = makeDemoPost(demoAuthor.id, "A demo post MD4");

    const demoResults = listMostDiscussed(20, "demo");
    expect(demoResults.some((p) => p.id === realPopular.id)).toBe(false);
    expect(demoResults.some((p) => p.id === demoPost.id)).toBe(true);
  });
});
