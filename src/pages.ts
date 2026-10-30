// Server-rendered page bodies. Each function returns the <body>-level HTML
// that render.ts's layout() wraps with nav/footer/head. Kept as plain
// template strings (no templating engine) to match the zero-framework stack;
// every user-authored string passed through escapeHtml() before interpolation.
import type { Category, Opinion, OpinionWithAuthor, Post, PostContext, PostMode, PostOutcome, PurchaseOption, User } from "./db.ts";
import { getContextPrompts, type ContextPrompt } from "./context-prompts.ts";
import { escapeHtml } from "./validation.ts";
import {
  categoryOptions,
  contextCard,
  emptyState,
  flashBanner,
  formatPrice,
  layout,
  opinionBadge,
  outcomeBadge,
  postCard,
  purchaseOptionCard,
  relatedDecisionCard,
  stanceBadge,
  timeAgo,
  type ViewerContext,
} from "./render.ts";

// --------------------------------------------------------------- landing --

export function landingPage(viewer: ViewerContext, featured: Array<{ post: Post; coverImageId: string | null; authorHandle: string; authorDisplayName: string; categoryName: string; buyCount: number; passCount: number }>): string {
  const body = `
<section class="hero">
  <div class="hero-inner">
    <p class="hero-eyebrow">A friendly community for purchase decisions</p>
    <h1 class="hero-title">You want it.<br/>What does everyone else think?</h1>
    <p class="hero-sub">Post what you're thinking about buying. Real people give you a quick 👍 Buy or 👎 Pass with a short honest opinion. You still make the call.</p>
    <div class="hero-actions">
      <a href="${viewer.user ? "/posts/new" : "/register"}" class="btn btn-brand btn-large">Post something you're eyeing</a>
      <a href="/discover" class="btn btn-ghost btn-large">Explore opinions</a>
    </div>
    <div class="hero-howitworks">
      <div class="howitworks-step"><span class="step-num">1</span><div><strong>Post it</strong><p>Photos, price, and why you're considering it.</p></div></div>
      <div class="howitworks-step"><span class="step-num">2</span><div><strong>Get real opinions</strong><p>👍 Buy or 👎 Pass, plus one honest sentence.</p></div></div>
      <div class="howitworks-step"><span class="step-num">3</span><div><strong>You decide</strong><p>The purchase is always yours to make.</p></div></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="section-header">
    <h2>Fresh purchasing questions</h2>
    <a href="/discover" class="link-more">See all →</a>
  </div>
  ${featured.length > 0
    ? `<div class="post-grid">${featured.map((f) => postCard(f.post, f)).join("\n")}</div>`
    : emptyState({ icon: "🛍️", title: "No posts yet", body: "Be the first to ask the community: buy or pass?", actionHref: viewer.user ? "/posts/new" : "/register", actionLabel: "Create the first post" })}
</section>

<section class="section section-definition">
  <div class="definition-card">
    <h2>Good advice is relevant, honest, and easy to give.</h2>
    <p>The purchase belongs to the buyer. The opinions belong to the community. Every opinion takes an explicit stance, nobody can decide for you, and counts always reflect real votes — never fabricated ones.</p>
    <a href="/readme/" class="link-more">Read our full Definition of Good →</a>
  </div>
</section>`;
  return layout({ title: "Buy or Pass", viewer, body, bodyClass: "page-landing" });
}

// --------------------------------------------------------------- auth -----

export function registerPage(viewer: ViewerContext, error: string | null, values: { email?: string; handle?: string; displayName?: string }): string {
  const body = `
<section class="auth-section">
  <div class="auth-card">
    <h1>Create your account</h1>
    <p class="muted">Join the community giving (and getting) honest buy-or-pass opinions.</p>
    ${flashBanner(error)}
    <form method="post" action="/register" class="form-stack" novalidate>
      <label>Email
        <input type="email" name="email" required maxlength="254" autocomplete="email" value="${escapeHtml(values.email ?? "")}" />
      </label>
      <label>Handle
        <input type="text" name="handle" required minlength="3" maxlength="30" pattern="[a-z0-9_-]+" placeholder="lowercase, no spaces" autocomplete="username" value="${escapeHtml(values.handle ?? "")}" />
      </label>
      <label>Display name
        <input type="text" name="displayName" required maxlength="60" value="${escapeHtml(values.displayName ?? "")}" />
      </label>
      <label>Password
        <input type="password" name="password" required minlength="8" maxlength="256" autocomplete="new-password" />
        <span class="hint">At least 8 characters.</span>
      </label>
      <button type="submit" class="btn btn-brand btn-large btn-block">Create account</button>
    </form>
    <p class="auth-switch">Already have an account? <a href="/login">Log in</a></p>
  </div>
</section>`;
  return layout({ title: "Join Buy or Pass", viewer, body, bodyClass: "page-auth" });
}

export function loginPage(viewer: ViewerContext, error: string | null, values: { email?: string }): string {
  const body = `
<section class="auth-section">
  <div class="auth-card">
    <h1>Welcome back</h1>
    <p class="muted">Log in to post, vote, and track your activity.</p>
    ${flashBanner(error)}
    <form method="post" action="/login" class="form-stack" novalidate>
      <label>Email
        <input type="email" name="email" required autocomplete="email" value="${escapeHtml(values.email ?? "")}" />
      </label>
      <label>Password
        <input type="password" name="password" required autocomplete="current-password" />
      </label>
      <button type="submit" class="btn btn-brand btn-large btn-block">Log in</button>
    </form>
    <p class="auth-switch">New here? <a href="/register">Create an account</a></p>
  </div>
</section>`;
  return layout({ title: "Log in", viewer, body, bodyClass: "page-auth" });
}

// ------------------------------------------------------------ discover ----

export interface DiscoverFeedItem {
  post: Post;
  coverImageId: string | null;
  authorHandle: string;
  authorDisplayName: string;
  categoryName: string;
  buyCount: number;
  passCount: number;
}

export function discoverPage(
  viewer: ViewerContext,
  items: DiscoverFeedItem[],
  categories: Category[],
  filters: { categoryId?: string; search?: string; sort?: "recent" | "discussed" },
  nextCursor: string | null,
): string {
  const categoryPills = [`<a href="/discover" class="pill${!filters.categoryId ? " pill-active" : ""}">All</a>`]
    .concat(
      categories.map(
        (c) =>
          `<a href="/discover?category=${encodeURIComponent(c.id)}" class="pill${filters.categoryId === c.id ? " pill-active" : ""}">${escapeHtml(c.name)}</a>`,
      ),
    )
    .join("");

  const nextLink = nextCursor
    ? `<a class="btn btn-ghost" href="/discover?${new URLSearchParams({
        ...(filters.categoryId ? { category: filters.categoryId } : {}),
        ...(filters.search ? { q: filters.search } : {}),
        cursor: nextCursor,
      }).toString()}">Load more →</a>`
    : "";

  const sortParams = (sort: "recent" | "discussed") =>
    new URLSearchParams({
      ...(filters.categoryId ? { category: filters.categoryId } : {}),
      ...(filters.search ? { q: filters.search } : {}),
      sort,
    }).toString();
  const sortToggle = `<div class="sort-toggle" role="radiogroup" aria-label="Sort posts">
    <a href="/discover?${sortParams("recent")}" class="sort-option${filters.sort !== "discussed" ? " active" : ""}">Recent</a>
    <a href="/discover?${sortParams("discussed")}" class="sort-option${filters.sort === "discussed" ? " active" : ""}">Most discussed</a>
  </div>`;

  const body = `
<section class="discover-header">
  <h1>Discover</h1>
  <form method="get" action="/discover" class="search-form">
    ${filters.categoryId ? `<input type="hidden" name="category" value="${escapeHtml(filters.categoryId)}" />` : ""}
    <input type="search" name="q" placeholder="Search purchasing questions…" value="${escapeHtml(filters.search ?? "")}" aria-label="Search posts" />
    <button type="submit" class="btn btn-brand">Search</button>
  </form>
</section>
<nav class="category-pills" aria-label="Filter by category">${categoryPills}</nav>
${sortToggle}
${items.length > 0
  ? `<div class="post-grid">${items.map((i) => postCard(i.post, i)).join("\n")}</div><div class="load-more-row">${nextLink}</div>`
  : emptyState({
      icon: "🔍",
      title: "Nothing here yet",
      body: filters.search || filters.categoryId ? "Try a different search or category." : "No public posts yet — be the first to ask the community.",
      actionHref: viewer.user ? "/posts/new" : "/register",
      actionLabel: "Create a post",
    })}`;
  return layout({ title: "Discover", viewer, activeNav: "discover", body, bodyClass: "page-discover" });
}

// --------------------------------------------------------- post detail ----

export interface PostDetailData {
  post: Post;
  images: { id: string }[];
  author: { id: string; handle: string; displayName: string };
  category: Category;
  buyCount: number;
  passCount: number;
  opinions: OpinionWithAuthor[];
  myOpinion: Opinion | null;
  outcome: PostOutcome | null;
  shareUrl: string;
  // v2 additions — all optional so a caller passing only the legacy fields
  // (any pre-v2 call site, and every pre-v2 test) still compiles and renders
  // the original BUY_PASS experience unchanged.
  options?: PurchaseOption[];
  optionCounts?: { counts: Record<string, number>; noneCount: number };
  context?: PostContext | null;
  contextPrompts?: ContextPrompt[];
  relatedPosts?: Post[];
  influentialOpinionId?: string | null;
}

function optionNameFor(options: PurchaseOption[] | undefined, optionId: string | null): string | null {
  if (!optionId) return null;
  return options?.find((o) => o.id === optionId)?.name ?? null;
}

export function postDetailPage(viewer: ViewerContext, data: PostDetailData, flash: { message: string | null; kind: "error" | "success" }): string {
  const { post, images, author, category, buyCount, passCount, opinions, myOpinion, outcome } = data;
  const options = data.options ?? [];
  const isComparison = post.mode === "WHICH_ONE";
  const price = formatPrice(post.priceCents, post.currency);
  const isAuthor = viewer.user?.id === author.id;
  const total = buyCount + passCount;
  const buyPct = total > 0 ? Math.round((buyCount / total) * 100) : 50;

  const gallery = images.length > 0
    ? `<div class="post-gallery" data-gallery>
        <div class="post-gallery-main"><img src="/images/${images[0].id}" alt="" id="gallery-main-img" /></div>
        ${images.length > 1 ? `<div class="post-gallery-thumbs">${images.map((img, i) => `<button type="button" class="gallery-thumb${i === 0 ? " active" : ""}" data-image-id="${img.id}"><img src="/images/${img.id}" alt="" /></button>`).join("")}</div>` : ""}
      </div>`
    : `<div class="post-gallery-placeholder">🛍️</div>`;

  const buyPassForm = `<form method="post" action="/posts/${post.id}/opinions" class="opinion-form" id="opinion-form">
        <input type="hidden" name="csrf" value="${escapeHtml(viewer.csrfToken ?? "")}" />
        <div class="stance-toggle" role="radiogroup" aria-label="Your stance">
          <label class="stance-option stance-option-buy${myOpinion?.stance === "BUY" ? " selected" : ""}">
            <input type="radio" name="stance" value="BUY" ${myOpinion?.stance === "BUY" ? "checked" : ""} required /> 👍 Buy
          </label>
          <label class="stance-option stance-option-pass${myOpinion?.stance === "PASS" ? " selected" : ""}">
            <input type="radio" name="stance" value="PASS" ${myOpinion?.stance === "PASS" ? "checked" : ""} required /> 👎 Pass
          </label>
        </div>
        <textarea name="comment" placeholder="One honest sentence about why…" maxlength="500" required>${escapeHtml(myOpinion?.comment ?? "")}</textarea>
        <button type="submit" class="btn btn-brand btn-block">${myOpinion ? "Update my opinion" : "Submit opinion"}</button>
      </form>`;

  const comparisonForm = `<form method="post" action="/posts/${post.id}/opinions" class="opinion-form comparison-opinion-form" id="opinion-form">
        <input type="hidden" name="csrf" value="${escapeHtml(viewer.csrfToken ?? "")}" />
        <div class="option-select-row" role="radiogroup" aria-label="Pick one">
          ${options
            .map(
              (opt) => `<label class="option-select${myOpinion?.selectedOptionId === opt.id ? " selected" : ""}">
                <input type="radio" name="selectedOptionId" value="${opt.id}" ${myOpinion?.selectedOptionId === opt.id ? "checked" : ""} required /> ${escapeHtml(opt.name)}
              </label>`,
            )
            .join("")}
          <label class="option-select option-select-none${myOpinion?.selectedNone ? " selected" : ""}">
            <input type="radio" name="selectedOptionId" value="none" ${myOpinion?.selectedNone ? "checked" : ""} required /> ✋ None of these
          </label>
        </div>
        <textarea name="comment" placeholder="One honest sentence about why…" maxlength="500" required>${escapeHtml(myOpinion?.comment ?? "")}</textarea>
        <button type="submit" class="btn btn-brand btn-block">${myOpinion ? "Update my opinion" : "Submit opinion"}</button>
      </form>`;

  const opinionForm = !viewer.user
    ? `<div class="opinion-cta"><p>Log in to share your honest opinion.</p><a href="/login" class="btn btn-brand">Log in to vote</a></div>`
    : isAuthor
    ? `<div class="opinion-cta"><p>Post authors don't vote on their own posts — opinions should come from the community, not confirm your own thinking.</p></div>`
    : post.status !== "active"
    ? `<div class="opinion-cta"><p>This post is no longer available for opinions.</p></div>`
    : isComparison
    ? comparisonForm
    : buyPassForm;

  const outcomeOptionRow = isComparison && options.length > 0
    ? `<label class="outcome-option-select">Which one did you buy, if any?
        <select name="purchasedOptionId">
          <option value="">— not specified —</option>
          ${options.map((opt) => `<option value="${opt.id}" ${outcome?.purchasedOptionId === opt.id ? "selected" : ""}>${escapeHtml(opt.name)}</option>`).join("")}
        </select>
      </label>`
    : "";

  const outcomeSection = isAuthor
    ? `<div class="outcome-card">
        <h3>What did you decide?</h3>
        <form method="post" action="/posts/${post.id}/outcome" class="outcome-form">
          <input type="hidden" name="csrf" value="${escapeHtml(viewer.csrfToken ?? "")}" />
          <div class="outcome-options">
            <label class="outcome-option${outcome?.status === "BOUGHT" ? " selected" : ""}"><input type="radio" name="status" value="BOUGHT" ${outcome?.status === "BOUGHT" ? "checked" : ""} /> ✅ Bought</label>
            <label class="outcome-option${outcome?.status === "DID_NOT_BUY" ? " selected" : ""}"><input type="radio" name="status" value="DID_NOT_BUY" ${outcome?.status === "DID_NOT_BUY" ? "checked" : ""} /> 🚫 Didn't buy</label>
            <label class="outcome-option${!outcome || outcome?.status === "STILL_DECIDING" ? " selected" : ""}"><input type="radio" name="status" value="STILL_DECIDING" ${!outcome || outcome?.status === "STILL_DECIDING" ? "checked" : ""} /> 🤔 Still deciding</label>
          </div>
          ${outcomeOptionRow}
          <textarea name="reflection" placeholder="Optional reflection…" maxlength="1000">${escapeHtml(outcome?.reflection ?? "")}</textarea>
          <button type="submit" class="btn btn-secondary">Save outcome</button>
        </form>
      </div>`
    : outcome
    ? `<div class="outcome-card outcome-readonly"><h3>Outcome</h3>${outcomeBadge(outcome.status)}${
        outcome.purchasedOptionId ? `<p class="outcome-purchased">Bought: ${escapeHtml(optionNameFor(options, outcome.purchasedOptionId) ?? "an option")}</p>` : ""
      }${outcome.reflection ? `<p class="outcome-reflection">${escapeHtml(outcome.reflection)}</p>` : ""}</div>`
    : "";

  const influentialId = data.influentialOpinionId ?? outcome?.influentialOpinionId ?? null;
  const opinionsList = opinions.length > 0
    ? opinions
        .map((o) => {
          const isInfluential = influentialId === o.id;
          const markControl = isAuthor
            ? `<form method="post" action="/posts/${post.id}/opinions/${o.id}/influential" class="influential-mark-form">
                <input type="hidden" name="csrf" value="${escapeHtml(viewer.csrfToken ?? "")}" />
                <input type="hidden" name="action" value="${isInfluential ? "unmark" : "mark"}" />
                <button type="submit" class="btn btn-ghost btn-tiny">${isInfluential ? "Unmark influential" : "Mark as influential"}</button>
              </form>`
            : "";
          return `<div class="opinion-item${isInfluential ? " opinion-item-influential" : ""}" data-opinion-user="${o.userId}">
          <div class="opinion-item-head">
            <a href="/u/${encodeURIComponent(o.authorHandle)}" class="opinion-author">@${escapeHtml(o.authorHandle)}</a>
            ${opinionBadge(o, optionNameFor(options, o.selectedOptionId), "small")}
            ${isInfluential ? `<span class="influential-badge" title="The buyer found this opinion influential">⭐ Influenced the decision</span>` : ""}
            <span class="opinion-time muted">${timeAgo(o.updatedAt)}</span>
          </div>
          <p class="opinion-comment">${escapeHtml(o.comment)}</p>
          ${markControl}
        </div>`;
        })
        .join("\n")
    : `<p class="muted">No opinions yet — be the first to weigh in.</p>`;

  const ownerControls = isAuthor
    ? `<div class="post-owner-controls">
        <a href="/posts/${post.id}/edit" class="btn btn-ghost btn-small">Edit post</a>
      </div>`
    : "";

  const reportControl = viewer.user && !isAuthor
    ? `<details class="report-details">
        <summary>Report this post</summary>
        <form method="post" action="/posts/${post.id}/report" class="report-form">
          <input type="hidden" name="csrf" value="${escapeHtml(viewer.csrfToken ?? "")}" />
          <textarea name="reason" placeholder="What's wrong with this post?" maxlength="500" required></textarea>
          <button type="submit" class="btn btn-ghost btn-small">Submit report</button>
        </form>
      </details>`
    : "";

  const demoBanner = post.isDemo
    ? `<div class="demo-banner" role="note">🤖 Demo scenario — AI-generated fictional content</div>`
    : "";

  const contextSection = contextCard(data.context ?? null, data.contextPrompts ?? []);

  const comparisonCounts = data.optionCounts ?? { counts: {}, noneCount: 0 };
  const comparisonGrid = isComparison
    ? `<div class="comparison-grid">
        ${options
          .map((opt) => purchaseOptionCard(opt, comparisonCounts.counts[opt.id] ?? 0, myOpinion?.selectedOptionId === opt.id))
          .join("\n")}
      </div>
      ${comparisonCounts.noneCount > 0 ? `<p class="muted comparison-none-count">✋ ${comparisonCounts.noneCount} said none of these</p>` : ""}`
    : "";

  const relatedSection = data.relatedPosts && data.relatedPosts.length > 0
    ? `<section class="related-section">
        <h2>Related decisions</h2>
        <div class="related-grid">${data.relatedPosts.map((p) => relatedDecisionCard(p)).join("\n")}</div>
      </section>`
    : "";

  const summarySection = isComparison
    ? comparisonGrid
    : `<div class="opinion-summary" id="opinion-summary">
        <div class="opinion-counts">
          <span class="count-buy" id="count-buy">👍 ${buyCount} Buy</span>
          <span class="count-pass" id="count-pass">👎 ${passCount} Pass</span>
        </div>
        <div class="stat-bar stat-bar-large"><span class="stat-bar-fill" id="buy-pct-bar" style="width:${buyPct}%"></span></div>
      </div>`;

  const body = `
<article class="post-detail${isComparison ? " post-detail-comparison" : ""}" data-post-id="${post.id}" data-post-mode="${post.mode}">
  ${flashBanner(flash.message, flash.kind)}
  ${demoBanner}
  <div class="post-detail-grid">
    <div class="post-detail-media">${gallery}</div>
    <div class="post-detail-info">
      ${post.visibility === "unlisted" ? `<span class="post-card-tag unlisted-tag">Unlisted — share link only</span>` : ""}
      <span class="post-detail-category">${escapeHtml(category.name)}</span>
      <h1>${escapeHtml(post.title)}</h1>
      <p class="post-detail-meta">by <a href="/u/${encodeURIComponent(author.handle)}">@${escapeHtml(author.handle)}</a> · ${timeAgo(post.createdAt)}</p>
      ${!isComparison && price ? `<p class="post-detail-price">${escapeHtml(price)}</p>` : ""}
      <p class="post-detail-description">${escapeHtml(post.description)}</p>
      ${post.tags.length > 0 ? `<div class="tag-row">${post.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join("")}</div>` : ""}
      ${ownerControls}

      ${contextSection}
      ${!isComparison ? summarySection : ""}
      ${opinionForm}
      ${outcomeSection}
    </div>
  </div>

  ${isComparison ? `<section class="comparison-section">${summarySection}</section>` : ""}

  <section class="opinions-section">
    <h2>Opinions (<span id="opinion-count">${opinions.length}</span>)</h2>
    <div id="opinions-list" class="opinions-list">${opinionsList}</div>
  </section>

  ${relatedSection}

  ${reportControl}
</article>
<div id="live-connection-label" data-connected="false" hidden></div>`;
  return layout({ title: post.title, viewer, body, bodyClass: "page-post-detail" });
}

// ------------------------------------------------------------ demo feed ---

/**
 * Feature D's "Explore Demo" section (brief: "a clearly labelled 'Explore
 * Demo' section," readable without registration — the route this renders
 * from, GET /discover/demo, has no auth requirement). Reuses postCard
 * (which already renders the 🤖 Demo tag on any post with isDemo=true)
 * rather than a parallel card component, so a demo post's card looks
 * exactly like a real one except for that one unmistakable tag.
 */
export function demoFeedPage(viewer: ViewerContext, items: DiscoverFeedItem[]): string {
  const body = `
<section class="discover-header demo-feed-header">
  <h1>Explore Demo</h1>
  <p class="muted">${items.length} fictional purchasing scenarios, written to show what Buy or Pass looks like with an active community. None of these are real people, posts, or opinions.</p>
</section>
${items.length > 0
  ? `<div class="post-grid">${items.map((i) => postCard(i.post, i)).join("\n")}</div>`
  : emptyState({ icon: "🤖", title: "No demo scenarios yet", body: "An admin hasn't seeded the demo content yet." })}`;
  return layout({ title: "Explore Demo", viewer, body, bodyClass: "page-discover page-demo-feed" });
}

// -------------------------------------------------------- create/edit -----

export interface CreateEditPostMode {
  kind: "create" | "edit";
  post?: Post;
  existingImageIds?: string[];
  existingOptions?: PurchaseOption[];
  existingContext?: PostContext | null;
}

/** One blank/prefilled option block's HTML, reused for both the N options already on an edited post and the empty template a "+ Add option" click clones. */
function optionFormBlock(index: number, existing?: PurchaseOption): string {
  const priceValue = existing ? (existing.expectedPriceCents / 100).toFixed(2) : "";
  const originalValue = existing?.originalPriceCents != null ? (existing.originalPriceCents / 100).toFixed(2) : "";
  return `<fieldset class="option-form-block" data-option-index="${index}">
    <legend>Option ${index + 1}</legend>
    <label>Name
      <input type="text" name="option_name_${index}" maxlength="80" value="${escapeHtml(existing?.name ?? "")}" placeholder="e.g. Western Mountaineering MegaLite" />
    </label>
    <label>Photo (optional)
      <input type="file" name="option_image_${index}" accept="image/*" />
    </label>
    ${existing?.imageId ? `<img src="/images/${existing.imageId}" alt="" class="existing-image-thumb" />` : ""}
    <div class="form-row">
      <label>Expected price
        <input type="number" name="option_price_${index}" min="0" step="0.01" value="${priceValue}" placeholder="0.00" />
      </label>
      <label>Currency
        <input type="text" name="option_currency_${index}" maxlength="3" value="${escapeHtml(existing?.currency ?? "AUD")}" placeholder="AUD" style="text-transform:uppercase" />
      </label>
    </div>
    <div class="form-row">
      <label>Original price (optional)
        <input type="number" name="option_original_price_${index}" min="0" step="0.01" value="${originalValue}" placeholder="0.00" />
      </label>
      <label>Condition (optional)
        <input type="text" name="option_condition_${index}" maxlength="60" value="${escapeHtml(existing?.condition ?? "")}" placeholder="e.g. new, used" />
      </label>
    </div>
    <label>Sale note (optional)
      <input type="text" name="option_sale_note_${index}" maxlength="120" value="${escapeHtml(existing?.saleNote ?? "")}" placeholder="e.g. 20% off until Friday" />
    </label>
    <label>Source link (optional)
      <input type="url" name="option_source_url_${index}" maxlength="500" value="${escapeHtml(existing?.sourceUrl ?? "")}" placeholder="https://…" />
    </label>
    <button type="button" class="btn btn-ghost btn-small remove-option-btn">Remove this option</button>
  </fieldset>`;
}

export function createEditPostPage(
  viewer: ViewerContext,
  categories: Category[],
  error: string | null,
  mode: CreateEditPostMode,
): string {
  const isEdit = mode.kind === "edit";
  const post = mode.post ?? null;
  const action = isEdit ? `/posts/${mode.post!.id}/edit` : "/posts/new";
  const postMode: PostMode = post?.mode ?? "BUY_PASS";
  const existingOptions = mode.existingOptions ?? [];
  const existingImageIds = mode.existingImageIds ?? [];
  const existingContext = mode.existingContext ?? null;

  const optionBlocks = postMode === "WHICH_ONE"
    ? (existingOptions.length > 0 ? existingOptions : [undefined, undefined]).map((opt, i) => optionFormBlock(i, opt)).join("\n")
    : [0, 1].map((i) => optionFormBlock(i)).join("\n");

  // Every category's context prompts are rendered, one block per category,
  // and app.js shows only the block matching the selected <select> value —
  // server-rendered, no per-category AJAX round-trip needed to pick prompts.
  const contextBlocksByCategory = categories
    .map((c) => {
      const prompts = getContextPrompts(c.id);
      if (prompts.length === 0) return "";
      return `<div class="context-prompt-block" data-category-id="${c.id}" hidden>
        ${prompts
          .map(
            (p) => `<label>${escapeHtml(p.label)} <span class="hint">(optional)</span>
              <input type="text" name="context_${p.key}" maxlength="200" value="${escapeHtml(existingContext?.categoryKey === c.id ? existingContext.answers[p.key] ?? "" : "")}" placeholder="${escapeHtml(p.placeholder ?? "")}" />
            </label>`,
          )
          .join("\n")}
      </div>`;
    })
    .join("\n");

  const body = `
<section class="form-section">
  <h1>${isEdit ? "Edit your post" : "What are you thinking about buying?"}</h1>
  <p class="muted">Keep it quick — a title, a photo or two, and why you're considering it.</p>
  ${flashBanner(error)}

  <form method="post" action="${action}" enctype="multipart/form-data" class="form-stack post-form" data-post-mode="${postMode}">
    <input type="hidden" name="csrf" value="${escapeHtml(viewer.csrfToken ?? "")}" />

    ${!isEdit
      ? `<fieldset class="mode-fieldset">
          <legend>What kind of post is this?</legend>
          <label class="radio-row"><input type="radio" name="mode" value="BUY_PASS" ${postMode === "BUY_PASS" ? "checked" : ""} /> Buy or Pass — one product, a simple 👍/👎</label>
          <label class="radio-row"><input type="radio" name="mode" value="WHICH_ONE" ${postMode === "WHICH_ONE" ? "checked" : ""} /> Which One? — compare 2-4 candidate products</label>
        </fieldset>`
      : `<input type="hidden" name="mode" value="${postMode}" />`}

    <label>${postMode === "WHICH_ONE" ? "Purchasing question" : "Product title"}
      <input type="text" name="title" required maxlength="120" value="${escapeHtml(post?.title ?? "")}" placeholder="${postMode === "WHICH_ONE" ? "e.g. Which sleeping bag for a cold NZ hike?" : "e.g. Mac mini M4 Pro for local AI dev"}" />
    </label>

    <label>Category
      <select name="category" required id="category-select">
        <option value="" disabled ${!post ? "selected" : ""}>Choose a category…</option>
        ${categoryOptions(categories, post?.categoryId)}
      </select>
    </label>

    <div class="context-prompts-container" id="context-prompts-container">${contextBlocksByCategory}</div>
    <label>Anything else relevant? <span class="hint">(optional)</span>
      <textarea name="context_free_text" maxlength="500" placeholder="Anything that doesn't fit the prompts above">${escapeHtml(existingContext?.freeText ?? "")}</textarea>
    </label>

    <div class="single-product-fields"${postMode === "WHICH_ONE" ? " hidden" : ""}>
      <label>Photos (1–4)
        <input type="file" name="images" accept="image/*" multiple capture="environment" />
        <span class="hint">JPEG, PNG, WebP, or GIF. Each photo is re-encoded and stripped of location/metadata.</span>
      </label>
      ${isEdit && existingImageIds.length > 0
        ? `<div class="existing-images">${existingImageIds.map((id) => `<img src="/images/${id}" alt="" class="existing-image-thumb" />`).join("")}<p class="hint">Uploading new photos replaces these.</p></div>`
        : ""}

      <div class="form-row">
        <label>Price (optional)
          <input type="number" name="price" min="0" step="0.01" value="${post?.priceCents !== null && post?.priceCents !== undefined ? (post.priceCents / 100).toFixed(2) : ""}" placeholder="0.00" />
        </label>
        <label>Currency
          <input type="text" name="currency" maxlength="3" value="${escapeHtml(post?.currency ?? "AUD")}" placeholder="AUD" style="text-transform:uppercase" />
        </label>
      </div>
    </div>

    <div class="comparison-fields"${postMode === "BUY_PASS" ? " hidden" : ""}>
      <div class="option-form-blocks" id="option-form-blocks">${optionBlocks}</div>
      <button type="button" class="btn btn-ghost btn-small" id="add-option-btn">+ Add another option (up to 4)</button>
    </div>

    <label>Tags (optional, comma-separated)
      <input type="text" name="tags" maxlength="200" value="${escapeHtml((post?.tags ?? []).join(", "))}" placeholder="developer-hardware, local-ai" />
    </label>

    <label>Why are you considering this?
      <textarea name="description" required maxlength="2000" placeholder="What would you use it for? What's pulling you toward it?">${escapeHtml(post?.description ?? "")}</textarea>
    </label>

    <fieldset class="visibility-fieldset">
      <legend>Visibility</legend>
      <label class="radio-row"><input type="radio" name="visibility" value="public" ${!post || post.visibility === "public" ? "checked" : ""} /> Public — appears in Discover</label>
      <label class="radio-row"><input type="radio" name="visibility" value="unlisted" ${post?.visibility === "unlisted" ? "checked" : ""} /> Unlisted — only people with the link can see it</label>
    </fieldset>

    <button type="submit" class="btn btn-brand btn-large btn-block">${isEdit ? "Save changes" : "Publish post"}</button>
  </form>
</section>`;
  return layout({ title: isEdit ? "Edit post" : "New post", viewer, activeNav: "create", body, bodyClass: "page-post-form" });
}

// ----------------------------------------------------------- profile ------

export interface ProfileData {
  profileUser: User;
  isOwnProfile: boolean;
  interests: Category[];
  allCategories: Category[];
  authoredPosts: DiscoverFeedItem[];
  opinionsGiven: { opinion: Opinion; post: Post; optionName: string | null }[];
  purchaseOutcomes: { post: Post; outcome: PostOutcome }[];
}

export function profilePage(
  viewer: ViewerContext,
  data: ProfileData,
  flash?: { message: string | null; kind: "error" | "success" },
): string {
  const { profileUser, isOwnProfile, interests, allCategories, authoredPosts, opinionsGiven, purchaseOutcomes } = data;

  const interestsBlock = isOwnProfile
    ? `<form method="post" action="/me/interests" class="interests-form">
        <input type="hidden" name="csrf" value="${escapeHtml(viewer.csrfToken ?? "")}" />
        <div class="interest-checks">
          ${allCategories
            .map(
              (c) =>
                `<label class="interest-check"><input type="checkbox" name="interests" value="${c.id}" ${interests.some((i) => i.id === c.id) ? "checked" : ""} /> ${escapeHtml(c.name)}</label>`,
            )
            .join("")}
        </div>
        <button type="submit" class="btn btn-secondary btn-small">Save interests</button>
      </form>`
    : interests.length > 0
    ? `<div class="tag-row">${interests.map((i) => `<span class="tag">${escapeHtml(i.name)}</span>`).join("")}</div>`
    : `<p class="muted">No public interests yet.</p>`;

  const editProfileBlock = isOwnProfile
    ? `<details class="profile-edit-details">
        <summary>Edit profile</summary>
        <form method="post" action="/me/profile" enctype="multipart/form-data" class="form-stack">
          <input type="hidden" name="csrf" value="${escapeHtml(viewer.csrfToken ?? "")}" />
          <label>Display name<input type="text" name="displayName" maxlength="60" value="${escapeHtml(profileUser.displayName)}" required /></label>
          <label>Bio<textarea name="bio" maxlength="300" placeholder="A short public bio">${escapeHtml(profileUser.bio)}</textarea></label>
          <label>Avatar photo (optional)<input type="file" name="avatar" accept="image/*" /></label>
          <button type="submit" class="btn btn-secondary">Save profile</button>
        </form>
      </details>
      <details class="profile-edit-details">
        <summary>Account settings</summary>
        <form method="post" action="/me/password" class="form-stack">
          <input type="hidden" name="csrf" value="${escapeHtml(viewer.csrfToken ?? "")}" />
          <label>Current password<input type="password" name="currentPassword" required autocomplete="current-password" /></label>
          <label>New password<input type="password" name="newPassword" required minlength="8" maxlength="256" autocomplete="new-password" /></label>
          <button type="submit" class="btn btn-secondary">Change password</button>
        </form>
      </details>`
    : "";

  const avatarLarge = profileUser.avatarImageId
    ? `<img src="/images/${profileUser.avatarImageId}" alt="" class="profile-avatar-large profile-avatar-photo" />`
    : `<div class="profile-avatar-large">${escapeHtml((profileUser.displayName.trim()[0] ?? "?").toUpperCase())}</div>`;

  const body = `
${flash ? flashBanner(flash.message, flash.kind) : ""}
<section class="profile-header">
  ${avatarLarge}
  <div>
    <h1>${escapeHtml(profileUser.displayName)}</h1>
    <p class="muted">@${escapeHtml(profileUser.handle)}</p>
    ${profileUser.bio ? `<p class="profile-bio">${escapeHtml(profileUser.bio)}</p>` : ""}
  </div>
</section>
${editProfileBlock}

<section class="section">
  <h2>Interests</h2>
  ${interestsBlock}
</section>

<section class="section">
  <h2>Posts by @${escapeHtml(profileUser.handle)}</h2>
  ${authoredPosts.length > 0
    ? `<div class="post-grid">${authoredPosts.map((i) => postCard(i.post, i)).join("\n")}</div>`
    : `<p class="muted">No public posts yet.</p>`}
</section>

${isOwnProfile
  ? `<section class="section">
      <h2>Opinions you've given</h2>
      ${opinionsGiven.length > 0
        ? `<div class="activity-list">${opinionsGiven
            .map(
              (o) => `<a href="/posts/${o.post.id}" class="activity-row">
              ${opinionBadge(o.opinion, o.optionName, "small")}
              <span>${escapeHtml(o.post.title)}</span>
              <span class="muted">${timeAgo(o.opinion.updatedAt)}</span>
            </a>`,
            )
            .join("\n")}</div>`
        : `<p class="muted">You haven't given any opinions yet.</p>`}
    </section>

    <section class="section">
      <h2>Your purchase outcomes</h2>
      ${purchaseOutcomes.length > 0
        ? `<div class="activity-list">${purchaseOutcomes
            .map(
              (o) => `<a href="/posts/${o.post.id}" class="activity-row">
              ${outcomeBadge(o.outcome.status)}
              <span>${escapeHtml(o.post.title)}</span>
              <span class="muted">${timeAgo(o.outcome.updatedAt)}</span>
            </a>`,
            )
            .join("\n")}</div>`
        : `<p class="muted">No purchase outcomes recorded yet — record one from any of your own posts.</p>`}
    </section>`
  : ""}`;
  return layout({ title: profileUser.displayName, viewer, activeNav: isOwnProfile ? "profile" : undefined, body, bodyClass: "page-profile" });
}

// ------------------------------------------------------- my activity ------

export interface ActivityFeedItem {
  kind: "new_opinion" | "post_created" | "outcome_recorded";
  postId: string;
  postTitle: string;
  detail: string;
  ts: string;
}

export function myActivityPage(viewer: ViewerContext, items: ActivityFeedItem[]): string {
  const body = `
<section class="section">
  <h1>My activity</h1>
  <p class="muted">What's happened on your posts recently.</p>
  ${items.length > 0
    ? `<div class="activity-list">${items
        .map(
          (i) => `<a href="/posts/${i.postId}" class="activity-row">
          <span class="activity-icon">${i.kind === "new_opinion" ? "💬" : i.kind === "post_created" ? "🛍️" : "📦"}</span>
          <span><strong>${escapeHtml(i.postTitle)}</strong><br/><span class="muted">${escapeHtml(i.detail)}</span></span>
          <span class="muted">${timeAgo(i.ts)}</span>
        </a>`,
        )
        .join("\n")}</div>`
    : emptyState({ icon: "📭", title: "No activity yet", body: "Once people react to your posts, you'll see it here." })}
</section>`;
  return layout({ title: "My activity", viewer, activeNav: "activity", body, bodyClass: "page-activity" });
}

// ------------------------------------------------------------- admin ------

export function adminPage(viewer: ViewerContext): string {
  const body = `
<section class="section admin-section" id="admin-root" data-csrf="${escapeHtml(viewer.csrfToken ?? "")}">
  <h1>Observability</h1>
  <p class="muted">Live, structured server activity — for C10 "Fly by instruments." Identifiers only; no passwords, tokens, emails, or free-text content are ever shown here.</p>

  <div class="admin-stats" id="admin-stats">
    <div class="admin-stat"><span class="admin-stat-value" id="stat-active-users">–</span><span class="admin-stat-label">Active users (1h)</span></div>
    <div class="admin-stat"><span class="admin-stat-value" id="stat-total-events">–</span><span class="admin-stat-label">Events (1h)</span></div>
    <div class="admin-stat"><span class="admin-stat-value" id="stat-failed-events">–</span><span class="admin-stat-label">Failures (1h)</span></div>
    <div class="admin-stat"><span class="admin-stat-value" id="stat-connection">●</span><span class="admin-stat-label" id="stat-connection-label">connecting…</span></div>
  </div>

  <h2>Live event log</h2>
  <div class="admin-log" id="admin-log" aria-live="polite"></div>

  <h2>Open reports</h2>
  <div id="admin-reports" class="admin-reports"></div>
</section>`;
  return layout({ title: "Observability", viewer, activeNav: "admin", body, bodyClass: "page-admin" });
}

export function notFoundPage(viewer: ViewerContext): string {
  const body = emptyState({ icon: "🤷", title: "Nothing here", body: "This post may be private, deleted, or never existed.", actionHref: "/discover", actionLabel: "Back to Discover" });
  return layout({ title: "Not found", viewer, body, bodyClass: "page-notfound" });
}

export function errorPage(viewer: ViewerContext, status: number, message: string): string {
  const body = emptyState({ icon: status >= 500 ? "⚠️" : "🚫", title: `Error ${status}`, body: message, actionHref: "/", actionLabel: "Back home" });
  return layout({ title: `Error ${status}`, viewer, body, bodyClass: "page-error" });
}
