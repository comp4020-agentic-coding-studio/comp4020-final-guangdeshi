// Manual verification of the admin observability page through a real
// browser: live log streaming, stats, and the report resolve/dismiss
// controls. Separate from verify-browser.mjs so the main multi-user flow
// script stays focused. Run with: node scripts/verify-admin.mjs
// (expects the app running with RATE_LIMIT_SCALE set high, see "dev:test").
import { chromium } from "playwright";
import { DatabaseSync } from "node:sqlite";

const BASE = process.env.APP_URL ?? "http://localhost:8080";
const DB_PATH = process.env.DATABASE_PATH ?? "./data/buyorpass.test.sqlite";

function log(msg) {
  console.log(`[verify-admin] ${msg}`);
}

function uniqueHandle(prefix) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

async function register(page, prefix) {
  const handle = uniqueHandle(prefix);
  const email = `${handle}@example.com`;
  await page.goto(`${BASE}/register`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="handle"]', handle);
  await page.fill('input[name="displayName"]', `${prefix} Admin Test`);
  await page.fill('input[name="password"]', "password123");
  await page.click('form.form-stack button[type="submit"]');
  await page.waitForURL(`${BASE}/discover`);
  return { handle, email };
}

async function main() {
  const browser = await chromium.launch();

  const ctxAuthor = await browser.newContext();
  const pageAuthor = await ctxAuthor.newPage();
  const author = await register(pageAuthor, "rptauthor");

  const ctxReporter = await browser.newContext();
  const pageReporter = await ctxReporter.newPage();
  const reporter = await register(pageReporter, "rptreporter");

  // Author creates a post; reporter reports it.
  await pageAuthor.goto(`${BASE}/posts/new`);
  await pageAuthor.fill('input[name="title"]', "Admin verification test post");
  await pageAuthor.fill('textarea[name="description"]', "A post used only to exercise the admin report flow.");
  await pageAuthor.selectOption('select[name="category"]', "computing");
  const sharp = (await import("sharp")).default;
  const buf = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 50, g: 80, b: 200 } } }).png().toBuffer();
  await pageAuthor.setInputFiles('input[name="images"]', { name: "test.png", mimeType: "image/png", buffer: buf });
  await pageAuthor.click('form.post-form button[type="submit"]');
  await pageAuthor.waitForURL(/\/posts\/[a-f0-9-]{36}$/);
  const postUrl = pageAuthor.url();
  log(`author created post: ${postUrl}`);

  await pageReporter.goto(postUrl);
  await pageReporter.click("summary:has-text('Report this post')");
  await pageReporter.fill('textarea[name="reason"]', "Playwright admin verification report");
  await pageReporter.click(".report-form button[type=submit]");
  await pageReporter.waitForTimeout(500);
  log("reporter filed a report");

  // Grant admin directly via the test database (the only legitimate way to
  // create an admin locally, short of a dedicated seed script — see
  // PROCESS.md for how this is done for the real C10 rehearsal).
  const db = new DatabaseSync(DB_PATH);
  db.prepare("UPDATE users SET is_admin = 1 WHERE email = ?").run(author.email);
  db.close();
  log(`granted is_admin to ${author.email} directly in the test database`);

  const ctxAdmin = await browser.newContext();
  const pageAdmin = await ctxAdmin.newPage();
  await pageAdmin.goto(`${BASE}/login`);
  await pageAdmin.fill('input[name="email"]', author.email);
  await pageAdmin.fill('input[name="password"]', "password123");
  await pageAdmin.click('form.form-stack button[type="submit"]');
  await pageAdmin.waitForURL(`${BASE}/discover`);

  await pageAdmin.goto(`${BASE}/admin`);
  await pageAdmin.waitForSelector("#stat-connection.connected", { timeout: 5000 });
  log("admin page connected to live log stream");

  // Trigger a fresh event (another opinion) and confirm it appears live.
  await pageReporter.goto(postUrl);
  // reporter is not the author, so they CAN opine
  await pageReporter.click('input[name="stance"][value="BUY"]');
  await pageReporter.fill('textarea[name="comment"]', "Admin live-log verification opinion");
  await pageReporter.click("#opinion-form button[type=submit]");

  await pageAdmin.waitForFunction(
    () => document.getElementById("admin-log")?.textContent?.includes("opinion.created") ||
          document.getElementById("admin-log")?.textContent?.includes("opinion.updated"),
    { timeout: 5000 },
  );
  log("admin saw the opinion event appear live in the log, with no page reload");
  await pageAdmin.screenshot({ path: "screenshots/admin-observability.png", fullPage: true });

  // Confirm the report appears in the open-reports panel, then resolve it.
  await pageAdmin.waitForSelector(".admin-report-row", { timeout: 5000 });
  const reportCountBefore = await pageAdmin.locator(".admin-report-row").count();
  log(`admin sees ${reportCountBefore} open report(s)`);
  await pageAdmin.click('[data-resolve-report]');
  await pageAdmin.waitForTimeout(1000);
  const reportCountAfter = await pageAdmin.locator(".admin-report-row").count();
  log(`after resolving, ${reportCountAfter} open report(s) remain`);
  if (reportCountAfter >= reportCountBefore) {
    console.error("FAIL: resolving a report did not remove it from the open-reports panel");
    process.exitCode = 1;
  }

  // Confirm a non-admin is denied the page entirely.
  const deniedRes = await pageReporter.goto(`${BASE}/admin`);
  log(`non-admin visiting /admin got status: ${deniedRes.status()}`);
  if (deniedRes.status() !== 403) {
    console.error("FAIL: non-admin was not denied /admin with 403");
    process.exitCode = 1;
  }

  await browser.close();
  if (process.exitCode !== 1) log("ALL ADMIN CHECKS PASSED");
}

main().catch((err) => {
  console.error("verify-admin FAILED:", err);
  process.exit(1);
});
