// Regression for a duplicate-post bug found under throttled networks
// (2026-11-05 slow-network acceptance): on Chrome's Slow 3G profile a
// double-click on "Publish post" sent two identical requests and created two
// posts, in 5 of 5 attempts. app.js's initSubmitOnce now lets a POST form
// submit once. This runs the real src/public/app.js in jsdom, so it needs no
// browser; the browser-level check is TEST 13 in scripts/verify-realtime.mjs.
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const APP_JS = readFileSync(new URL("../src/public/app.js", import.meta.url), "utf8");

function page(formHtml: string) {
  const dom = new JSDOM(`<!doctype html><body>${formHtml}</body>`, { runScripts: "outside-only", url: "http://localhost/" });
  const { window } = dom;
  // app.js wires EventSource only on post/feed pages; neither is present here.
  window.eval(APP_JS);
  return window;
}

function submit(window: any, form: HTMLFormElement): boolean {
  const ev = new window.SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: form.querySelector("button") });
  form.dispatchEvent(ev);
  return !ev.defaultPrevented;
}

describe("submit-once guard (initSubmitOnce)", () => {
  it("lets the first submit of a POST form through and blocks the second", () => {
    const window = page(`<form method="post" action="/posts/new" class="form-stack post-form"><button type="submit">Publish post</button></form>`);
    const form = window.document.querySelector("form")!;
    expect(submit(window, form)).toBe(true);
    expect(submit(window, form)).toBe(false);
    expect(submit(window, form)).toBe(false);
  });

  it("tells the user it is publishing, without disabling the button outright", () => {
    const window = page(`<form method="post" action="/posts/new" class="form-stack post-form"><button type="submit">Publish post</button></form>`);
    const form = window.document.querySelector("form")!;
    submit(window, form);
    const button = form.querySelector("button")!;
    expect(button.textContent).toBe("Publishing…");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.disabled).toBe(false);
  });

  it("re-arms when the page is shown again (Back after a failed or abandoned submit)", () => {
    const window = page(`<form method="post" action="/posts/new" class="form-stack post-form"><button type="submit">Publish post</button></form>`);
    const form = window.document.querySelector("form")!;
    submit(window, form);
    window.dispatchEvent(new window.Event("pageshow"));
    const button = form.querySelector("button")!;
    expect(button.textContent).toBe("Publish post");
    expect(button.hasAttribute("aria-disabled")).toBe(false);
    expect(submit(window, form)).toBe(true);
  });

  it("guards each form independently and leaves GET forms (search) alone", () => {
    const window = page(`
      <form method="post" action="/posts/x/opinions" id="a"><button type="submit">Submit opinion</button></form>
      <form method="post" action="/posts/x/outcome" id="b"><button type="submit">Save outcome</button></form>
      <form method="get" action="/discover" id="s"><button type="submit">Search</button></form>`);
    const [a, b, s] = ["a", "b", "s"].map((id) => window.document.getElementById(id) as HTMLFormElement);
    expect(submit(window, a)).toBe(true);
    expect(submit(window, b)).toBe(true);
    expect(submit(window, a)).toBe(false);
    expect(submit(window, s)).toBe(true);
    expect(submit(window, s)).toBe(true);
  });
});
