import { expect, inject, it } from "vitest";

// This week's own contract, on top of the shipped invariants: the core
// interaction (take the topmost stick) persists across what a reload is to a
// client — a fresh GET / — and a duplicate removal can't corrupt the count.
const baseUrl = inject("baseUrl");

async function getHtml(): Promise<string> {
  const res = await fetch(new URL("/", baseUrl));
  return res.text();
}

function remainingCount(html: string): number {
  const match = html.match(/id="status"[^>]*>(\d+) sticks? remaining/);
  if (!match) throw new Error("could not read the remaining-stick count from /");
  return Number(match[1]);
}

function topmostId(html: string): string | null {
  const match = html.match(/data-id="([^"]+)"\s+role="button"/);
  return match ? match[1] : null;
}

async function removeStick(stickId: string): Promise<Response> {
  return fetch(new URL("/api/remove", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stickId }),
  });
}

it("removes the topmost stick and the trace survives a reload", async () => {
  const before = await getHtml();
  const beforeCount = remainingCount(before);
  const topId = topmostId(before);
  expect(topId, "no removable stick found — has the pile already run out?").not.toBeNull();

  const removeRes = await removeStick(topId as string);
  expect(removeRes.status).toBe(200);

  // a reload is just another GET /, against the same persisted state
  const after = await getHtml();
  expect(remainingCount(after)).toBe(beforeCount - 1);
  expect(after.includes(`data-id="${topId}"`), "removed stick re-appeared after reload").toBe(false);
});

it("a duplicate removal of the same stick does not corrupt the count", async () => {
  const before = await getHtml();
  const beforeCount = remainingCount(before);
  const topId = topmostId(before);
  expect(topId, "no removable stick found — has the pile already run out?").not.toBeNull();

  await removeStick(topId as string);
  const dupRes = await removeStick(topId as string);
  expect(dupRes.status).not.toBe(200);

  const after = await getHtml();
  expect(remainingCount(after)).toBe(beforeCount - 1);
});

it("rejects removing a stick that isn't the current topmost one", async () => {
  const html = await getHtml();
  const topId = topmostId(html);
  expect(topId).not.toBeNull();

  const res = await removeStick("not-a-real-or-topmost-stick-id");
  expect(res.status).toBe(409);

  const after = await getHtml();
  expect(topmostId(after)).toBe(topId);
});
