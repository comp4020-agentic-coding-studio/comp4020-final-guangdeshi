// Read-only verification for the "real product photography + real-world
// references" refinement, run against the isolated preview database (6
// demo users, 18 demo posts). Creates nothing — just captures screenshots
// and a few sanity counts for visual inspection.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.APP_URL ?? "http://localhost:8080";
mkdirSync("screenshots/design-audit-after", { recursive: true });

function log(msg) {
  console.log(`[verify-real-content] ${msg}`);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Default Discover (All questions) — should now show real photos, not
  // the old all-black headphones card.
  await page.goto(`${BASE}/discover`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "screenshots/design-audit-after/04-discover-all-real-photos-1440x900.png", fullPage: true });

  // Home & Kitchen specifically — now has 3 real photos (espresso, air
  // fryer, robot vacuum) among its 5 cards.
  await page.goto(`${BASE}/discover?category=home-kitchen`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "screenshots/design-audit-after/04-discover-homekitchen-real-photos-1440x900.png", fullPage: true });

  // Audio category — the corrected headphones card specifically.
  await page.goto(`${BASE}/discover?category=audio`);
  await page.waitForLoadState("networkidle");
  const audioCardCount = await page.locator(".post-card").count();
  log(`Audio category: ${audioCardCount} card(s)`);
  await page.screenshot({ path: "screenshots/design-audit-after/05-discover-audio-headphones-fixed-1440x900.png", fullPage: true });

  // New "Real-world examples" tab.
  await page.goto(`${BASE}/discover?source=references`);
  await page.waitForLoadState("networkidle");
  const refCardCount = await page.locator(".reference-card").count();
  log(`Real-world examples tab: ${refCardCount} reference card(s)`);
  await page.screenshot({ path: "screenshots/design-audit-after/06-discover-references-1440x900.png", fullPage: true });

  // References filtered by category.
  await page.goto(`${BASE}/discover?source=references&category=computing`);
  await page.waitForLoadState("networkidle");
  const computingRefCount = await page.locator(".reference-card").count();
  log(`Real-world examples + Computing & Tech: ${computingRefCount} reference card(s)`);
  await page.screenshot({ path: "screenshots/design-audit-after/06-discover-references-computing-1440x900.png", fullPage: true });

  // 1920x1080 full view
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${BASE}/discover?source=references`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "screenshots/design-audit-after/06-discover-references-1920x1080.png", fullPage: true });

  // Mobile — references tab + default tab, overflow check
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/discover?source=references`);
  await page.waitForLoadState("networkidle");
  const mobileRefOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  log(`Mobile (390px) References tab horizontal overflow: ${mobileRefOverflow}`);
  await page.screenshot({ path: "screenshots/design-audit-after/06-discover-references-390x844.png", fullPage: true });

  await page.goto(`${BASE}/discover`);
  await page.waitForLoadState("networkidle");
  const mobileAllOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  log(`Mobile (390px) All questions (4 tabs) horizontal overflow: ${mobileAllOverflow}`);
  await page.screenshot({ path: "screenshots/design-audit-after/04-discover-all-real-photos-390x844.png", fullPage: true });

  await ctx.close();
  await browser.close();
  log("DONE");
}

main().catch((err) => {
  console.error("verify-real-content FAILED:", err);
  process.exit(1);
});
