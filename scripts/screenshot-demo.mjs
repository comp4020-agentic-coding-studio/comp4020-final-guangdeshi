// Captures a few key marketing/demo screenshots independent of
// verify-browser.mjs's test-flow screenshots: the landing page in its
// resting state, and the login/register pages.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.APP_URL ?? "http://localhost:8080";
mkdirSync("screenshots", { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(BASE);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: "screenshots/demo-landing.png", fullPage: true });

await page.goto(`${BASE}/register`);
await page.screenshot({ path: "screenshots/demo-register.png", fullPage: true });

await page.goto(`${BASE}/login`);
await page.screenshot({ path: "screenshots/demo-login.png", fullPage: true });

await browser.close();
console.log("captured screenshots/demo-*.png");
