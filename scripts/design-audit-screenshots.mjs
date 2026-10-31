// Design audit screenshot capture — NOT part of pnpm check, a one-off tool
// for the visual design review. Captures real, labelled demo content at
// three required viewports across every major page type. Does not modify
// any application code or data beyond what registering two throwaway
// accounts requires (for the create-post and mobile-nav screenshots).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const BASE = process.env.APP_URL ?? "http://localhost:8080";
const DIR = "screenshots/design-audit";
mkdirSync(DIR, { recursive: true });

const VIEWPORTS = {
  "1440x900": { width: 1440, height: 900 },
  "1920x1080": { width: 1920, height: 1080 },
  "390x844": { width: 390, height: 844 },
};

function log(msg) {
  console.log(`[audit] ${msg}`);
}

function uniqueHandle(prefix) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

async function register(page, prefix) {
  const handle = uniqueHandle(prefix);
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="email"]', `${handle}@example.com`);
  await page.fill('input[name="handle"]', handle);
  await page.fill('input[name="displayName"]', `${prefix} Audit`);
  await page.fill('input[name="password"]', "password123");
  await page.click('form.form-stack button[type="submit"]');
  await page.waitForURL(`${BASE}/discover`);
  return handle;
}

async function shootAllViewports(browser, path, name, opts = {}) {
  for (const [label, viewport] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle");
    if (opts.waitFor) await page.waitForSelector(opts.waitFor, { timeout: 5000 }).catch(() => {});
    await page.screenshot({ path: `${DIR}/${name}-${label}.png`, fullPage: true });
    log(`captured ${name}-${label}.png`);
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch();

  // Find real demo post ids directly from the DB so screenshots use actual
  // seeded content rather than throwaway test posts.
  const db = new DatabaseSync(process.env.DATABASE_PATH ?? "./data/buyorpass.test.sqlite");
  const buyPassPost = db
    .prepare(
      `SELECT p.id FROM posts p JOIN post_outcomes o ON o.post_id = p.id
       WHERE p.is_demo = 1 AND p.post_mode = 'BUY_PASS' AND o.status = 'BOUGHT'
       ORDER BY p.created_at DESC LIMIT 1`,
    )
    .get().id;
  const comparisonPost = db
    .prepare(
      `SELECT p.id FROM posts p JOIN post_outcomes o ON o.post_id = p.id
       WHERE p.is_demo = 1 AND p.post_mode = 'WHICH_ONE' AND o.status = 'BOUGHT'
       ORDER BY p.created_at DESC LIMIT 1`,
    )
    .get().id;
  db.close();
  log(`using Buy/Pass post ${buyPassPost}, comparison post ${comparisonPost}`);

  // 1. Landing page
  await shootAllViewports(browser, "/", "01-landing");

  // 2. Discover feed
  await shootAllViewports(browser, "/discover", "02-discover-feed");

  // 3. Explore Demo feed
  await shootAllViewports(browser, "/discover/demo", "03-demo-feed", { waitFor: ".post-card-demo" });

  // 4. Buy or Pass post detail (with recorded outcome / purchase follow-up)
  await shootAllViewports(browser, `/posts/${buyPassPost}`, "04-buypass-detail");

  // 5. Which One? comparison post detail (with recorded outcome)
  await shootAllViewports(browser, `/posts/${comparisonPost}`, "05-comparison-detail", { waitFor: ".comparison-grid" });

  // 6. Create Post form — needs a logged-in session, captured separately
  // since it's not a bare GET for an anonymous visitor in every state we
  // want (BUY_PASS default view, then WHICH_ONE after the mode toggle).
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["1440x900"] });
    const page = await ctx.newPage();
    await register(page, "audrw");
    await page.goto(`${BASE}/posts/new`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${DIR}/06-create-post-buypass-1440x900.png`, fullPage: true });
    log("captured 06-create-post-buypass-1440x900.png");

    await page.check('input[name="mode"][value="WHICH_ONE"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${DIR}/06-create-post-whichone-1440x900.png`, fullPage: true });
    log("captured 06-create-post-whichone-1440x900.png");
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["390x844"] });
    const page = await ctx.newPage();
    await register(page, "audmob");
    await page.goto(`${BASE}/posts/new`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${DIR}/06-create-post-mobile-390x844.png`, fullPage: true });
    log("captured 06-create-post-mobile-390x844.png");
    await ctx.close();
  }

  // 7. Purchase follow-up section close-up (own-author editable outcome form
  // plus a non-author read-only view) — reuse the Buy/Pass post, logged out
  // (read-only badge) vs the actual author requires login we don't have
  // credentials for on a demo account, so this captures the non-author
  // read-only presentation, which is what most real visitors will see.
  await shootAllViewports(browser, `/posts/${buyPassPost}`, "07-purchase-followup-readonly");

  // 8. Mobile navigation — landing page header/nav interaction at mobile width
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["390x844"] });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/discover`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${DIR}/08-mobile-nav-discover.png`, fullPage: false });
    log("captured 08-mobile-nav-discover.png (viewport-only, not full page)");
    await ctx.close();
  }

  // 9. Mobile comparison page specifically, viewport-only (not full page) to
  // see the actual swipeable card viewport as a user would on first load.
  {
    const ctx = await browser.newContext({ viewport: VIEWPORTS["390x844"] });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/posts/${comparisonPost}`);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector(".comparison-grid");
    await page.screenshot({ path: `${DIR}/09-mobile-comparison-viewport.png`, fullPage: false });
    log("captured 09-mobile-comparison-viewport.png (viewport-only)");
    await ctx.close();
  }

  await browser.close();
  log("DONE");
}

main().catch((err) => {
  console.error("design-audit-screenshots FAILED:", err);
  process.exit(1);
});
