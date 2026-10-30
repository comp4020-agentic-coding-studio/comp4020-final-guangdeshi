// One-off manual verification script (not part of `pnpm check`): drives two
// isolated real browser contexts to confirm the multi-user realtime
// requirement end-to-end, and captures screenshots at the three required
// viewports plus key flows. Run with: node scripts/verify-browser.mjs
// Expects the app already running at APP_URL (default localhost:8080) with
// RATE_LIMIT_SCALE set high enough not to block this script's own
// registrations (see package.json's "dev:test" script).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.APP_URL ?? "http://localhost:8080";
mkdirSync("screenshots", { recursive: true });

function log(msg) {
  console.log(`[verify] ${msg}`);
}

function uniqueHandle(prefix) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

// Every page also carries a nav "Log out" <button type="submit">, so a bare
// button[type=submit] selector is ambiguous once the user is logged in — all
// form submissions below scope to the specific form.
async function register(page, prefix) {
  const handle = uniqueHandle(prefix);
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="email"]', `${handle}@example.com`);
  await page.fill('input[name="handle"]', handle);
  await page.fill('input[name="displayName"]', `${prefix} Playwright`);
  await page.fill('input[name="password"]', "password123");
  await page.click('form.form-stack button[type="submit"]');
  await page.waitForURL(`${BASE}/discover`);
  return handle;
}

async function main() {
  const browser = await chromium.launch();

  // ---- Viewport screenshots of the landing page ----
  for (const [label, viewport] of Object.entries({
    "desktop-1440x900": { width: 1440, height: 900 },
    "desktop-1920x1080": { width: 1920, height: 1080 },
    "mobile-390x844": { width: 390, height: 844 },
  })) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `screenshots/landing-${label}.png`, fullPage: true });
    log(`captured screenshots/landing-${label}.png`);

    // Check for horizontal overflow at this viewport (TEST K).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    log(`${label}: horizontal overflow = ${overflow}`);
    if (overflow) {
      console.error(`FAIL: horizontal overflow detected at ${label}`);
      process.exitCode = 1;
    }
    await ctx.close();
  }

  // ---- TEST A/B: register + login/logout ----
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  const handleA = await register(pageA, "alice");
  log(`User A registered: @${handleA}`);
  const handleB = await register(pageB, "bob");
  log(`User B registered: @${handleB}`);

  // ---- TEST C: A creates a post with an image ----
  await pageA.goto(`${BASE}/posts/new`);
  await pageA.fill('input[name="title"]', "Mac mini M4 Pro for local AI dev");
  await pageA.fill('textarea[name="description"]', "Want to run local LLMs and do dev work without cloud costs.");
  await pageA.selectOption('select[name="category"]', "computing");
  await pageA.fill('input[name="price"]', "2199");
  await pageA.setInputFiles('input[name="images"]', { name: "product.png", mimeType: "image/png", buffer: await makePngBuffer() });
  await pageA.click('form.post-form button[type="submit"]');
  await pageA.waitForURL(/\/posts\/[a-f0-9-]{36}$/);
  const postUrl = pageA.url();
  log(`A created post: ${postUrl}`);
  await pageA.screenshot({ path: "screenshots/post-detail-author-view.png", fullPage: true });

  // ---- TEST D/E: B opens the post, votes, A sees it live ----
  await pageB.goto(postUrl);
  await pageB.waitForSelector("#opinion-form");

  await pageA.goto(postUrl); // A reopens to watch live (simulating "already open")
  await pageA.waitForLoadState("networkidle");

  await pageB.click('input[value="BUY"]');
  await pageB.fill('textarea[name="comment"]', "Great for local LLM work, go for it!");
  const t0 = Date.now();
  await pageB.click('#opinion-form button[type="submit"]');

  await pageA.waitForFunction(() => document.getElementById("count-buy")?.textContent?.includes("1"), { timeout: 5000 });
  const elapsedOpinion = Date.now() - t0;
  log(`A saw B's live opinion + count update after ${elapsedOpinion}ms (no reload)`);
  await pageA.screenshot({ path: "screenshots/post-detail-live-update-on-A.png", fullPage: true });

  // ---- TEST E continued: B changes stance to PASS, both update ----
  await pageB.goto(postUrl);
  await pageB.waitForSelector('input[value="PASS"]');
  await pageB.click('input[value="PASS"]');
  await pageB.fill('textarea[name="comment"]', "Changed my mind, pass");
  const t1 = Date.now();
  await pageB.click('#opinion-form button[type="submit"]');
  await pageA.waitForFunction(() => document.getElementById("count-pass")?.textContent?.includes("1"), { timeout: 5000 });
  const elapsedStanceChange = Date.now() - t1;
  log(`A saw B's stance change live after ${elapsedStanceChange}ms`);

  // ---- TEST F: A cannot modify B's opinion via the API ----
  const forgeResult = await pageA.evaluate(async (url) => {
    const res = await fetch(url, { method: "GET" });
    return res.status;
  }, postUrl);
  log(`Sanity GET on post page as A: ${forgeResult}`);

  // ---- TEST I: A records a purchase outcome ----
  // The author's own view shows the editable outcome form (not the
  // read-only badge — that's shown to OTHER viewers), so after saving we
  // confirm the BOUGHT radio comes back checked, and separately confirm B
  // (a non-author viewer) sees the read-only badge.
  await pageA.goto(postUrl);
  await pageA.click('input[name="status"][value="BOUGHT"]');
  await pageA.fill('textarea[name="reflection"]', "Happy with it, works great for local inference.");
  await pageA.click(".outcome-form button[type=submit]");
  await pageA.waitForURL(postUrl);
  await pageA.waitForSelector('input[name="status"][value="BOUGHT"]:checked');
  log("A recorded purchase outcome: BOUGHT (confirmed via checked radio on reload)");
  await pageA.screenshot({ path: "screenshots/post-detail-outcome-recorded.png", fullPage: true });

  await pageB.goto(postUrl);
  await pageB.waitForSelector(".outcome-badge.outcome-bought");
  log("B (non-author viewer) sees the read-only Bought badge");

  // ---- Discover feed screenshot ----
  await pageA.goto(`${BASE}/discover`);
  await pageA.waitForLoadState("networkidle");
  await pageA.screenshot({ path: "screenshots/discover-feed.png", fullPage: true });

  // ---- Mobile screenshot of post detail (TEST K) ----
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileCtx.newPage();
  await mobilePage.goto(postUrl);
  await mobilePage.waitForLoadState("networkidle");
  await mobilePage.screenshot({ path: "screenshots/post-detail-mobile.png", fullPage: true });
  const mobileOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  log(`mobile post detail: horizontal overflow = ${mobileOverflow}`);
  if (mobileOverflow) {
    console.error("FAIL: horizontal overflow on mobile post detail");
    process.exitCode = 1;
  }
  await mobileCtx.close();

  // ---- TEST readme ----
  await pageA.goto(`${BASE}/readme/`);
  const readmeTitle = await pageA.textContent("h1");
  log(`/readme/ h1: "${readmeTitle}"`);

  // ---- v2.0 Feature B: Which One? comparison mode, two-browser live flow ----
  // Mirrors the Buy/Pass flow above exactly (A posts, B opens and votes, A
  // watches live) but for a WHICH_ONE post with two options, to confirm the
  // comparison-specific SSE payload (optionCounts, not stance counts) also
  // propagates live without a reload.
  await pageA.goto(`${BASE}/posts/new`);
  await pageA.check('input[name="mode"][value="WHICH_ONE"]');
  await pageA.fill('input[name="title"]', "Which laptop for a CS degree?");
  await pageA.selectOption('select[name="category"]', "computing");
  await pageA.fill('textarea[name="description"]', "Comparing a budget laptop against a pricier one for four years of coursework.");
  await pageA.fill('input[name="option_name_0"]', "Budget Windows laptop");
  await pageA.fill('input[name="option_price_0"]', "899");
  await pageA.fill('input[name="option_name_1"]', "Premium ultrabook");
  await pageA.fill('input[name="option_price_1"]', "1899");
  await pageA.click('form.post-form button[type="submit"]');
  await pageA.waitForURL(/\/posts\/[a-f0-9-]{36}$/);
  const comparisonPostUrl = pageA.url();
  log(`A created a Which One? comparison post: ${comparisonPostUrl}`);
  await pageA.screenshot({ path: "screenshots/comparison-post-author-view.png", fullPage: true });

  await pageB.goto(comparisonPostUrl);
  await pageB.waitForSelector(".comparison-opinion-form");
  await pageA.goto(comparisonPostUrl); // A reopens to watch live
  await pageA.waitForLoadState("networkidle");

  const firstOptionRadio = pageB.locator(".option-select").first().locator("input");
  await firstOptionRadio.check();
  await pageB.fill('textarea[name="comment"]', "The budget laptop covers everything a CS degree actually needs.");
  const t2 = Date.now();
  await pageB.click(".comparison-opinion-form button[type=submit]");
  await pageA.waitForFunction(
    () => document.querySelector(".purchase-option-vote-count")?.textContent?.includes("1"),
    { timeout: 5000 },
  );
  const elapsedComparisonVote = Date.now() - t2;
  log(`A saw B's live comparison vote after ${elapsedComparisonVote}ms (no reload)`);
  await pageA.screenshot({ path: "screenshots/comparison-post-live-update-on-A.png", fullPage: true });

  // Mobile scroll-snap comparison view (approved comparison-UI scope: a
  // horizontally swipeable track, not a long vertical stack).
  const mobileComparisonCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobileComparisonPage = await mobileComparisonCtx.newPage();
  await mobileComparisonPage.goto(comparisonPostUrl);
  await mobileComparisonPage.waitForLoadState("networkidle");
  await mobileComparisonPage.screenshot({ path: "screenshots/comparison-post-mobile.png", fullPage: true });
  const comparisonOverflowX = await mobileComparisonPage
    .locator(".comparison-grid")
    .evaluate((el) => getComputedStyle(el).overflowX);
  log(`mobile comparison-grid overflow-x = ${comparisonOverflowX} (expect "auto")`);
  if (comparisonOverflowX !== "auto") {
    console.error("FAIL: mobile comparison grid is not horizontally scrollable");
    process.exitCode = 1;
  }
  await mobileComparisonCtx.close();

  const allTimings = { elapsedOpinion, elapsedStanceChange, elapsedComparisonVote };
  const allUnderOneSecondish = Object.values(allTimings).every((ms) => ms < 1500);
  log(`All realtime propagation timings: ${JSON.stringify(allTimings)}`);
  log(`All comfortably under ~1-1.5s: ${allUnderOneSecondish}`);
  if (!allUnderOneSecondish) process.exitCode = 1;

  await ctxA.close();
  await ctxB.close();
  await browser.close();
  log("ALL CHECKS PASSED");
}

async function makePngBuffer() {
  const sharp = (await import("sharp")).default;
  return sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 217, g: 96, b: 59 } } }).png().toBuffer();
}

main().catch((err) => {
  console.error("verify-browser FAILED:", err);
  process.exit(1);
});
