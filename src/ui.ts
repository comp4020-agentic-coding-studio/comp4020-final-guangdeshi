// Shared visual language for every page: dark-ink background, electric
// cyan/mint for confirmed/live things, warm coral for confirmed failures,
// amber for unresolved uncertainty — per the project's visual direction in
// PROCESS.md. One stylesheet, inlined on every response (no build step, no
// separate static-asset route to wire up).
export const STYLES = `
:root {
  color-scheme: dark;
  --ink: #0b0f14;
  --ink-raised: #121923;
  --ink-line: #1f2a37;
  --text: #e8eef4;
  --text-dim: #93a1b0;
  --cyan: #4fe3c1;
  --cyan-dim: #2a6b5e;
  --coral: #ff6b5e;
  --coral-dim: #5a2a26;
  --amber: #f5b942;
  --amber-dim: #5a4a1f;
  --mono: "SF Mono", ui-monospace, "Cascadia Code", Menlo, Consolas, monospace;
  --sans: -apple-system, "Segoe UI", system-ui, sans-serif;
  --radius: 10px;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--ink);
  background-image:
    linear-gradient(var(--ink-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--ink-line) 1px, transparent 1px);
  background-size: 48px 48px;
  background-attachment: fixed;
  color: var(--text);
  font-family: var(--sans);
  line-height: 1.5;
  min-height: 100vh;
}
a { color: var(--cyan); }
a:focus-visible, button:focus-visible, select:focus-visible, input:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 2px;
}
code, .mono { font-family: var(--mono); }
h1, h2, h3 { font-weight: 600; letter-spacing: -0.01em; }
.wrap { max-width: 980px; margin: 0 auto; padding: 24px 20px 64px; }
.nav { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; max-width: 980px; margin: 0 auto; }
.nav a { text-decoration: none; font-family: var(--mono); font-size: 0.9rem; color: var(--text-dim); }
.nav .brand { color: var(--cyan); font-weight: 700; font-family: var(--mono); }

.btn {
  font: inherit; font-family: var(--sans); font-weight: 600; cursor: pointer;
  border-radius: var(--radius); border: 1px solid var(--ink-line);
  background: var(--ink-raised); color: var(--text); padding: 10px 18px;
  transition: border-color 0.15s ease, transform 0.1s ease;
}
.btn:hover { border-color: var(--cyan-dim); }
.btn:active { transform: translateY(1px); }
.btn-primary { background: var(--cyan); color: #04201a; border-color: var(--cyan); }
.btn-primary:hover { border-color: var(--cyan); filter: brightness(1.08); }
.btn-ghost { background: transparent; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }

.card {
  background: var(--ink-raised); border: 1px solid var(--ink-line);
  border-radius: var(--radius); padding: 20px;
}
.badge {
  display: inline-flex; align-items: center; gap: 6px; font-family: var(--mono);
  font-size: 0.78rem; padding: 2px 8px; border-radius: 999px; border: 1px solid currentColor;
}
.badge-pass { color: var(--cyan); background: rgba(79, 227, 193, 0.08); }
.badge-fail { color: var(--coral); background: rgba(255, 107, 94, 0.08); }
.badge-amber { color: var(--amber); background: rgba(245, 185, 66, 0.08); }
.badge-dim { color: var(--text-dim); background: rgba(147, 161, 176, 0.06); }

@media (prefers-reduced-motion: no-preference) {
  .enter { animation: enter 0.35s ease both; }
  @keyframes enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .pulse { animation: pulse 0.6s ease; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(79,227,193,0.35); } 100% { box-shadow: 0 0 0 10px rgba(79,227,193,0); } }
}

.hero { text-align: center; padding: 56px 20px 24px; }
.hero h1 { font-size: clamp(2rem, 6vw, 3.2rem); margin: 0 0 8px; }
.hero .tagline { font-family: var(--mono); color: var(--cyan); font-size: clamp(0.95rem, 2.5vw, 1.15rem); margin: 0 0 20px; }
.hero p.lede { max-width: 640px; margin: 0 auto 28px; color: var(--text-dim); }
.cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-bottom: 8px; }

.case-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-top: 16px; }
.case-card { text-decoration: none; color: inherit; display: block; }
.case-card h3 { margin: 0 0 6px; color: var(--text); }
.case-card p { margin: 0; color: var(--text-dim); font-size: 0.92rem; }
.case-card[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; }

.room-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
.presence { font-family: var(--mono); font-size: 0.85rem; color: var(--mint, var(--cyan)); display: flex; align-items: center; gap: 6px; }
.presence .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--cyan); }

.section { margin-bottom: 28px; }
.section h2 { font-size: 1.05rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); margin: 0 0 12px; }

.name-form { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.name-form input[type="text"] {
  font: inherit; background: var(--ink); border: 1px solid var(--ink-line); border-radius: 8px;
  color: var(--text); padding: 8px 10px; min-width: 160px;
}
label { font-size: 0.85rem; color: var(--text-dim); display: block; margin-bottom: 4px; }

.playground-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 14px; }
select {
  width: 100%; font: inherit; background: var(--ink); border: 1px solid var(--ink-line);
  border-radius: 8px; color: var(--text); padding: 8px 10px;
}
textarea {
  width: 100%; font: inherit; background: var(--ink); border: 1px solid var(--ink-line);
  border-radius: 8px; color: var(--text); padding: 8px 10px; resize: vertical; min-height: 44px;
}
.result-readout { margin-top: 14px; padding: 12px 14px; border-radius: 8px; border: 1px dashed var(--ink-line); font-family: var(--mono); font-size: 0.9rem; }

table.evidence { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
table.evidence th { text-align: left; color: var(--text-dim); font-weight: 500; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; padding: 6px 8px; border-bottom: 1px solid var(--ink-line); }
table.evidence td { padding: 8px; border-bottom: 1px solid var(--ink-line); vertical-align: top; }
table.evidence tr:last-child td { border-bottom: none; }
.evidence-empty { color: var(--text-dim); font-style: italic; padding: 12px 0; }
.repeat-tag { font-size: 0.72rem; color: var(--text-dim); }

.hyp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.hyp-list li { display: flex; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.02); }
.hyp-list li.ruled-out { opacity: 0.45; text-decoration: line-through; }

.recommend-box { border-left: 3px solid var(--amber); padding: 12px 16px; background: rgba(245, 185, 66, 0.06); border-radius: 0 8px 8px 0; }
.recommend-box.identified { border-left-color: var(--cyan); background: rgba(79, 227, 193, 0.06); }
.recommend-box .combo { font-family: var(--mono); color: var(--amber); }
.recommend-box.identified .combo { color: var(--cyan); }

.reveal-box { border-left: 3px solid var(--coral); padding: 14px 16px; background: rgba(255, 107, 94, 0.07); border-radius: 0 8px 8px 0; margin-top: 12px; }

footer.app { text-align: center; color: var(--text-dim); font-size: 0.82rem; padding: 32px 20px; }

.readme-body { max-width: 680px; margin: 0 auto; padding: 32px 20px 64px; }
.readme-body h1, .readme-body h2, .readme-body h3 { color: var(--cyan); }
.readme-body blockquote { margin: 0 0 1em; padding-left: 1em; border-left: 3px solid var(--ink-line); color: var(--text-dim); }
.readme-body code { background: rgba(255,255,255,0.08); padding: 0 4px; border-radius: 3px; }
`;

export function pageShell(options: { title: string; body: string; bootstrap?: unknown }): string {
  const bootstrapScript = options.bootstrap
    ? `<script type="application/json" id="bootstrap">${JSON.stringify(options.bootstrap)}</script>`
    : "";
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${options.title}</title>
<style>${STYLES}</style>
</head>
<body>
<nav class="nav"><a href="/"><span class="brand">bug relay</span></a><a href="/readme/">about / readme</a></nav>
${options.body}
${bootstrapScript}
</body>
</html>`;
}
