// One-off browser verification for the real product catalog (not part of
// `pnpm check`). Drives real Chromium through the catalog flows end to end:
//   1. Discover's fold shows real product photos, no placeholder cards, no
//      article-length card text, at 1440x900 / 1920x1080 / 390x844;
//   2. "Ask about this" opens a prefilled form; user A publishes a Buy or
//      Pass question about a catalog product (no photo upload, own price);
//   3. user B opines and A sees it live over SSE, without a reload;
//   4. the product page lists A's question;
//   5. the compare tray on product pages builds a Which One? post from
//      catalog products; B votes and A sees the option count update live.
//
// It registers real test accounts, so it must only ever run against an
// isolated test server and database:
//   PORT=8081 RATE_LIMIT_SCALE=1000 DATABASE_PATH=/tmp/x/db.sqlite UPLOAD_DIR=/tmp/x/uploads node src/server.ts
//   APP_URL=http://localhost:8081 node scripts/verify-catalog.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.APP_URL;
if (!BASE || /:8080\b/.test(BASE)) {
  console.error("Refusing to run: set APP_URL to an isolated test server (never the 8080 preview server).");
  process.exit(2);
}
const OUT = process.env.SCREENSHOT_DIR ?? "screenshots/catalog";
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  "1440x900": { width: 1440, height: 900 },
  "1920x1080": { width: 1920, height: 1080 },
  "390x844": { width: 390, height: 844 },
};

let failures = 0;
function log(msg) {
  console.log(`[verify-catalog] ${msg}`);
}
function check(ok, msg) {
  if (ok) log(`PASS ${msg}`);
  else {
    failures++;
    console.error(`[verify-catalog] FAIL ${msg}`);
  }
}

async function register(page, prefix) {
  const handle = `${prefix}${Date.now()}${Math.floor(Math.random() * 10000)}`;
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="email"]', `${handle}@example.com`);
  await page.fill('input[name="handle"]', handle);
  await page.fill('input[name="displayName"]', `${prefix} Playwright`);
  await page.fill('input[name="password"]', "password123");
  await page.click('form.form-stack button[type="submit"]');
  await page.waitForURL(`${BASE}/discover`);
  return handle;
}

async function auditFold(page, label) {
  const report = await page.evaluate(() => {
    const vh = window.innerHeight;
    const cards = [...document.querySelectorAll(".product-card")];
    const inFold = cards.filter((c) => c.getBoundingClientRect().top < vh);
    const imgs = inFold.map((c) => c.querySelector(".product-card-image img"));
    return {
      cards: cards.length,
      inFold: inFold.length,
      realPhotos: imgs.filter((i) => i && i.complete && i.naturalWidth >= 600 && i.src.includes("/static/catalog/")).length,
      placeholders: document.querySelectorAll(".post-card-image-placeholder, .reference-card-image-placeholder").length,
      longestCardText: Math.max(0, ...cards.map((c) => (c.querySelector(".product-card-body")?.textContent ?? "").trim().length)),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      askButtons: inFold.filter((c) => c.querySelector('a[href^="/posts/new?product="]')).length,
    };
  });
  log(`${label}: ${JSON.stringify(report)}`);
  check(report.inFold >= 2 && report.realPhotos === report.inFold, `${label}: every card in the fold shows a real catalog photo`);
  check(report.placeholders === 0, `${label}: no placeholder cards`);
  check(report.longestCardText < 200, `${label}: card text stays short (${report.longestCardText} chars max)`);
  check(!report.overflow, `${label}: no horizontal overflow`);
  check(report.askButtons === report.inFold, `${label}: every card in the fold has an Ask action`);
}

async function main() {
  const browser = await chromium.launch();

  // ---- 1. Fold audit + screenshots at three viewports ----
  for (const [label, viewport] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/discover`);
    await page.waitForLoadState("networkidle");
    await auditFold(page, `discover ${label}`);
    await page.screenshot({ path: `${OUT}/discover-${label}.png` });
    await page.goto(`${BASE}/products/abo-b07pdyw6vm`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${OUT}/product-${label}.png` });
    await page.goto(`${BASE}/`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${OUT}/landing-${label}.png` });
    await ctx.close();
  }

  // ---- 2. A asks about a catalog product via the card's Ask button ----
  const ctxA = await browser.newContext({ viewport: VIEWPORTS["1440x900"] });
  const ctxB = await browser.newContext({ viewport: VIEWPORTS["1440x900"] });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const handleA = await register(pageA, "alice");
  const handleB = await register(pageB, "bob");
  log(`registered @${handleA} and @${handleB} (test accounts on the isolated server)`);

  await pageA.goto(`${BASE}/discover?category=audio`);
  const askHref = await pageA.locator('.product-card a[href^="/posts/new?product="]').first().getAttribute("href");
  const productId = new URL(askHref, BASE).searchParams.get("product");
  await pageA.click(`.product-card a[href="${askHref}"]`);
  await pageA.waitForURL(/\/posts\/new\?product=/);
  check(await pageA.locator(`input[name="catalog_product_id"][value="${productId}"]`).count() === 1, "Ask button opens the form with the catalog product attached");
  await pageA.screenshot({ path: `${OUT}/ask-form-prefilled.png`, fullPage: true });
  const title = `Worth it for a small balcony? ${Date.now()}`;
  await pageA.fill('input[name="title"]', title);
  await pageA.fill('textarea[name="description"]', "I'd use it outdoors a few evenings a week; my phone speaker is too quiet.");
  await pageA.fill('input[name="price"]', "79");
  await pageA.click('form.post-form button[type="submit"]');
  await pageA.waitForURL(/\/posts\/[a-f0-9-]{36}$/);
  const postUrl = pageA.url();
  check(await pageA.locator(`img[src="/static/catalog/${productId}.jpg"]`).count() > 0, "published post shows the catalog photo (no upload needed)");
  check(await pageA.locator(`a.post-catalog-link[href="/products/${productId}"]`).count() === 1, "published post links back to its product page");

  // ---- 3. B opines, A sees it live ----
  await pageA.goto(postUrl);
  await pageA.waitForLoadState("networkidle");
  await pageB.goto(postUrl);
  await pageB.waitForSelector("#opinion-form");
  await pageB.click('input[value="BUY"]');
  await pageB.fill('textarea[name="comment"]', "Loud enough for a balcony and it's water-resistant.");
  const t0 = Date.now();
  await pageB.click('#opinion-form button[type="submit"]');
  try {
    await pageA.waitForFunction(() => document.getElementById("count-buy")?.textContent?.includes("1"), { timeout: 5000 });
    check(true, `A saw B's opinion live after ${Date.now() - t0}ms (SSE, no reload)`);
  } catch {
    check(false, "A did not see B's opinion live within 5s");
  }
  await pageA.screenshot({ path: `${OUT}/catalog-post-live-on-A.png`, fullPage: true });

  // ---- 4. Product page lists the question ----
  await pageB.goto(`${BASE}/products/${productId}`);
  check(await pageB.locator(`a[href="${new URL(postUrl).pathname}"]`).count() > 0, "product page lists the new community question");
  await pageB.screenshot({ path: `${OUT}/product-with-question.png`, fullPage: true });

  // ---- 5. Compare tray → Which One? from catalog products ----
  await pageA.goto(`${BASE}/discover?category=audio`);
  const productLinks = await pageA.locator('.product-card a.product-card-link').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const picks = [...new Set(productLinks)].slice(0, 3);
  for (const href of picks) {
    await pageA.goto(`${BASE}${href}`);
    await pageA.click("[data-compare-toggle]");
  }
  await pageA.waitForSelector(".compare-tray");
  await pageA.screenshot({ path: `${OUT}/compare-tray.png` });
  await pageA.click(".compare-tray [data-compare-go]");
  await pageA.waitForURL(/\/posts\/new\?compare=/);
  const optionInputs = await pageA.locator('input[name^="option_catalog_product_id_"]').count();
  check(optionInputs === picks.length, `compare tray opened a Which One? form with ${optionInputs} catalog options`);
  await pageA.screenshot({ path: `${OUT}/compare-form-prefilled.png`, fullPage: true });
  for (let i = 0; i < optionInputs; i++) await pageA.fill(`input[name="option_price_${i}"]`, String(40 + i * 15));
  await pageA.fill('textarea[name="description"]', "Small flat, mostly podcasts and some music while cooking.");
  await pageA.click('form.post-form button[type="submit"]');
  await pageA.waitForURL(/\/posts\/[a-f0-9-]{36}$/);
  const comparisonUrl = pageA.url();
  const optionPhotos = await pageA.locator('img[src^="/static/catalog/"]').count();
  check(optionPhotos >= picks.length, `comparison post shows catalog photos for its options (${optionPhotos})`);

  await pageB.goto(comparisonUrl);
  await pageB.waitForSelector("#opinion-form");
  await pageA.goto(comparisonUrl);
  await pageA.waitForLoadState("networkidle");
  const before = await pageA.locator(".purchase-option-card").first().textContent();
  await pageB.locator('input[name="selectedOptionId"]').first().check();
  await pageB.fill('textarea[name="comment"]', "The first one is smaller and fits a kitchen shelf.");
  await pageB.click('#opinion-form button[type="submit"]');
  try {
    await pageA.waitForFunction((prev) => document.querySelector(".purchase-option-card")?.textContent !== prev, before, { timeout: 5000 });
    check(true, "A saw B's comparison vote live (SSE)");
  } catch {
    check(false, "A did not see B's comparison vote live within 5s");
  }
  await pageA.screenshot({ path: `${OUT}/comparison-live-on-A.png`, fullPage: true });

  const mobile = await browser.newContext({ viewport: VIEWPORTS["390x844"] });
  const mp = await mobile.newPage();
  await mp.goto(comparisonUrl);
  await mp.waitForLoadState("networkidle");
  check(!(await mp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), "comparison post: no horizontal overflow at 390px");
  await mp.screenshot({ path: `${OUT}/comparison-390x844.png`, fullPage: true });

  await browser.close();
  log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} check(s) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
