// Server-rendered page bodies. Each function returns the <body>-level HTML
// that render.ts's layout() wraps with nav/footer/head. Kept as plain
// template strings (no templating engine) to match the zero-framework stack;
// every user-authored string passed through escapeHtml() before interpolation.
import type { Category, Opinion, OpinionWithAuthor, Post, PostContext, PostMode, PostOutcome, PurchaseOption, User } from "./db.ts";
import { getContextPrompts, type ContextPrompt } from "./context-prompts.ts";
import type { ExternalReference } from "./external-references.ts";
import type { CatalogImportSource, CatalogProduct, CatalogProductImage } from "./catalog.ts";
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
  productCard,
  purchaseOptionCard,
  referenceCard,
  relatedDecisionCard,
  stanceBadge,
  timeAgo,
  type ViewerContext,
} from "./render.ts";

// --------------------------------------------------------------- landing --

export function landingPage(
  viewer: ViewerContext,
  featured: Array<{ post: Post; coverImageId: string | null; authorHandle: string; authorDisplayName: string; categoryName: string; buyCount: number; passCount: number }>,
  featuredProducts: DiscoverProductItem[] = [],
): string {
  // Core user journey, made literal in the page's own section order: the
  // purchasing question comes first (the hero names the actual question
  // this product answers, not a generic tagline), then how a decision
  // actually gets made here, then what's happening right now — real posts
  // if any exist, otherwise an honest "we're new" state that offers the
  // labelled demo content instead of a bare empty box or a wall of
  // decoration standing in for substance.
  const productSection = featuredProducts.length > 0
    ? `<section class="section">
        <div class="section-header">
          <h2>Start from a real product</h2>
          <a href="/discover" class="link-more">Browse the catalog →</a>
        </div>
        <div class="product-grid">${featuredProducts.map((p) => productCard(p.product, p.image, { categoryName: p.categoryName, questionCount: p.questionCount })).join("\n")}</div>
      </section>`
    : "";
  const realFeedSection = featured.length > 0
    ? `<section class="section">
        <div class="section-header">
          <h2>Recent purchasing questions</h2>
          <a href="/discover?view=questions" class="link-more">See all →</a>
        </div>
        <div class="post-grid">${featured.map((f) => postCard(f.post, f)).join("\n")}</div>
      </section>`
    : `<section class="section section-new-platform">
        <div class="new-platform-card">
          <h2>No community questions yet</h2>
          <p>Buy or Pass is new, and we won't fill this space with made-up activity. Pick a product above, or ask about anything you're weighing up, and yours will be the first.</p>
          <a href="${viewer.user ? "/posts/new" : "/register"}" class="btn btn-brand btn-large">Ask the first question</a>
        </div>
      </section>`;

  const body = `
<section class="hero">
  <div class="hero-inner">
    <h1 class="hero-title">You want it. What does everyone else think?</h1>
    <p class="hero-sub">Post what you're thinking about buying — with enough context for an honest answer. Real people give you a quick 👍 Buy or 👎 Pass, or help you pick between a few options. You still make the call.</p>
    <div class="hero-actions">
      <a href="${viewer.user ? "/posts/new" : "/register"}" class="btn btn-brand btn-large">Post something you're eyeing</a>
      <a href="/discover" class="btn btn-ghost btn-large">Explore opinions</a>
    </div>
    <div class="hero-howitworks">
      <div class="howitworks-step"><span class="step-num">1</span><div><strong>Post it</strong><p>Photos, price, and the context that makes your situation specific.</p></div></div>
      <div class="howitworks-step"><span class="step-num">2</span><div><strong>Get real opinions</strong><p>👍 Buy or 👎 Pass — or a pick between options — plus one honest sentence.</p></div></div>
      <div class="howitworks-step"><span class="step-num">3</span><div><strong>You decide</strong><p>The purchase is always yours to make.</p></div></div>
    </div>
  </div>
</section>

${productSection}

${realFeedSection}

<section class="section section-definition">
  <div class="definition-card">
    <h2>A good purchasing decision depends on the person, not just the product.</h2>
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
  coverImageUrl?: string | null; // a linked catalog product's real photo, when the post has no uploaded one
  authorHandle: string;
  authorDisplayName: string;
  categoryName: string;
  buyCount: number;
  passCount: number;
  // WHICH_ONE posts only: total opinions across all options plus "none of
  // these", since a card can't show a single Buy/Pass bar for a comparison
  // post — buyCount/passCount are always 0 for these posts (comparison
  // selections never count as a stance; see getOpinionCounts's own
  // "AND stance IS NOT NULL" guard).
  comparisonOpinionCount?: number;
}

export type DiscoverView = "products" | "questions";

export interface DiscoverFilters {
  view: DiscoverView;
  categoryId?: string;
  search?: string;
  sort?: "recent" | "discussed";
  page?: number;
}

/**
 * Every link on Discover (view switch, category pill, sort, search,
 * pagination) round-trips through this, so a filter combination survives
 * navigation and is itself a shareable URL.
 */
function discoverParams(filters: DiscoverFilters, overrides: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  const merged: Record<string, string | undefined> = {
    view: filters.view === "questions" ? "questions" : undefined,
    category: filters.categoryId,
    q: filters.search,
    sort: filters.view === "questions" && filters.sort === "discussed" ? "discussed" : undefined,
    ...overrides,
  };
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export interface DiscoverProductItem {
  product: CatalogProduct;
  image: CatalogProductImage | null;
  categoryName: string;
  questionCount: number;
}

/**
 * Discover is one place to browse two genuinely different things: real
 * catalog products (the default — image-led, factual) and real
 * community purchasing questions. Fictional demo scenarios and the archived
 * external-reference research are deliberately NOT here; they live at
 * /showcase, clearly labelled, so nothing on this page implies activity
 * that didn't happen.
 */
export function discoverPage(
  viewer: ViewerContext,
  categories: Category[],
  filters: DiscoverFilters,
  data: {
    products?: DiscoverProductItem[];
    productTotal?: number;
    totalPages?: number;
    questions?: DiscoverFeedItem[];
    nextCursor?: string | null;
  },
): string {
  const isQuestions = filters.view === "questions";

  const viewTabs = (["products", "questions"] as const)
    .map((v) => {
      const label = v === "products" ? "Products" : "Questions";
      const active = filters.view === v;
      return `<a href="/discover${discoverParams(filters, { view: v === "questions" ? "questions" : undefined, sort: undefined, page: undefined, cursor: undefined })}" class="source-tab${active ? " source-tab-active" : ""}" aria-current="${active ? "page" : "false"}">${label}</a>`;
    })
    .join("");

  const categoryPills = [`<a href="/discover${discoverParams(filters, { category: undefined, page: undefined, cursor: undefined })}" class="pill${!filters.categoryId ? " pill-active" : ""}">All</a>`]
    .concat(
      categories.map(
        (c) =>
          `<a href="/discover${discoverParams(filters, { category: c.id, page: undefined, cursor: undefined })}" class="pill${filters.categoryId === c.id ? " pill-active" : ""}">${escapeHtml(c.name)}</a>`,
      ),
    )
    .join("");

  const resetLink = filters.categoryId || filters.search
    ? `<a href="/discover${discoverParams({ view: filters.view }, {})}" class="link-more">Clear filters →</a>`
    : "";

  let main: string;
  if (!isQuestions) {
    const products = data.products ?? [];
    const page = filters.page ?? 1;
    const totalPages = data.totalPages ?? 1;
    const pager = totalPages > 1
      ? `<nav class="pager" aria-label="Product pages">
          ${page > 1 ? `<a class="btn btn-ghost btn-small" href="/discover${discoverParams(filters, { page: page - 1 > 1 ? String(page - 1) : undefined })}">← Previous</a>` : `<span></span>`}
          <span class="pager-status">Page ${page} of ${totalPages}</span>
          ${page < totalPages ? `<a class="btn btn-ghost btn-small" href="/discover${discoverParams(filters, { page: String(page + 1) })}">Next →</a>` : `<span></span>`}
        </nav>`
      : "";
    main = products.length > 0
      ? `<p class="discover-count">${data.productTotal ?? products.length} product${(data.productTotal ?? products.length) === 1 ? "" : "s"}${filters.search ? ` matching “${escapeHtml(filters.search)}”` : ""}</p>
         <div class="product-grid">${products.map((p) => productCard(p.product, p.image, { categoryName: p.categoryName, questionCount: p.questionCount })).join("\n")}</div>
         ${pager}`
      : `<div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <h3>No products match</h3>
          <p>${filters.search ? `Nothing in the catalog matches “${escapeHtml(filters.search)}”${filters.categoryId ? " in this category" : ""}.` : "The catalog has no products in this category yet."} You can still ask about something that isn't listed.</p>
          <div class="empty-state-actions">${resetLink}</div>
          <a href="${viewer.user ? "/posts/new" : "/register"}" class="btn btn-brand">Ask about any product</a>
        </div>`;
  } else {
    const questions = data.questions ?? [];
    const sortToggle = `<div class="sort-toggle" role="radiogroup" aria-label="Sort questions">
      <a href="/discover${discoverParams(filters, { sort: undefined, cursor: undefined })}" class="sort-option${filters.sort !== "discussed" ? " active" : ""}">Recent</a>
      <a href="/discover${discoverParams(filters, { sort: "discussed", cursor: undefined })}" class="sort-option${filters.sort === "discussed" ? " active" : ""}">Most discussed</a>
    </div>`;
    const nextLink = data.nextCursor
      ? `<div class="load-more-row"><a class="btn btn-ghost" href="/discover${discoverParams(filters, { cursor: data.nextCursor })}">Load more →</a></div>`
      : "";
    main = `${sortToggle}
      ${questions.length > 0
        ? `<div class="post-grid">${questions.map((i) => postCard(i.post, i)).join("\n")}</div>${nextLink}`
        : `<div class="empty-state">
            <div class="empty-state-icon">💬</div>
            <h3>${filters.search || filters.categoryId ? "No questions match" : "No community questions yet"}</h3>
            <p>${filters.search || filters.categoryId
              ? "No real community question matches these filters yet."
              : "Buy or Pass is new — nobody has asked a question here yet. Pick a product and be the first."}</p>
            <div class="empty-state-actions">
              ${resetLink}
              <a href="/discover${discoverParams({ view: "products", categoryId: filters.categoryId }, {})}" class="link-more">Browse products →</a>
            </div>
            <a href="${viewer.user ? "/posts/new" : "/register"}" class="btn btn-brand">Ask a question</a>
          </div>`}`;
  }

  const body = `
<section class="discover-header">
  <div>
    <h1>Discover</h1>
    <p class="discover-intro">${isQuestions
      ? "Real purchasing questions from the Buy or Pass community."
      : "Real products with real photos. Pick one and ask the community whether it fits your situation."}</p>
  </div>
  <form method="get" action="/discover" class="search-form" role="search">
    ${isQuestions ? `<input type="hidden" name="view" value="questions" />` : ""}
    ${filters.categoryId ? `<input type="hidden" name="category" value="${escapeHtml(filters.categoryId)}" />` : ""}
    <input type="search" name="q" placeholder="${isQuestions ? "Search questions…" : "Search products or brands…"}" value="${escapeHtml(filters.search ?? "")}" aria-label="${isQuestions ? "Search questions" : "Search products"}" />
    <button type="submit" class="btn btn-brand">Search</button>
  </form>
</section>
<nav class="source-tabs" aria-label="Browse">${viewTabs}</nav>
<nav class="category-pills" aria-label="Filter by category">${categoryPills}</nav>
<section class="discover-main">${main}</section>`;
  return layout({ title: "Discover", viewer, activeNav: "discover", body, bodyClass: "page-discover" });
}

// ------------------------------------------------------- product detail ---

export interface ProductDetailData {
  product: CatalogProduct;
  image: CatalogProductImage | null;
  attributes: { name: string; value: string }[];
  category: Category;
  source: CatalogImportSource | undefined;
  questions: DiscoverFeedItem[];
}

export function productDetailPage(viewer: ViewerContext, data: ProductDetailData): string {
  const { product, image, attributes, category, source, questions } = data;
  const askHref = `/posts/new?product=${encodeURIComponent(product.id)}`;
  const facts = [
    product.brand ? { name: "Brand", value: product.brand } : null,
    { name: "Category", value: category.name },
    ...attributes,
  ].filter((f): f is { name: string; value: string } => !!f);

  const body = `
<nav class="breadcrumb" aria-label="Breadcrumb"><a href="/discover">Discover</a> › <a href="/discover?category=${escapeHtml(category.id)}">${escapeHtml(category.name)}</a></nav>
<article class="product-detail">
  <div class="product-detail-media">
    ${image ? `<img src="${escapeHtml(image.filePath)}" alt="${escapeHtml(product.name)}" width="${image.width}" height="${image.height}" />` : ""}
    <p class="product-credit">Photo: Amazon.com, via <a href="${escapeHtml(source?.sourceUrl ?? "/credits")}" rel="noopener" target="_blank">Amazon Berkeley Objects</a> · <a href="${escapeHtml(source?.licenseUrl ?? "https://creativecommons.org/licenses/by/4.0/")}" rel="noopener license" target="_blank">CC BY 4.0</a> · resized</p>
  </div>
  <div class="product-detail-info">
    <p class="product-card-eyebrow">${escapeHtml(category.name)}${product.brand ? ` · ${escapeHtml(product.brand)}` : ""}</p>
    <h1 class="product-detail-title">${escapeHtml(product.name)}</h1>
    ${product.keyAttribute ? `<p class="product-detail-attr">${escapeHtml(product.keyAttribute)}</p>` : ""}

    <div class="product-detail-actions">
      <a href="${askHref}" class="btn btn-brand btn-large">Ask about this product</a>
      <button type="button" class="btn btn-ghost" data-compare-toggle data-product-id="${escapeHtml(product.id)}" data-product-name="${escapeHtml(product.name)}">+ Add to comparison</button>
    </div>
    <p class="hint">You'll add what only you know — what you own now, how you'll use it, and the price you've been offered. Catalog data has no current price or availability.</p>

    ${facts.length > 0
      ? `<dl class="product-facts">${facts.map((f) => `<div><dt>${escapeHtml(f.name)}</dt><dd>${escapeHtml(f.value)}</dd></div>`).join("")}</dl>`
      : ""}
    ${product.features.length > 0
      ? `<details class="product-features"><summary>Listed features</summary><ul>${product.features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul><p class="hint">From the original catalog listing: “${escapeHtml(product.originalTitle)}”</p></details>`
      : ""}
  </div>
</article>

<section class="section product-questions" id="questions">
  <div class="section-header"><h2>Community questions about this product</h2></div>
  ${questions.length > 0
    ? `<div class="post-grid">${questions.map((q) => postCard(q.post, q)).join("\n")}</div>`
    : `<div class="product-questions-empty">
        <p>Nobody has asked about this product yet.</p>
        <a href="${askHref}" class="btn btn-brand">Be the first to ask</a>
      </div>`}
</section>`;
  return layout({ title: product.name, viewer, activeNav: "discover", body, bodyClass: "page-product" });
}

// -------------------------------------------------------------- credits ---

export function creditsPage(viewer: ViewerContext, sources: CatalogImportSource[], productCount: number): string {
  const body = `
<section class="form-section credits">
  <h1>Product data and image credits</h1>
  <p>Buy or Pass's product catalog (${productCount} products) is built from openly licensed data. Catalog records are factual product information only — they include no current prices, stock, ratings or reviews, and listing a product here is not an endorsement by its maker or seller.</p>
  ${sources
    .map(
      (s) => `<div class="credit-source">
        <h2>${escapeHtml(s.name)}</h2>
        <p>${escapeHtml(s.attribution)}</p>
        <ul>
          <li>Source: <a href="${escapeHtml(s.sourceUrl)}" rel="noopener" target="_blank">${escapeHtml(s.sourceUrl)}</a></li>
          <li>License: <a href="${escapeHtml(s.licenseUrl)}" rel="noopener license" target="_blank">${escapeHtml(s.license)}</a></li>
          <li>Retrieved: ${escapeHtml(s.retrievedAt)}</li>
        </ul>
        <p class="hint">Dataset: Collins et al., “ABO: Dataset and Benchmarks for Real-World 3D Object Understanding”, CVPR 2022. Data credit: Amazon.com. Dataset built by Matthieu Guillaumin, Thomas Dideriksen, Kenan Deng, Himanshu Arora, Arnab Dhua, Xi (Brian) Zhang and Tomas Yago-Vicente (Amazon.com) and Jasmine Collins, Shubham Goel and Jitendra Malik (UC Berkeley). Changes made: images resized and re-encoded; product names shortened for display (each product page lists its original catalog title).</p>
      </div>`,
    )
    .join("")}
</section>`;
  return layout({ title: "Credits", viewer, body, bodyClass: "page-credits" });
}

// ------------------------------------------------------------- showcase ---

export interface DiscoverReferenceItem extends ExternalReference {
  categoryName: string;
  imageUrl: string | null;
}

/**
 * Archive of the project's earlier content experiments, kept for evidence
 * and testing but out of the primary browsing experience: the 18 fictional
 * AI-authored demo scenarios (still labelled as such on every card) and the
 * eight researched external discussions.
 */
export function showcasePage(
  viewer: ViewerContext,
  section: "demo" | "references",
  data: { demoItems?: DiscoverFeedItem[]; referenceItems?: DiscoverReferenceItem[] },
): string {
  const tabs = `<nav class="source-tabs" aria-label="Showcase section">
    <a href="/showcase" class="source-tab${section === "demo" ? " source-tab-active" : ""}" aria-current="${section === "demo" ? "page" : "false"}">Fictional demo scenarios</a>
    <a href="/showcase/references" class="source-tab${section === "references" ? " source-tab-active" : ""}" aria-current="${section === "references" ? "page" : "false"}">Researched external discussions</a>
  </nav>`;
  const content = section === "demo"
    ? `<p class="discover-intro">These scenarios are fictional, written by an AI model during development to show how the format works. The people, votes and outcomes in them are not real Buy or Pass activity.</p>
       ${(data.demoItems ?? []).length
         ? `<div class="post-grid">${data.demoItems!.map((i) => postCard(i.post, i)).join("\n")}</div>`
         : `<p class="empty-state">No demo scenarios are loaded in this environment.</p>`}`
    : `<p class="discover-intro">Real purchasing discussions found elsewhere on the web during research. They are external, not Buy or Pass posts, and not open to voting here.</p>
       <div class="post-grid reference-grid">${(data.referenceItems ?? []).map((r) => referenceCard(r)).join("\n")}</div>`;
  const body = `
<section class="discover-header">
  <div>
    <h1>Showcase archive</h1>
    <p class="discover-intro">Earlier content experiments, kept for reference. For real products and real community questions, go to <a href="/discover">Discover</a>.</p>
  </div>
</section>
${tabs}
<section class="discover-main">${content}</section>`;
  return layout({ title: "Showcase archive", viewer, body, bodyClass: "page-discover page-showcase" });
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
  // The real catalog product a Buy or Pass question is about, if any, and
  // each catalog-linked option's catalog photo (option id → URL).
  catalogProduct?: { id: string; name: string; brand: string | null; imageUrl: string | null } | null;
  optionCatalogImages?: Record<string, string | null>;
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
    : data.catalogProduct?.imageUrl
    ? `<div class="post-gallery"><div class="post-gallery-main post-gallery-catalog"><img src="${escapeHtml(data.catalogProduct.imageUrl)}" alt="${escapeHtml(data.catalogProduct.name)}" id="gallery-main-img" /></div></div>`
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
          .map((opt) => purchaseOptionCard(opt, comparisonCounts.counts[opt.id] ?? 0, myOpinion?.selectedOptionId === opt.id, data.optionCatalogImages?.[opt.id] ?? null))
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

  const buyPassSummary = `<div class="opinion-summary" id="opinion-summary">
        <div class="opinion-counts">
          <span class="count-buy" id="count-buy">👍 ${buyCount} Buy</span>
          <span class="count-pass" id="count-pass">👎 ${passCount} Pass</span>
        </div>
        <div class="stat-bar stat-bar-large"><span class="stat-bar-fill" id="buy-pct-bar" style="width:${buyPct}%"></span></div>
      </div>`;

  const headerBlock = `${post.visibility === "unlisted" ? `<span class="post-card-tag unlisted-tag">Unlisted — share link only</span>` : ""}
      <span class="post-detail-category">${escapeHtml(category.name)}</span>
      <h1>${escapeHtml(post.title)}</h1>
      <p class="post-detail-meta">by <a href="/u/${encodeURIComponent(author.handle)}">@${escapeHtml(author.handle)}</a> · ${timeAgo(post.createdAt)}</p>
      ${!isComparison && price ? `<p class="post-detail-price">${escapeHtml(price)}</p>` : ""}
      ${data.catalogProduct
        ? `<a class="post-catalog-link" href="/products/${escapeHtml(data.catalogProduct.id)}">About: <strong>${escapeHtml(data.catalogProduct.name)}</strong> — view product →</a>`
        : ""}
      <p class="post-detail-description">${escapeHtml(post.description)}</p>
      ${post.tags.length > 0 ? `<div class="tag-row">${post.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join("")}</div>` : ""}
      ${ownerControls}`;

  // Reading order (approved core-journey redesign): purchasing question →
  // buyer context → product/options → simple opinion action → community
  // reasons → historical decisions. BUY_PASS keeps its existing two-column
  // layout (a real product gallery sits naturally alongside the question);
  // WHICH_ONE has no single product photo to anchor a media column against
  // (each option has its own), so the comparison grid itself — the actual
  // "product" content for this mode — now runs full-width immediately
  // after context and before the opinion form, instead of the previous
  // layout which buried it below the vote form entirely (a design-audit
  // finding: the core comparison content sat below the fold on mobile,
  // after a demo banner, category, title, description, tags and context
  // all stacked ahead of it).
  const mainColumn = isComparison
    ? `${headerBlock}
      ${contextSection}`
    : `${headerBlock}
      ${contextSection}
      ${buyPassSummary}
      ${opinionForm}
      ${outcomeSection}`;

  const body = `
<article class="post-detail${isComparison ? " post-detail-comparison" : ""}" data-post-id="${post.id}" data-post-mode="${post.mode}">
  ${flashBanner(flash.message, flash.kind)}
  ${demoBanner}
  <div class="post-detail-grid">
    ${isComparison ? "" : `<div class="post-detail-media">${gallery}</div>`}
    <div class="post-detail-info">
      ${mainColumn}
    </div>
  </div>

  ${isComparison
    ? `<section class="comparison-section">
        ${comparisonGrid}
        <div class="comparison-action">
          ${opinionForm}
          ${outcomeSection}
        </div>
      </section>`
    : ""}

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

// -------------------------------------------------------- create/edit -----

export interface CreateEditPostMode {
  kind: "create" | "edit";
  post?: Post;
  existingImageIds?: string[];
  existingOptions?: PurchaseOption[];
  existingContext?: PostContext | null;
  // Create mode only — preselects a category from a ?category= link (e.g. a
  // real-world reference's "Ask your own version of this question" button),
  // never used in edit mode where the post's own existing category wins.
  preselectedCategoryId?: string;
  // Create mode only — real catalog products this new question is about
  // (one for Buy or Pass, 2-4 for Which One?). Factual product data only:
  // the price is always the buyer's own, entered in the form.
  catalogProducts?: CatalogFormProduct[];
}

export interface CatalogFormProduct {
  id: string;
  name: string;
  categoryId: string;
  imageUrl: string | null;
  brand: string | null;
  keyAttribute: string | null;
}

/**
 * One blank/prefilled option block's HTML, reused for both the N options
 * already on an edited post and the empty template a "+ Add option" click
 * clones. Redesigned per the design-audit's "2800px wall of repeated
 * inputs" finding: every field from the original form is still here and
 * still has the same name="option_*_N" the server already parses — only
 * the layout changed. The two fields someone always fills in (photo, name
 * + price) sit in a compact header row; the five genuinely optional ones
 * (currency override, original price, condition, sale note, source link)
 * move into a closed-by-default <details> so a 2-option post reads as two
 * short cards, not fourteen always-open inputs.
 */
/** "Which one: A vs B vs C", falling back to "Which one of these N?" when the full names won't fit the 120-char title limit — never a name cut mid-word. */
function comparisonTitle(names: string[]): string {
  const full = `Which one: ${names.join(" vs ")}`;
  return full.length <= 120 ? full : `Which one of these ${names.length}?`;
}

function optionFormBlock(index: number, existing?: PurchaseOption, catalog?: CatalogFormProduct): string {
  const priceValue = existing ? (existing.expectedPriceCents / 100).toFixed(2) : "";
  const catalogId = catalog?.id ?? existing?.catalogProductId ?? null;
  const catalogImg = catalog?.imageUrl ?? null;
  const originalValue = existing?.originalPriceCents != null ? (existing.originalPriceCents / 100).toFixed(2) : "";
  return `<fieldset class="option-form-block${catalogId ? " option-form-block-catalog" : ""}" data-option-index="${index}">
    ${catalogId ? `<input type="hidden" name="option_catalog_product_id_${index}" value="${escapeHtml(catalogId)}" />` : ""}
    <div class="option-form-head">
      <legend>Option ${index + 1}</legend>
      <button type="button" class="btn btn-ghost btn-small remove-option-btn">Remove</button>
    </div>
    <div class="option-form-main">
      <label class="file-drop file-drop-option" data-file-drop>
        <input type="file" name="option_image_${index}" accept="image/*" class="file-drop-input" />
        <span class="file-drop-visual"${existing?.imageId || catalogImg ? " hidden" : ""}>
          <span class="file-drop-icon" aria-hidden="true">+</span>
          <span class="file-drop-text">Photo</span>
        </span>
        <img class="file-drop-preview" alt="" ${existing?.imageId ? `src="/images/${existing.imageId}"` : catalogImg ? `src="${escapeHtml(catalogImg)}"` : "hidden"} />
      </label>
      <div class="option-form-fields">
        <label>Name
          <input type="text" name="option_name_${index}" maxlength="80" value="${escapeHtml(existing?.name ?? catalog?.name ?? "")}" placeholder="e.g. Western Mountaineering MegaLite" />
        </label>
        <div class="form-row">
          <label>${catalogId ? "Your price" : "Expected price"}
            <input type="number" name="option_price_${index}" min="0" step="0.01" value="${priceValue}" placeholder="0.00" />
          </label>
          <label>Currency
            <input type="text" name="option_currency_${index}" maxlength="3" value="${escapeHtml(existing?.currency ?? "AUD")}" placeholder="AUD" style="text-transform:uppercase" />
          </label>
        </div>
      </div>
    </div>
    ${existing?.imageId ? `<p class="hint">Uploading a new photo replaces this one.</p>` : catalogImg ? `<p class="hint">Catalog photo (Amazon Berkeley Objects). Upload your own to replace it.</p>` : ""}
    <details class="option-more-details">
      <summary>More details <span class="hint">(original price, condition, sale note, link — all optional)</span></summary>
      <div class="option-more-details-fields">
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
      </div>
    </details>
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
  const catalogProducts = !isEdit ? mode.catalogProducts ?? [] : [];
  const postMode: PostMode = post?.mode ?? (catalogProducts.length >= 2 ? "WHICH_ONE" : "BUY_PASS");
  const singleCatalog = postMode === "BUY_PASS" && catalogProducts.length === 1 ? catalogProducts[0] : null;
  const preselectedCategory = post?.categoryId ?? mode.preselectedCategoryId ?? catalogProducts[0]?.categoryId;
  const existingOptions = mode.existingOptions ?? [];
  const existingImageIds = mode.existingImageIds ?? [];
  const existingContext = mode.existingContext ?? null;

  const optionBlocks = postMode === "WHICH_ONE"
    ? existingOptions.length > 0
      ? existingOptions.map((opt, i) => optionFormBlock(i, opt)).join("\n")
      : catalogProducts.length >= 2
      ? catalogProducts.slice(0, 4).map((c, i) => optionFormBlock(i, undefined, c)).join("\n")
      : [0, 1].map((i) => optionFormBlock(i)).join("\n")
    : [0, 1].map((i) => optionFormBlock(i)).join("\n");

  const catalogBanner = catalogProducts.length > 0
    ? `<div class="catalog-selection">
        <p class="catalog-selection-label">${catalogProducts.length === 1 ? "You're asking about" : `Comparing ${catalogProducts.length} catalog products`}</p>
        <div class="catalog-selection-items">
          ${catalogProducts
            .map(
              (c) => `<a href="/products/${escapeHtml(c.id)}" class="catalog-selection-item">
                ${c.imageUrl ? `<img src="${escapeHtml(c.imageUrl)}" alt="" />` : ""}
                <span><strong>${escapeHtml(c.name)}</strong>${c.keyAttribute ? `<span class="hint">${escapeHtml(c.keyAttribute)}</span>` : ""}</span>
              </a>`,
            )
            .join("")}
        </div>
        <p class="hint">Product details come from the catalog. Add what only you know: what you have now, how you'll use it, and the price you've been offered.</p>
      </div>`
    : "";
  const defaultTitle = post?.title ?? (singleCatalog ? `${singleCatalog.name} — worth it?` : catalogProducts.length >= 2 ? comparisonTitle(catalogProducts.map((c) => c.name)) : "");

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
  ${catalogBanner}

  <form method="post" action="${action}" enctype="multipart/form-data" class="form-stack post-form" data-post-mode="${postMode}">
    <input type="hidden" name="csrf" value="${escapeHtml(viewer.csrfToken ?? "")}" />
    ${singleCatalog ? `<input type="hidden" name="catalog_product_id" value="${escapeHtml(singleCatalog.id)}" />` : ""}

    ${!isEdit
      ? `<fieldset class="mode-fieldset">
          <legend>What kind of post is this?</legend>
          <label class="radio-row"><input type="radio" name="mode" value="BUY_PASS" ${postMode === "BUY_PASS" ? "checked" : ""} /> Buy or Pass — one product, a simple 👍/👎</label>
          <label class="radio-row"><input type="radio" name="mode" value="WHICH_ONE" ${postMode === "WHICH_ONE" ? "checked" : ""} /> Which One? — compare 2-4 candidate products</label>
        </fieldset>`
      : `<input type="hidden" name="mode" value="${postMode}" />`}

    <label>${postMode === "WHICH_ONE" ? "Purchasing question" : "Product title"}
      <input type="text" name="title" required maxlength="120" value="${escapeHtml(defaultTitle)}" placeholder="${postMode === "WHICH_ONE" ? "e.g. Which sleeping bag for a cold NZ hike?" : "e.g. Mac mini M4 Pro for local AI dev"}" />
    </label>

    <label>Category
      <select name="category" required id="category-select">
        <option value="" disabled ${!preselectedCategory ? "selected" : ""}>Choose a category…</option>
        ${categoryOptions(categories, preselectedCategory)}
      </select>
    </label>

    <div class="context-prompts-container" id="context-prompts-container">${contextBlocksByCategory}</div>
    <label>Anything else relevant? <span class="hint">(optional)</span>
      <textarea name="context_free_text" maxlength="500" placeholder="Anything that doesn't fit the prompts above">${escapeHtml(existingContext?.freeText ?? "")}</textarea>
    </label>

    <div class="single-product-fields"${postMode === "WHICH_ONE" ? " hidden" : ""}>
      <div class="field-group">
        <span class="field-group-label">${singleCatalog ? "Your own photos (optional — the catalog photo is used otherwise)" : "Photos (1–4)"}</span>
        <label class="file-drop file-drop-multi" data-file-drop-multi>
          <input type="file" name="images" accept="image/*" multiple capture="environment" class="file-drop-input" />
          <span class="file-drop-visual">
            <span class="file-drop-icon" aria-hidden="true">+</span>
            <span class="file-drop-text">Choose photos, or drag them here</span>
          </span>
          <span class="file-drop-preview-row"></span>
        </label>
        <span class="hint">JPEG, PNG, WebP, or GIF. Each photo is re-encoded and stripped of location/metadata.</span>
      </div>
      ${isEdit && existingImageIds.length > 0
        ? `<div class="existing-images">${existingImageIds.map((id) => `<img src="/images/${id}" alt="" class="existing-image-thumb" />`).join("")}<p class="hint">Uploading new photos replaces these.</p></div>`
        : ""}

      <div class="form-row">
        <label>${singleCatalog ? "Price you've been offered (optional)" : "Price (optional)"}
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
