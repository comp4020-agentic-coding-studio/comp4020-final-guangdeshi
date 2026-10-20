// Shared server-rendered HTML: page shell (head/nav/footer) and small
// reusable components (post card, stance badge, pagination). Plain template
// strings, not a templating engine — consistent with the zero-framework
// stack, and every user-authored value passed through escapeHtml() at the
// call site before it reaches here.
import type { Category, Post } from "./db.ts";
import type { User } from "./db.ts";
import { escapeHtml } from "./validation.ts";

export interface ViewerContext {
  user: User | null;
  csrfToken: string | null;
}

export function formatPrice(priceCents: number | null, currency: string | null): string | null {
  if (priceCents === null) return null;
  const amount = (priceCents / 100).toFixed(2);
  return currency ? `${currency} ${amount}` : `$${amount}`;
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;
  return `${Math.floor(month / 12)}y ago`;
}

export function layout(opts: {
  title: string;
  viewer: ViewerContext;
  activeNav?: "discover" | "create" | "profile" | "activity" | "admin";
  body: string;
  bodyClass?: string;
}): string {
  const { title, viewer, body, bodyClass } = opts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · Buy or Pass</title>
<meta name="description" content="You want it. What does everyone else think?" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,500&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🛍️</text></svg>">
<link rel="stylesheet" href="/static/styles.css" />
</head>
<body class="${bodyClass ?? ""}">
${renderNav(opts.activeNav, viewer)}
${body}
${renderFooter()}
<script src="/static/app.js" type="module"></script>
</body>
</html>`;
}

function renderNav(active: string | undefined, viewer: ViewerContext): string {
  const navLink = (href: string, key: string, label: string) =>
    `<a href="${href}" class="nav-link${active === key ? " active" : ""}">${label}</a>`;

  const navAvatar = viewer.user?.avatarImageId
    ? `<img src="/images/${viewer.user.avatarImageId}" alt="" class="nav-avatar nav-avatar-photo" />`
    : avatarInitial(viewer.user?.displayName ?? "?");

  const rightSide = viewer.user
    ? `<a href="/posts/new" class="btn btn-brand btn-small">+ New post</a>
       <a href="/u/${encodeURIComponent(viewer.user.handle)}" class="nav-avatar-link" title="${escapeHtml(viewer.user.displayName)}">${navAvatar}</a>
       <form method="post" action="/logout" class="inline-form">
         <input type="hidden" name="csrf" value="${escapeHtml(viewer.csrfToken ?? "")}" />
         <button type="submit" class="nav-link as-button">Log out</button>
       </form>`
    : `<a href="/login" class="nav-link">Log in</a>
       <a href="/register" class="btn btn-brand btn-small">Join free</a>`;

  return `<header class="site-header">
  <div class="site-header-inner">
    <a href="/" class="wordmark">Buy<span class="wordmark-or">or</span>Pass</a>
    <nav class="main-nav">
      ${navLink("/discover", "discover", "Discover")}
      ${viewer.user ? navLink("/me/activity", "activity", "My activity") : ""}
      ${viewer.user?.isAdmin ? navLink("/admin", "admin", "Observability") : ""}
    </nav>
    <div class="nav-right">${rightSide}</div>
  </div>
</header>`;
}

function avatarInitial(name: string): string {
  return escapeHtml((name.trim()[0] ?? "?").toUpperCase());
}

function renderFooter(): string {
  return `<footer class="site-footer">
  <div class="site-footer-inner">
    <p><strong>Buy or Pass</strong> — "You want it. What does everyone else think?"</p>
    <p class="muted">The purchase belongs to the buyer. The opinions belong to the community.</p>
    <p class="muted"><a href="/readme/">Read our Definition of Good</a> · Built for ANU COMP8020 Agentic Coding Studio</p>
  </div>
</footer>`;
}

export function stanceBadge(stance: "BUY" | "PASS", size: "small" | "normal" = "normal"): string {
  const cls = stance === "BUY" ? "stance-badge stance-buy" : "stance-badge stance-pass";
  const sizeCls = size === "small" ? " stance-badge-small" : "";
  const icon = stance === "BUY" ? "👍" : "👎";
  const label = stance === "BUY" ? "Buy" : "Pass";
  return `<span class="${cls}${sizeCls}">${icon} ${label}</span>`;
}

export function outcomeBadge(status: "BOUGHT" | "DID_NOT_BUY" | "STILL_DECIDING"): string {
  const map = {
    BOUGHT: { icon: "✅", label: "Bought it", cls: "outcome-bought" },
    DID_NOT_BUY: { icon: "🚫", label: "Didn't buy", cls: "outcome-not-bought" },
    STILL_DECIDING: { icon: "🤔", label: "Still deciding", cls: "outcome-deciding" },
  } as const;
  const { icon, label, cls } = map[status];
  return `<span class="outcome-badge ${cls}">${icon} ${label}</span>`;
}

export function postCard(
  post: Post,
  opts: { coverImageId: string | null; authorHandle: string; authorDisplayName: string; categoryName: string; buyCount: number; passCount: number },
): string {
  const price = formatPrice(post.priceCents, post.currency);
  const total = opts.buyCount + opts.passCount;
  const buyPct = total > 0 ? Math.round((opts.buyCount / total) * 100) : null;
  return `<a href="/posts/${post.id}" class="post-card">
  <div class="post-card-image">
    ${opts.coverImageId ? `<img src="/images/${opts.coverImageId}" alt="" loading="lazy" />` : `<div class="post-card-image-placeholder">🛍️</div>`}
    ${post.visibility === "unlisted" ? `<span class="post-card-tag unlisted-tag">Unlisted</span>` : ""}
    <span class="post-card-category">${escapeHtml(opts.categoryName)}</span>
  </div>
  <div class="post-card-body">
    <h3 class="post-card-title">${escapeHtml(post.title)}</h3>
    <p class="post-card-meta">by @${escapeHtml(opts.authorHandle)} · ${timeAgo(post.createdAt)}${price ? ` · <strong>${escapeHtml(price)}</strong>` : ""}</p>
    <div class="post-card-stats">
      <span class="stat-buy">👍 ${opts.buyCount}</span>
      <span class="stat-pass">👎 ${opts.passCount}</span>
      ${buyPct !== null ? `<span class="stat-bar"><span class="stat-bar-fill" style="width:${buyPct}%"></span></span>` : `<span class="stat-empty">No opinions yet</span>`}
    </div>
  </div>
</a>`;
}

export function emptyState(opts: { icon: string; title: string; body: string; actionHref?: string; actionLabel?: string }): string {
  return `<div class="empty-state">
  <div class="empty-state-icon">${opts.icon}</div>
  <h3>${escapeHtml(opts.title)}</h3>
  <p>${escapeHtml(opts.body)}</p>
  ${opts.actionHref ? `<a href="${opts.actionHref}" class="btn btn-brand">${escapeHtml(opts.actionLabel ?? "Get started")}</a>` : ""}
</div>`;
}

export function categoryOptions(categories: Category[], selectedId?: string): string {
  return categories
    .map((c) => `<option value="${c.id}"${c.id === selectedId ? " selected" : ""}>${escapeHtml(c.name)}</option>`)
    .join("");
}

export function flashBanner(message: string | null, kind: "error" | "success" = "error"): string {
  if (!message) return "";
  return `<div class="flash flash-${kind}" role="alert">${escapeHtml(message)}</div>`;
}
