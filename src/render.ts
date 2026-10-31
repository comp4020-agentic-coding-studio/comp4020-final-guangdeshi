// Shared server-rendered HTML: page shell (head/nav/footer) and small
// reusable components (post card, stance badge, pagination). Plain template
// strings, not a templating engine — consistent with the zero-framework
// stack, and every user-authored value passed through escapeHtml() at the
// call site before it reaches here.
import type { Category, Post, PostContext, PurchaseOption } from "./db.ts";
import type { CatalogProduct, CatalogProductImage } from "./catalog.ts";
import type { User } from "./db.ts";
import type { ContextPrompt } from "./context-prompts.ts";
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

/**
 * Nav markup is rendered once and shown two ways via CSS alone (no server
 * branching needed): at desktop widths the normal inline .main-nav/.nav-
 * right row is visible and .nav-toggle/.mobile-nav-panel stay display:none;
 * under the mobile breakpoint the inline row hides and the same links
 * reappear inside .mobile-nav-panel, toggled open/closed by .nav-toggle
 * (app.js's initMobileNav). This was the fix for a real bug found during
 * the design audit: the authenticated header (Discover, My activity,
 * +New post, avatar, Log out all competing for one row) measured 465px
 * wide against a 390px viewport, causing page-wide horizontal scroll that
 * the anonymous-only automated overflow check never caught.
 */
function renderNav(active: string | undefined, viewer: ViewerContext): string {
  const navLink = (href: string, key: string, label: string) =>
    `<a href="${href}" class="nav-link${active === key ? " active" : ""}">${label}</a>`;

  const navAvatar = viewer.user?.avatarImageId
    ? `<img src="/images/${viewer.user.avatarImageId}" alt="" class="nav-avatar nav-avatar-photo" />`
    : avatarInitial(viewer.user?.displayName ?? "?");

  const navLinks = `${navLink("/discover", "discover", "Discover")}
      ${viewer.user ? navLink("/me/activity", "activity", "My activity") : ""}
      ${viewer.user?.isAdmin ? navLink("/admin", "admin", "Observability") : ""}`;

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
    <nav class="main-nav" aria-label="Primary">
      ${navLinks}
    </nav>
    <div class="nav-right">${rightSide}</div>
    <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="mobile-nav-panel" aria-label="Open menu">
      <span class="nav-toggle-bar"></span>
      <span class="nav-toggle-bar"></span>
      <span class="nav-toggle-bar"></span>
    </button>
  </div>
  <div class="mobile-nav-panel" id="mobile-nav-panel" hidden>
    <nav class="mobile-nav-links" aria-label="Primary">
      ${navLinks}
    </nav>
    <div class="mobile-nav-actions">${rightSide}</div>
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
    <p class="muted"><a href="/readme/">Read our Definition of Good</a> · <a href="/credits">Product data &amp; image credits</a> · <a href="/showcase">Showcase archive</a> · Built for ANU COMP8020 Agentic Coding Studio</p>
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

/**
 * Renders whichever of the three opinion shapes a given opinion actually
 * has (brief: an opinion is exactly one of BUY/PASS, a selected option, or
 * "none of these" — never ambiguous). optionName is only needed when the
 * opinion selected a specific option; callers pass it from their own
 * already-loaded purchase_options list rather than this function querying
 * the database itself.
 */
export function opinionBadge(
  opinion: { stance: "BUY" | "PASS" | null; selectedOptionId: string | null; selectedNone: boolean },
  optionName: string | null,
  size: "small" | "normal" = "normal",
): string {
  if (opinion.stance) return stanceBadge(opinion.stance, size);
  const sizeCls = size === "small" ? " stance-badge-small" : "";
  if (opinion.selectedNone) {
    return `<span class="stance-badge stance-none${sizeCls}">✋ None of these</span>`;
  }
  return `<span class="stance-badge stance-selected${sizeCls}">✅ ${escapeHtml(optionName ?? "an option")}</span>`;
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
  opts: {
    coverImageId: string | null;
    // Fallback for a question about a catalog product with no uploaded photo
    // of its own: the product's real catalog image.
    coverImageUrl?: string | null;
    authorHandle: string;
    authorDisplayName: string;
    categoryName: string;
    buyCount: number;
    passCount: number;
    comparisonOpinionCount?: number;
  },
): string {
  const price = formatPrice(post.priceCents, post.currency);
  const isComparison = post.mode === "WHICH_ONE";
  const total = opts.buyCount + opts.passCount;
  const buyPct = total > 0 ? Math.round((opts.buyCount / total) * 100) : null;
  // A comparison post never has a Buy/Pass bar to show (its opinions are
  // option selections, not stances) — its stats line is a single opinion
  // count instead, matching the detail page's own comparisonCounts summary
  // rather than always claiming "No opinions yet" regardless of real
  // activity.
  const statsLine = isComparison
    ? opts.comparisonOpinionCount && opts.comparisonOpinionCount > 0
      ? `<span class="stat-comparison-count">💬 ${opts.comparisonOpinionCount} opinion${opts.comparisonOpinionCount === 1 ? "" : "s"}</span>`
      : `<span class="stat-empty">No opinions yet</span>`
    : `<span class="stat-buy">👍 ${opts.buyCount}</span>
      <span class="stat-pass">👎 ${opts.passCount}</span>
      ${buyPct !== null ? `<span class="stat-bar"><span class="stat-bar-fill" style="width:${buyPct}%"></span></span>` : `<span class="stat-empty">No opinions yet</span>`}`;
  return `<a href="/posts/${post.id}" class="post-card${post.isDemo ? " post-card-demo" : ""}">
  <div class="post-card-image">
    ${opts.coverImageId
      ? `<img src="/images/${opts.coverImageId}" alt="" loading="lazy" />`
      : opts.coverImageUrl
      ? `<img src="${escapeHtml(opts.coverImageUrl)}" alt="" loading="lazy" class="post-card-image-catalog" />`
      : `<div class="post-card-image-placeholder">🛍️</div>`}
    ${post.visibility === "unlisted" ? `<span class="post-card-tag unlisted-tag">Unlisted</span>` : ""}
    ${post.isDemo ? `<span class="post-card-tag demo-tag-overlay">🤖 Demo</span>` : ""}
    ${isComparison ? `<span class="post-card-tag comparison-tag">Which One?</span>` : ""}
    <span class="post-card-category">${escapeHtml(opts.categoryName)}</span>
  </div>
  <div class="post-card-body">
    <h3 class="post-card-title">${escapeHtml(post.title)}</h3>
    <p class="post-card-meta">by @${escapeHtml(opts.authorHandle)} · ${timeAgo(post.createdAt)}${price ? ` · <strong>${escapeHtml(price)}</strong>` : ""}</p>
    <div class="post-card-stats">
      ${statsLine}
    </div>
  </div>
</a>`;
}

/**
 * A real-world reference card (src/external-references.ts): a genuine,
 * source-linked external purchasing discussion, never a local post.
 * Deliberately NOT a reuse of postCard() — a reference has no author, no
 * opinions, no vote stats, and must never visually read as a voteable local
 * submission. The external badge and "not a Buy or Pass post" wording are
 * load-bearing, not decorative: they're what keeps this from being mistaken
 * for real community participation (see CLAUDE.md's demo/real separation
 * rule, which this extends to a third, external kind of content).
 */
export function referenceCard(ref: {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
  sourceUrl: string;
  sourcePlatform: string;
  sourceDate: string;
  summary: string;
  knownGaps: string;
  imageUrl: string | null;
  imageIsRepresentative: boolean;
}): string {
  return `<div class="reference-card">
  <div class="reference-card-image">
    ${ref.imageUrl ? `<img src="${escapeHtml(ref.imageUrl)}" alt="" loading="lazy" />` : `<div class="reference-card-image-placeholder">🔗</div>`}
    ${ref.imageIsRepresentative && ref.imageUrl ? `<span class="reference-card-tag representative-tag">Representative photo</span>` : ""}
    <span class="reference-card-category">${escapeHtml(ref.categoryName)}</span>
  </div>
  <div class="reference-card-body">
    <span class="reference-external-badge">🔗 External discussion — not a Buy or Pass post</span>
    <h3 class="reference-card-title">${escapeHtml(ref.title)}</h3>
    <p class="reference-card-meta">${escapeHtml(ref.sourcePlatform)} · ${escapeHtml(ref.sourceDate)}</p>
    <p class="reference-card-summary">${escapeHtml(ref.summary)}</p>
    <p class="reference-card-gaps"><strong>What's not known:</strong> ${escapeHtml(ref.knownGaps)}</p>
    <div class="reference-card-actions">
      <a href="${escapeHtml(ref.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-small reference-source-link">Read the original source ↗</a>
      <a href="/posts/new?category=${encodeURIComponent(ref.categoryId)}" class="btn btn-brand btn-small">Ask your own version of this question</a>
    </div>
  </div>
</div>`;
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

/**
 * Feature A's "About this decision" context cards. Renders only the
 * prompts the buyer actually answered, in the category's own defined
 * order — per the brief's explicit "do not display empty prompt fields as
 * distracting blank cards" rule, enforced here by simply never emitting a
 * card for an unanswered key, not by a CSS hide rule over an empty one.
 */
export function contextCard(context: PostContext | null, prompts: ContextPrompt[]): string {
  if (!context) return "";
  const answeredCards = prompts
    .filter((p) => context.answers[p.key]?.trim())
    .map((p) => `<div class="context-item"><span class="context-label">${escapeHtml(p.label)}</span><p class="context-value">${escapeHtml(context.answers[p.key])}</p></div>`);
  const freeTextCard = context.freeText.trim()
    ? `<div class="context-item context-item-freetext"><span class="context-label">More details</span><p class="context-value">${escapeHtml(context.freeText)}</p></div>`
    : "";
  if (answeredCards.length === 0 && !freeTextCard) return "";
  return `<section class="context-section">
    <h3>About this decision</h3>
    <div class="context-grid">${answeredCards.join("\n")}${freeTextCard}</div>
  </section>`;
}

/**
 * One candidate in a WHICH_ONE comparison. Price fields follow the brief's
 * three-way distinction exactly: expected (what this buyer expects to pay,
 * always shown), original (a claimed list price, shown struck through only
 * if supplied), and a sale note as plain text — never a computed "% off"
 * framing that would imply a bigger discount is automatically the better
 * decision.
 */
export function purchaseOptionCard(option: PurchaseOption, voteCount: number, isMySelection: boolean, catalogImageUrl: string | null = null): string {
  const expected = formatPrice(option.expectedPriceCents, option.currency);
  const original = option.originalPriceCents !== null ? formatPrice(option.originalPriceCents, option.currency) : null;
  const specs = option.specifications
    ? Object.entries(option.specifications)
        .filter(([, v]) => v && v.trim())
        .map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</li>`)
        .join("")
    : "";
  return `<div class="purchase-option-card${isMySelection ? " purchase-option-selected" : ""}" data-option-id="${option.id}">
    ${option.imageId
      ? `<img src="/images/${option.imageId}" alt="" class="purchase-option-image" />`
      : catalogImageUrl
      ? `<img src="${escapeHtml(catalogImageUrl)}" alt="" class="purchase-option-image purchase-option-image-catalog" />`
      : `<div class="purchase-option-image-placeholder">🛍️</div>`}
    <h4 class="purchase-option-name">${option.catalogProductId ? `<a href="/products/${escapeHtml(option.catalogProductId)}">${escapeHtml(option.name)}</a>` : escapeHtml(option.name)}</h4>
    <p class="purchase-option-price">
      ${expected ? escapeHtml(expected) : ""}
      ${original ? `<span class="purchase-option-original-price">${escapeHtml(original)}</span>` : ""}
    </p>
    ${option.saleNote ? `<p class="purchase-option-sale-note">${escapeHtml(option.saleNote)}</p>` : ""}
    ${option.condition ? `<p class="purchase-option-condition">Condition: ${escapeHtml(option.condition)}</p>` : ""}
    ${option.sourceUrl ? `<p class="purchase-option-source"><a href="${escapeHtml(option.sourceUrl)}" rel="nofollow noopener" target="_blank">View source ↗</a></p>` : ""}
    ${specs ? `<ul class="purchase-option-specs">${specs}</ul>` : ""}
    <p class="purchase-option-vote-count">${voteCount} opinion${voteCount === 1 ? "" : "s"}${isMySelection ? " · your pick" : ""}</p>
  </div>`;
}

/**
 * A real catalog product card: image-led, compact, no engagement numbers
 * except the live count of genuine community questions linked to it (never
 * a rating, review count or price — the catalog has none to show). The
 * whole card links to the product page; "Ask about this" is a separate,
 * explicit action.
 */
export function productCard(product: CatalogProduct, image: CatalogProductImage | null, opts: { categoryName: string; questionCount: number }): string {
  const askHref = `/posts/new?product=${encodeURIComponent(product.id)}`;
  const questions = opts.questionCount > 0
    ? `<a href="/products/${escapeHtml(product.id)}#questions" class="product-card-questions">${opts.questionCount} community question${opts.questionCount === 1 ? "" : "s"}</a>`
    : "";
  return `<article class="product-card">
  <a href="/products/${escapeHtml(product.id)}" class="product-card-link">
    <div class="product-card-image">
      ${image ? `<img src="${escapeHtml(image.filePath)}" alt="${escapeHtml(product.name)}" loading="lazy" width="${image.width}" height="${image.height}" />` : ""}
    </div>
    <div class="product-card-body">
      <p class="product-card-eyebrow">${escapeHtml(opts.categoryName)}${product.brand ? ` · ${escapeHtml(product.brand)}` : ""}</p>
      <h3 class="product-card-title">${escapeHtml(product.name)}</h3>
      ${product.keyAttribute ? `<p class="product-card-attr">${escapeHtml(product.keyAttribute)}</p>` : ""}
    </div>
  </a>
  <div class="product-card-actions">
    ${questions}
    <a href="${askHref}" class="btn btn-brand btn-small product-card-ask">Ask about this</a>
  </div>
</article>`;
}

/** Persistent banner, not a dismissible tag, per the brief's exact required wording. */
export function demoLabel(): string {
  return `<span class="demo-tag">🤖 Demo scenario — AI-generated</span>`;
}

/**
 * Feature C's compact "related decisions" card — deliberately minimal
 * (title, category, live opinion counts are fetched client-side-free by
 * just linking through) since the point is discovery, not duplicating the
 * full post-detail content here.
 */
export function relatedDecisionCard(post: Post): string {
  return `<a href="/posts/${post.id}" class="related-decision-card">
    ${post.isDemo ? demoLabel() : ""}
    <h4>${escapeHtml(post.title)}</h4>
    <p class="muted">${escapeHtml(post.description.slice(0, 100))}${post.description.length > 100 ? "…" : ""}</p>
  </a>`;
}
