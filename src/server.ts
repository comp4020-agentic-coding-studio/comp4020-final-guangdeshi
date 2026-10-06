import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { getRemovedIds, markRemoved } from "./db.ts";
import { renderMarkdown } from "./markdown.ts";
import { STICKS, type Stick } from "./sticks.ts";

const PORT = Number(process.env.PORT ?? 8080);
const WOOD_COLORS = ["#b5793a", "#9c6b32", "#c98f4c", "#8a5a2b", "#d9a65c"];

interface State {
  remaining: Stick[];
  topmostId: string | null;
}

// Single source of truth for every request: who's left, and which one of
// them is currently on top. Recomputed from the database every time, never
// cached, so two requests can never disagree about it.
function currentState(): State {
  const removed = getRemovedIds();
  const remaining = STICKS.filter((s) => !removed.has(s.id));
  const topmost = remaining.reduce<Stick | null>(
    (top, s) => (!top || s.zIndex > top.zIndex ? s : top),
    null,
  );
  return { remaining, topmostId: topmost?.id ?? null };
}

function renderStick(s: Stick, topmostId: string | null): string {
  const removable = s.id === topmostId;
  const color = WOOD_COLORS[s.colorIndex % WOOD_COLORS.length];
  const attrs = removable
    ? 'role="button" tabindex="0" aria-label="Remove the topmost stick"'
    : 'aria-hidden="true"';
  return `<div class="stick${removable ? " stick--removable" : ""}"
    style="left:${s.xPercent.toFixed(2)}%; top:${s.yPercent.toFixed(2)}%; width:${s.lengthPercent.toFixed(2)}%; height:${s.thicknessPx.toFixed(1)}px; --rot:${s.rotationDeg.toFixed(1)}deg; z-index:${s.zIndex}; background:linear-gradient(${s.rotationDeg.toFixed(0)}deg, ${color}, ${color}dd);"
    data-id="${s.id}" ${attrs}></div>`;
}

const PAGE_STYLES = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: #241a12; color: #f2e9da; font-family: system-ui, -apple-system, sans-serif;
}
main { max-width: 560px; width: 100%; padding: 24px 16px; text-align: center; }
h1 { margin: 0 0 4px; font-size: clamp(1.4rem, 4vw, 1.8rem); }
.instruction { margin: 0 0 20px; opacity: 0.75; font-style: italic; }
.board {
  position: relative; width: min(92vw, 480px); aspect-ratio: 4 / 3; margin: 0 auto 20px;
  background: radial-gradient(ellipse at center, #5a4228, #3c2c1a 80%);
  border-radius: 12px;
  box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.4);
}
.stick {
  position: absolute; border-radius: 999px;
  transform: translate(-50%, -50%) rotate(var(--rot));
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
}
.stick:not(.stick--removable) { pointer-events: none; }
.stick--removable {
  cursor: pointer;
  outline: 2px solid transparent;
  filter: brightness(1.15);
  transition: filter 0.15s ease, outline-color 0.15s ease;
}
.stick--removable:hover, .stick--removable:focus-visible {
  filter: brightness(1.4);
  outline-color: #ffe8b0;
  outline-offset: 2px;
}
.status { font-variant-numeric: tabular-nums; opacity: 0.9; }
a { color: #ffd98e; }
`;

// Vanilla JS, inlined: only the topmost stick is ever clickable (the rest have
// pointer-events: none), so the one request this sends is always for the
// current topmost stick. The server re-checks that anyway before writing.
const CLIENT_SCRIPT = `
(function () {
  function attach(el) {
    if (!el) return;
    function remove(e) {
      if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
      if (e.type === "keydown") e.preventDefault();
      var id = el.getAttribute("data-id");
      fetch("/api/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stickId: id }),
      })
        .then(function (res) {
          if (!res.ok) throw new Error("remove failed");
          return res.json();
        })
        .then(function (data) {
          el.remove();
          var status = document.getElementById("status");
          status.textContent = data.remaining + (data.remaining === 1 ? " stick remaining" : " sticks remaining");
          if (data.nextTopmostId) {
            var next = document.querySelector('[data-id="' + data.nextTopmostId + '"]');
            if (next) {
              next.classList.add("stick--removable");
              next.setAttribute("role", "button");
              next.setAttribute("tabindex", "0");
              next.setAttribute("aria-label", "Remove the topmost stick");
              next.removeAttribute("aria-hidden");
              attach(next);
            }
          }
        })
        .catch(function () {
          location.reload();
        });
    }
    el.addEventListener("click", remove);
    el.addEventListener("keydown", remove);
  }
  attach(document.querySelector(".stick--removable"));
})();
`;

function page(): string {
  const { remaining, topmostId } = currentState();
  const sticksHtml = remaining.map((s) => renderStick(s, topmostId)).join("\n");
  const count = remaining.length;
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pick-Up Sticks</title>
<style>${PAGE_STYLES}</style>
</head>
<body>
<main>
  <h1>Pick-Up Sticks</h1>
  <p class="instruction">Take one without disturbing the pile.</p>
  <div id="board" class="board">
${sticksHtml}
  </div>
  <p id="status" class="status">${count} stick${count === 1 ? "" : "s"} remaining</p>
  <p><a href="/readme/">About this app</a></p>
</main>
<script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}

function readmePage(): string {
  const md = readFileSync("README.md", "utf8");
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>About — Pick-Up Sticks</title>
<style>
  body { margin: 0; background: #241a12; color: #f2e9da; font-family: system-ui, sans-serif; }
  main { max-width: 680px; margin: 0 auto; padding: 32px 20px 64px; line-height: 1.6; }
  h1, h2, h3 { color: #ffd98e; }
  a { color: #ffd98e; }
  blockquote { margin: 0 0 1em; padding-left: 1em; border-left: 3px solid #5a4228; opacity: 0.85; }
  code { background: rgba(255,255,255,0.08); padding: 0 4px; border-radius: 3px; }
</style>
</head>
<body>
<main>
${renderMarkdown(md)}
<p><a href="/">Back to the pile</a></p>
</main>
</body>
</html>`;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer((req, res) => {
  void (async () => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page());
        return;
      }

      if (req.method === "GET" && url.pathname === "/readme/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(readmePage());
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/remove") {
        const body = await readBody(req);
        let stickId: unknown;
        try {
          stickId = (JSON.parse(body) as { stickId?: unknown }).stickId;
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid JSON body" }));
          return;
        }
        if (typeof stickId !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "stickId must be a string" }));
          return;
        }

        const before = currentState();
        // Authoritative check: only the current topmost stick may be
        // removed, no matter what the client sends. This is also what makes
        // a duplicate or replayed removal a no-op instead of corrupting the
        // count — a stick that's already gone is never the topmost again.
        if (stickId !== before.topmostId) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "that stick isn't the current topmost stick",
              remaining: before.remaining.length,
              topmostId: before.topmostId,
            }),
          );
          return;
        }

        markRemoved(stickId);
        const after = currentState();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ ok: true, remaining: after.remaining.length, nextTopmostId: after.topmostId }),
        );
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    } catch (err) {
      console.error(err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("internal error");
    }
  })();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`pick-up sticks listening on :${PORT}`);
});
