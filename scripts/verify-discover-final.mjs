// Final clean-database verification + screenshot capture for the Discover
// content-source refinement, run against the isolated preview database
// (6 demo users, 18 demo posts, no accumulated test-account noise) rather
// than the shared test server. Read-only: creates nothing, so the preview
// database stays exactly as clean as it started.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.APP_URL ?? "http://localhost:8080";
mkdirSync("screenshots/design-audit-after", { recursive: true });

function log(msg) {
  console.log(`[verify-discover-final] ${msg}`);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/discover`);
  await page.waitForLoadState("networkidle");
  const allCardCount = await page.locator(".post-card").count();
  const allDemoCount = await page.locator(".post-card-demo").count();
  log(`Default /discover (All questions): ${allCardCount} card(s) total, ${allDemoCount} demo`);
  await page.screenshot({ path: "screenshots/design-audit-after/02-discover-all-clean-1440x900.png", fullPage: true });

  await page.goto(`${BASE}/discover?category=home-kitchen`);
  await page.waitForLoadState("networkidle");
  const hkCount = await page.locator(".post-card").count();
  log(`Home & Kitchen + All Questions: ${hkCount} card(s)`);
  await page.screenshot({ path: "screenshots/design-audit-after/02-discover-homekitchen-all-clean-1440x900.png", fullPage: true });

  await page.goto(`${BASE}/discover?source=community`);
  await page.waitForLoadState("networkidle");
  const communityCount = await page.locator(".post-card").count();
  log(`Community tab (clean db, expect 0 real posts): ${communityCount} card(s)`);
  await page.screenshot({ path: "screenshots/design-audit-after/02-discover-community-clean-1440x900.png", fullPage: true });

  await page.goto(`${BASE}/discover?source=demo`);
  await page.waitForLoadState("networkidle");
  const demoCount = await page.locator(".post-card-demo").count();
  log(`Demo examples tab: ${demoCount} card(s)`);
  await page.screenshot({ path: "screenshots/design-audit-after/03-discover-demo-clean-1440x900.png", fullPage: true });

  // 1920x1080
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${BASE}/discover`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "screenshots/design-audit-after/02-discover-all-clean-1920x1080.png", fullPage: true });

  // mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/discover`);
  await page.waitForLoadState("networkidle");
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  log(`Mobile (390px) All questions horizontal overflow: ${mobileOverflow}`);
  await page.screenshot({ path: "screenshots/design-audit-after/02-discover-all-clean-390x844.png", fullPage: true });

  await page.goto(`${BASE}/discover?source=demo`);
  await page.waitForLoadState("networkidle");
  const mobileDemoOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  log(`Mobile (390px) Demo examples horizontal overflow: ${mobileDemoOverflow}`);
  await page.screenshot({ path: "screenshots/design-audit-after/03-discover-demo-clean-390x844.png", fullPage: true });

  // landing page (clean db — real feed should be empty, honest empty state + demo preview)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "screenshots/design-audit-after/01-landing-clean-1440x900.png", fullPage: true });

  await ctx.close();
  await browser.close();
  log("DONE");
}

main().catch((err) => {
  console.error("verify-discover-final FAILED:", err);
  process.exit(1);
});
