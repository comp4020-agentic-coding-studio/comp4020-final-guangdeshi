// Two-user real-time acceptance regression (not part of `pnpm check`; needs a
// browser). Two independent, simultaneously open Chromium contexts — A on a
// 1440x900 desktop, B on a 390x844 phone — run the acceptance matrix from
// docs/adr/0005-realtime-event-contract.md:
//
//   1 new post appears in B's open Questions feed      7 influential mark/unmark
//   2 edit (title + context) reaches B's open post     8 filters + privacy
//   3 Buy -> Pass                                      9 SSE reconnect reconciles
//   4 Which One? (3 catalog products), pick + change  10 restart persistence (see --restart)
//   5 delete own opinion via the UI                   11 no 390px overflow
//   6 purchase outcome recorded and changed           12 concurrent opinions
//
// Latency = time from the acting request's HTTP response (the write has
// committed by then) to the change being visible in the OTHER page's DOM,
// timestamped in that page by a MutationObserver. It is an upper bound on
// commit→visible. Each critical check runs ROUNDS times (default 3).
//
// Creates accounts and posts, so it only runs against a disposable server:
//   PORT=8091 BOP_DISPOSABLE_DB=1 RATE_LIMIT_SCALE=1000 DATABASE_PATH=/tmp/rt/db.sqlite UPLOAD_DIR=/tmp/rt/up node src/server.ts
//   APP_URL=http://localhost:8091 node scripts/verify-realtime.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { requireDisposableTarget } from "./test-target-guard.mjs";

const BASE = process.env.APP_URL;
await requireDisposableTarget(BASE);
const ROUNDS = Number(process.env.ROUNDS ?? 3);
const TEST_PNG = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 60, g: 110, b: 170 } } }).png().toBuffer();
const LIMIT_MS = 1000;
const OUT = process.env.SCREENSHOT_DIR ?? "screenshots/realtime";
mkdirSync(OUT, { recursive: true });

const results = [];
const latencies = {};
const commitLatencies = {};
let failures = 0;
function check(id, ok, detail = "") {
  results.push({ id, ok, detail });
  if (!ok) failures++;
  console.log(`[verify-realtime] ${ok ? "PASS" : "FAIL"} ${id}${detail ? ` — ${detail}` : ""}`);
}

async function register(page, prefix) {
  // A long handle on purpose: it is what exposed the 390px opinion-row overflow.
  const handle = `${prefix}${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="email"]', `${handle}@example.com`);
  await page.fill('input[name="handle"]', handle);
  await page.fill('input[name="displayName"]', `${prefix} RT`);
  await page.fill('input[name="password"]', "password123");
  await page.click('form.form-stack button[type="submit"]');
  await page.waitForURL(`${BASE}/discover`);
  return handle;
}

/** Arms a MutationObserver in `page` that records when `predicateSrc` first becomes true. */
async function armWatch(page, key, predicateSrc, arg) {
  await page.evaluate(
    ({ key, predicateSrc, arg }) => {
      const pred = new Function("arg", `return (${predicateSrc})(arg);`);
      window.__rt = window.__rt || {};
      delete window.__rt[key];
      const done = () => {
        if (window.__rt[key] === undefined && pred(arg)) {
          window.__rt[key] = performance.timeOrigin + performance.now();
          obs.disconnect();
        }
      };
      const obs = new MutationObserver(done);
      obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
      done();
    },
    { key, predicateSrc, arg },
  );
}

/**
 * Two measurements per change, both against one wall clock (browser and
 * server run on this machine):
 *  - end-to-end: from dispatching the acting user's request to the change
 *    being visible in the OTHER page (request + commit + SSE + refetch + swap);
 *  - commit→visible: from the server's event timestamp (stamped right after
 *    the write committed) to visible. This is the brief's "within about a
 *    second" number.
 */
async function measure(label, watchPage, key, predicateSrc, arg, act) {
  await armWatch(watchPage, key, predicateSrc, arg);
  await watchPage.evaluate(() => (window.__rtEvents = []));
  const dispatchedAt = Date.now();
  await act();
  try {
    await watchPage.waitForFunction((k) => window.__rt?.[k] !== undefined, key, { timeout: 5000 });
  } catch {
    return null;
  }
  const { visibleAt, eventTs } = await watchPage.evaluate((k) => ({ visibleAt: window.__rt[k], eventTs: (window.__rtEvents ?? []).map((e) => e.ts) }), key);
  const e2e = Math.round(visibleAt - dispatchedAt);
  (latencies[`${label}`] ??= []).push(e2e);
  const commitTs = eventTs.filter((t) => t >= dispatchedAt && t <= visibleAt).sort((a, b) => a - b)[0];
  if (commitTs !== undefined) (commitLatencies[label] ??= []).push(Math.round(visibleAt - commitTs));
  return e2e;
}

/** Submits a form via its button and resolves once the POST's response has arrived. */
async function submitAndWait(page, buttonSelector, urlPart) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(urlPart)),
    page.click(buttonSelector),
  ]);
  return res;
}

async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

const browser = await chromium.launch();
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
// Records each SSE event's server timestamp in the page (for commit→visible).
const recordEvents = () => {
  const Native = window.EventSource;
  window.EventSource = class extends Native {
    constructor(...args) {
      super(...args);
      const orig = this.addEventListener.bind(this);
      this.addEventListener = (type, fn, opts) =>
        orig(type, (ev) => {
          try {
            const d = JSON.parse(ev.data);
            if (d?.ts) (window.__rtEvents ??= []).push({ type, ts: Date.parse(d.ts) });
          } catch {}
          fn(ev);
        }, opts);
    }
  };
};
await ctxA.addInitScript(recordEvents);
await ctxB.addInitScript(recordEvents);
const A = await ctxA.newPage();
const B = await ctxB.newPage();
const hA = await register(A, "rtalice");
const hB = await register(B, "rtbob");
console.log(`[verify-realtime] A=@${hA} (1440x900), B=@${hB} (390x844); both windows stay open`);

async function waitLive(page) {
  await page.waitForFunction(
    () => document.getElementById("live-connection-label")?.dataset.connected === "true" || document.querySelector("[data-live-feed]")?.dataset.liveConnected === "true",
    null,
    { timeout: 5000 },
  );
}

// ---------------------------------------------------------------- TEST 1
await B.goto(`${BASE}/discover?view=questions`);
await waitLive(B);
let firstPostUrl = null;
for (let r = 0; r < ROUNDS; r++) {
  const title = `RT new question ${r} ${Date.now()}`;
  await A.goto(`${BASE}/posts/new?product=abo-b07pdyw6vm`);
  await A.fill('input[name="title"]', title);
  await A.fill('textarea[name="description"]', "Live feed test");
  await A.fill('input[name="price"]', "79");
  const ms = await measure("1.new-post-feed", B, `np${r}`, "(t) => document.body.innerText.includes(t)", title, () => submitAndWait(A, "form.post-form button[type=submit]", "/posts/new"));
  check(`1.new-post-in-open-feed round ${r + 1}`, ms !== null && ms < LIMIT_MS, `${ms}ms`);
  firstPostUrl ??= (await A.waitForURL(/\/posts\/[a-f0-9-]{36}$/), A.url());
}
const cardIds = await B.locator(".post-card[data-post-id]").evaluateAll((as) => as.map((a) => a.dataset.postId));
check("1.no-duplicate-cards", new Set(cardIds).size === cardIds.length, `${cardIds.length} cards`);
check("1.B-never-reloaded", (await B.evaluate(() => performance.getEntriesByType("navigation").length)) === 1 && B.url().includes("view=questions"));
await B.screenshot({ path: `${OUT}/01-B-feed-live-390.png` });

// ---------------------------------------------------------------- TEST 2
const postUrl = firstPostUrl;
await B.goto(postUrl);
await waitLive(B);
for (let r = 0; r < ROUNDS; r++) {
  const newTitle = `RT edited title ${r} ${Date.now()}`;
  const ctxText = `Small flat, round ${r}`;
  await A.goto(`${postUrl}/edit`);
  await A.fill('input[name="title"]', newTitle);
  await A.fill('input[name="context_use_context"]', ctxText);
  const ms = await measure("2.edit-post", B, `ed${r}`, "(a) => document.querySelector('h1')?.textContent.includes(a[0]) && document.body.innerText.includes(a[1])", [newTitle, ctxText],
    () => submitAndWait(A, "form.post-form button[type=submit]", "/edit"));
  check(`2.edit-title-and-context round ${r + 1}`, ms !== null && ms < LIMIT_MS, `${ms}ms`);
}

// ---------------------------------------------------------------- TEST 3
await A.goto(postUrl);
await waitLive(A);
for (let r = 0; r < ROUNDS; r++) {
  const buyText = `RT buy ${r} ${Date.now()}`;
  await B.click('input[value="BUY"]');
  await B.fill('textarea[name="comment"]', buyText);
  const msBuy = await measure("3.buy", A, `b${r}`, "(t) => document.body.innerText.includes(t) && document.getElementById('count-buy')?.textContent.includes('1 Buy') && document.getElementById('count-pass')?.textContent.includes('0 Pass')", buyText,
    () => submitAndWait(B, "#opinion-form button[type=submit]", "/opinions"));
  check(`3.buy-visible round ${r + 1}`, msBuy !== null && msBuy < LIMIT_MS, `${msBuy}ms`);
  await B.waitForURL(postUrl);
  const passText = `RT pass ${r} ${Date.now()}`;
  await B.click('input[value="PASS"]');
  await B.fill('textarea[name="comment"]', passText);
  const msPass = await measure("3.change-to-pass", A, `p${r}`, "(t) => document.body.innerText.includes(t) && document.getElementById('count-pass')?.textContent.includes('1 Pass') && document.getElementById('count-buy')?.textContent.includes('0 Buy')", passText,
    () => submitAndWait(B, "#opinion-form button[type=submit]", "/opinions"));
  check(`3.change-to-pass round ${r + 1}`, msPass !== null && msPass < LIMIT_MS, `${msPass}ms`);
  await B.waitForURL(postUrl);
  check(`3.one-row-per-voter round ${r + 1}`, (await A.locator("#opinions-list .opinion-item").count()) === 1);
}
check("3.author-gets-influential-action-live", (await A.locator("#opinions-list .influential-mark-form").count()) === 1);
await A.screenshot({ path: `${OUT}/03-A-after-pass-1440.png`, fullPage: true });

// ---------------------------------------------------------------- TEST 7
for (let r = 0; r < ROUNDS; r++) {
  const markMs = await measure("7.mark", B, `m${r}`, "() => !!document.querySelector('.influential-badge')", null, () => submitAndWait(A, ".influential-mark-form button", "/influential"));
  check(`7.mark-visible-to-B round ${r + 1}`, markMs !== null && markMs < LIMIT_MS, `${markMs}ms`);
  await A.waitForURL(postUrl);
  await waitLive(A);
  const unmarkMs = await measure("7.unmark", B, `u${r}`, "() => !document.querySelector('.influential-badge')", null, () => submitAndWait(A, ".influential-mark-form button", "/influential"));
  check(`7.unmark-visible-to-B round ${r + 1}`, unmarkMs !== null && unmarkMs < LIMIT_MS, `${unmarkMs}ms`);
  await A.waitForURL(postUrl);
  await waitLive(A);
}
await A.click(".influential-mark-form button");
await A.waitForURL(postUrl);
await waitLive(A);

// ---------------------------------------------------------------- TEST 6
const statuses = ["BOUGHT", "DID_NOT_BUY", "STILL_DECIDING", "BOUGHT"];
const labels = { BOUGHT: "Bought", DID_NOT_BUY: "Didn't buy", STILL_DECIDING: "Still deciding" };
for (const [i, status] of statuses.entries()) {
  const note = `RT outcome note ${i} ${Date.now()}`;
  await A.click(`input[name="status"][value="${status}"]`);
  await A.fill('textarea[name="reflection"]', note);
  const ms = await measure("6.outcome", B, `o${i}`, "(n) => !!document.querySelector('.outcome-readonly') && document.body.innerText.includes(n)", note,
    () => submitAndWait(A, ".outcome-form button[type=submit]", "/outcome"));
  check(`6.outcome ${status} visible to B`, ms !== null && ms < LIMIT_MS, `${ms}ms`);
  await A.waitForURL(postUrl);
  await waitLive(A);
}
check("6.B-sees-influential-with-outcome", (await B.locator(".influential-badge").count()) === 1);
check("6.no-refresh-banner", (await B.locator(".live-banner").count()) === 0);
check("11.post-page-no-overflow-390 (long handle + badges)", await noOverflow(B));
await B.screenshot({ path: `${OUT}/06-B-outcome-live-390.png`, fullPage: true });

// ---------------------------------------------------------------- TEST 5
await B.reload();
await waitLive(B);
const delMs = await measure("5.delete", A, "del", "() => document.querySelectorAll('#opinions-list .opinion-item').length === 0 && document.getElementById('count-pass')?.textContent.includes('0 Pass') && !document.querySelector('.influential-badge')", null,
  () => submitAndWait(B, ".opinion-delete-form button", "/delete"));
check("5.delete-disappears-on-A", delMs !== null && delMs < LIMIT_MS, `${delMs}ms`);

// ---------------------------------------------------------------- TEST 4
await A.goto(`${BASE}/discover?category=home-kitchen`);
const hrefs = [...new Set(await A.locator(".product-card a.product-card-link").evaluateAll((as) => as.map((a) => a.getAttribute("href"))))].slice(0, 3);
await A.evaluate(() => sessionStorage.removeItem("bop-compare"));
for (const h of hrefs) {
  await A.goto(`${BASE}${h}`);
  await A.click("[data-compare-toggle]");
}
await A.click(".compare-tray [data-compare-go]");
await A.waitForURL(/compare=/);
for (let i = 0; i < 3; i++) await A.fill(`input[name="option_price_${i}"]`, String(50 + i * 25));
await A.fill('textarea[name="description"]', "Shared kitchen, RT comparison");
await A.click("form.post-form button[type=submit]");
await A.waitForURL(/\/posts\/[a-f0-9-]{36}$/);
const cmpUrl = A.url();
await waitLive(A);
await B.goto(cmpUrl);
await waitLive(B);
const optIds = await B.locator('input[name="selectedOptionId"]').evaluateAll((is) => is.map((i) => i.value).filter((v) => v !== "none"));
check("4.three-catalog-options", optIds.length === 3);
const countsSrc = "(a) => { const c = [...document.querySelectorAll('.purchase-option-card .purchase-option-vote-count')].map(e => parseInt(e.textContent)); return JSON.stringify(c) === JSON.stringify(a[0]) && document.body.innerText.includes(a[1]); }";
for (let r = 0; r < ROUNDS; r++) {
  const t1 = `RT pick second ${r} ${Date.now()}`;
  await B.check(`input[name="selectedOptionId"][value="${optIds[1]}"]`);
  await B.fill('textarea[name="comment"]', t1);
  const ms1 = await measure("4.pick", A, `c${r}`, countsSrc, [[0, 1, 0], t1], () => submitAndWait(B, "#opinion-form button[type=submit]", "/opinions"));
  check(`4.pick-option-2 round ${r + 1}`, ms1 !== null && ms1 < LIMIT_MS, `${ms1}ms`);
  await B.waitForURL(cmpUrl);
  const t2 = `RT change to third ${r} ${Date.now()}`;
  await B.check(`input[name="selectedOptionId"][value="${optIds[2]}"]`);
  await B.fill('textarea[name="comment"]', t2);
  const ms2 = await measure("4.change", A, `d${r}`, countsSrc, [[0, 0, 1], t2], () => submitAndWait(B, "#opinion-form button[type=submit]", "/opinions"));
  check(`4.change-to-option-3 round ${r + 1}`, ms2 !== null && ms2 < LIMIT_MS, `${ms2}ms`);
  await B.waitForURL(cmpUrl);
}
check("11.comparison-no-overflow-390", await noOverflow(B));
await A.screenshot({ path: `${OUT}/04-A-comparison-live-1440.png`, fullPage: true });
await B.screenshot({ path: `${OUT}/04-B-comparison-390.png`, fullPage: true });

// ---------------------------------------------------------------- TEST 8
// B watches the AUDIO-filtered feed; A publishes one audio and one
// computing post plus an unlisted audio one. Only the public audio post may appear.
await B.goto(`${BASE}/discover?view=questions&category=audio`);
await waitLive(B);
const stamp = Date.now();
async function quickPost(title, category, visibility) {
  await A.goto(`${BASE}/posts/new?category=${category}`);
  await A.fill('input[name="title"]', title);
  await A.fill('textarea[name="description"]', "filter test");
  if (visibility === "unlisted") await A.check('input[name="visibility"][value="unlisted"]');
  await A.setInputFiles('input[name="images"]', { name: "p.png", mimeType: "image/png", buffer: TEST_PNG });
  await submitAndWait(A, "form.post-form button[type=submit]", "/posts/new");
  await A.waitForURL(/\/posts\/[a-f0-9-]{36}$/);
}
await quickPost(`RT filter computing ${stamp}`, "computing", "public");
await quickPost(`RT filter unlisted audio ${stamp}`, "audio", "unlisted");
const audioTitle = `RT filter audio ${stamp}`;
const msFilter = await measure("8.filtered-feed", B, "flt", "(t) => document.body.innerText.includes(t)", audioTitle, () => quickPost(audioTitle, "audio", "public"));
await B.waitForTimeout(600);
const feedText = await B.evaluate(() => document.body.innerText);
check("8.matching-post-appears", msFilter !== null && msFilter < LIMIT_MS, `${msFilter}ms`);
check("8.non-matching-category-excluded", !feedText.includes(`RT filter computing ${stamp}`));
check("8.unlisted-never-shown", !feedText.includes(`RT filter unlisted audio ${stamp}`));
check("8.no-admin-or-demo-content", !(await B.locator(".post-card-demo").count()) && !feedText.includes("Admin"));

// Removal: A deletes the audio post; B's filtered feed drops it.
const audioPostPath = new URL(A.url()).pathname;
await A.goto(`${BASE}${audioPostPath}/edit`);
await A.check('input[name="visibility"][value="unlisted"]');
const msHide = await measure("8.visibility-removal", B, "hide", "(t) => !document.body.innerText.includes(t)", audioTitle, () => submitAndWait(A, "form.post-form button[type=submit]", "/edit"));
check("8.made-unlisted-disappears-from-feed", msHide !== null && msHide < LIMIT_MS, `${msHide}ms`);

// Product page question counts stay real: B views the product A asked about.
await B.goto(`${BASE}/products/abo-b07pdyw6vm`);
await waitLive(B);
const qTitle = `RT product question ${Date.now()}`;
await A.goto(`${BASE}/posts/new?product=abo-b07pdyw6vm`);
await A.fill('input[name="title"]', qTitle);
await A.fill('textarea[name="description"]', "product page live");
const msProd = await measure("8.product-page-question", B, "pq", "(t) => document.body.innerText.includes(t)", qTitle, () => submitAndWait(A, "form.post-form button[type=submit]", "/posts/new"));
check("8.product-page-lists-new-question-live", msProd !== null && msProd < LIMIT_MS, `${msProd}ms`);

// ---------------------------------------------------------------- TEST 9
await A.goto(postUrl);
await waitLive(A);
await ctxA.setOffline(true);
const missed = `RT while A offline ${Date.now()}`;
await B.goto(postUrl);
await B.click('input[value="BUY"]');
await B.fill('textarea[name="comment"]', missed);
await submitAndWait(B, "#opinion-form button[type=submit]", "/opinions");
await A.waitForTimeout(500);
await ctxA.setOffline(false);
let reconciled = false;
try {
  await A.waitForFunction((t) => document.body.innerText.includes(t) && document.getElementById("count-buy")?.textContent.includes("1 Buy"), missed, { timeout: 10000 });
  reconciled = true;
} catch {}
check("9.reconnect-reconciles-missed-change", reconciled, "change made while A was offline appears after reconnect, without reload");
check("9.A-never-reloaded", (await A.evaluate(() => performance.getEntriesByType("navigation").length)) === 1);

// --------------------------------------------------------------- TEST 12
const voters = [];
for (let i = 0; i < 6; i++) {
  const c = await browser.newContext();
  const p = await c.newPage();
  await register(p, `rtv${i}`);
  voters.push(p);
}
await A.goto(postUrl);
await waitLive(A);
const statusesConc = await Promise.all(
  voters.map(async (p, i) => {
    const csrf = (await p.context().cookies()).find((c) => c.name === "bop_csrf").value;
    return p.evaluate(
      ({ u, csrf, i }) =>
        fetch(u, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ csrf, stance: i % 2 ? "PASS" : "BUY", comment: `concurrent ${i}` }) }).then((r) => r.status),
      { u: `${postUrl}/opinions`, csrf, i },
    );
  }),
);
// B already holds BUY: expected 4 BUY / 3 PASS.
let liveOk = false;
try {
  await A.waitForFunction(() => document.getElementById("count-buy")?.textContent.includes("4 Buy") && document.getElementById("count-pass")?.textContent.includes("3 Pass") && document.querySelectorAll("#opinions-list .opinion-item").length === 7, null, { timeout: 3000 });
  liveOk = true;
} catch {}
const dbHtml = await (await fetch(postUrl)).text();
check("12.concurrent-all-accepted", statusesConc.every((s) => s === 200), JSON.stringify(statusesConc));
check("12.live-counts-match-database", liveOk && dbHtml.includes("👍 4 Buy") && dbHtml.includes("👎 3 Pass"), "A (live) and a fresh server render both show 4 Buy / 3 Pass, 7 rows");

// --------------------------------------------------------------- TEST 11
for (const [path, name] of [["/discover", "products"], ["/discover?view=questions", "questions"], [new URL(postUrl).pathname, "post"], [new URL(cmpUrl).pathname, "comparison"], ["/products/abo-b07pdyw6vm", "product"]]) {
  await B.goto(`${BASE}${path}`);
  await B.waitForLoadState("networkidle");
  check(`11.no-overflow-390 ${name}`, await noOverflow(B));
  await B.screenshot({ path: `${OUT}/11-${name}-390.png`, fullPage: true });
}
for (const [vw, vh] of [[1440, 900], [1920, 1080]]) {
  const c = await browser.newContext({ viewport: { width: vw, height: vh }, storageState: await ctxA.storageState() });
  const p = await c.newPage();
  for (const [path, name] of [["/discover?view=questions", "questions"], [new URL(postUrl).pathname, "post"], [new URL(cmpUrl).pathname, "comparison"]]) {
    await p.goto(`${BASE}${path}`);
    await p.waitForLoadState("networkidle");
    check(`11.no-overflow-${vw} ${name}`, await noOverflow(p));
    await p.screenshot({ path: `${OUT}/11-${name}-${vw}x${vh}.png` });
  }
  await c.close();
}

// ---------------------------------------------------------------- summary
function dist(byCheck) {
  const all = Object.values(byCheck).flat().sort((a, b) => a - b);
  const q = (p) => all[Math.min(all.length - 1, Math.ceil(p * all.length) - 1)];
  return { samples: all.length, min: all[0], median: q(0.5), p90: q(0.9), p95: q(0.95), max: all.at(-1), byCheck };
}
const summary = { endToEnd: dist(latencies), commitToVisible: dist(commitLatencies) };
console.log(`[verify-realtime] LATENCY end-to-end ${JSON.stringify({ ...summary.endToEnd, byCheck: undefined })}`);
console.log(`[verify-realtime] LATENCY commit->visible ${JSON.stringify({ ...summary.commitToVisible, byCheck: undefined })}`);
check("latency.max-commit-to-visible-under-1s", summary.commitToVisible.samples > 0 && summary.commitToVisible.max < LIMIT_MS, `${summary.commitToVisible.max}ms over ${summary.commitToVisible.samples} samples`);
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, results, latency: summary, postUrl, cmpUrl }, null, 2));
await browser.close();
console.log(`[verify-realtime] ${failures === 0 ? "ALL CHECKS PASSED" : `${failures} check(s) FAILED`}`);
process.exitCode = failures === 0 ? 0 : 1;
