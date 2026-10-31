// Vanilla browser JS, no build step. Two independent SSE consumers:
//  - post detail pages subscribe to /posts/:id/events for live opinion/count
//    updates (see initPostDetail);
//  - the admin page subscribes to /admin/events for the live log + polls
//    /admin/api/stats and /admin/api/reports (see initAdmin).
function initPostDetail() {
  const article = document.querySelector(".post-detail[data-post-id]");
  if (!article) return;
  const postId = article.dataset.postId;
  const postMode = article.dataset.postMode;
  const label = document.getElementById("live-connection-label");

  const source = new EventSource(`/posts/${postId}/events`);
  source.addEventListener("open", () => label?.setAttribute("data-connected", "true"));

  source.addEventListener("opinion-upserted", (event) => {
    const payload = JSON.parse(event.data);
    if (postMode === "WHICH_ONE") {
      upsertComparisonOpinionDom(payload.opinion);
      updateOptionCounts(payload.optionCounts);
    } else {
      upsertOpinionDom(payload.opinion);
      updateCounts(payload.counts);
    }
  });

  source.addEventListener("opinion-deleted", (event) => {
    const { opinionId, counts } = JSON.parse(event.data);
    document.querySelector(`[data-opinion-user="${opinionId}"]`)?.remove();
    if (counts) updateCounts(counts);
  });

  source.addEventListener("outcome-updated", () => {
    // Outcome rendering has author-vs-viewer branches server-side; simplest
    // correct behavior on a live outcome change is a one-time soft reload of
    // just that section's HTML would be nicer, but reloading preserves
    // scroll poorly. For now, show a banner inviting refresh — Buy/Pass
    // counts (the primary real-time requirement) already update live without
    // one.
    const banner = document.createElement("div");
    banner.className = "flash flash-success live-banner";
    banner.textContent = "The author just recorded a purchase outcome — refresh to see it.";
    article.prepend(banner);
  });

  function updateCounts(counts) {
    const buyEl = document.getElementById("count-buy");
    const passEl = document.getElementById("count-pass");
    const barEl = document.getElementById("buy-pct-bar");
    const countEl = document.getElementById("opinion-count");
    if (buyEl) buyEl.textContent = `👍 ${counts.buy} Buy`;
    if (passEl) passEl.textContent = `👎 ${counts.pass} Pass`;
    const total = counts.buy + counts.pass;
    if (barEl) barEl.style.width = `${total > 0 ? Math.round((counts.buy / total) * 100) : 50}%`;
    if (countEl) countEl.textContent = String(total);
  }

  // Comparison-mode vote counts live on each purchase-option-card
  // (".purchase-option-vote-count") rather than a single shared bar, since
  // there's no single "percent" to show across 2-4 options.
  function updateOptionCounts(optionCounts) {
    if (!optionCounts) return;
    document.querySelectorAll(".purchase-option-card[data-option-id]").forEach((card) => {
      const n = optionCounts.counts[card.dataset.optionId] ?? 0;
      const countEl = card.querySelector(".purchase-option-vote-count");
      if (countEl) {
        const wasMine = countEl.textContent.includes("your pick");
        countEl.textContent = `${n} opinion${n === 1 ? "" : "s"}${wasMine ? " · your pick" : ""}`;
      }
    });
    const noneEl = document.querySelector(".comparison-none-count");
    if (noneEl && optionCounts.noneCount > 0) {
      noneEl.textContent = `✋ ${optionCounts.noneCount} said none of these`;
    }
    const countEl = document.getElementById("opinion-count");
    if (countEl) {
      const total = Object.values(optionCounts.counts).reduce((a, b) => a + b, 0) + optionCounts.noneCount;
      countEl.textContent = String(total);
    }
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function upsertOpinionDom(opinion) {
    const list = document.getElementById("opinions-list");
    if (!list) return;
    const existing = list.querySelector(`[data-opinion-user="${opinion.userId}"]`);
    const stanceLabel = opinion.stance === "BUY" ? "👍 Buy" : "👎 Pass";
    const stanceClass = opinion.stance === "BUY" ? "stance-buy" : "stance-pass";
    const html = `
      <div class="opinion-item-head">
        <a href="/u/${encodeURIComponent(opinion.authorHandle)}" class="opinion-author">@${escapeHtml(opinion.authorHandle)}</a>
        <span class="stance-badge stance-badge-small ${stanceClass}">${stanceLabel}</span>
        <span class="opinion-time muted">just now</span>
      </div>
      <p class="opinion-comment">${escapeHtml(opinion.comment)}</p>`;

    if (existing) {
      existing.innerHTML = html;
      existing.classList.add("opinion-item-flash");
    } else {
      const emptyMsg = list.querySelector("p.muted");
      emptyMsg?.remove();
      const div = document.createElement("div");
      div.className = "opinion-item opinion-item-flash";
      div.dataset.opinionUser = opinion.userId;
      list.prepend(div);
      div.innerHTML = html;
    }
  }

  // Comparison-mode equivalent of upsertOpinionDom: badge shows the picked
  // option name (or "None of these") instead of a Buy/Pass stance. Live
  // updates never know the influential-marker state of a brand new row, so
  // a freshly-arrived opinion simply never shows the ⭐ badge until reload —
  // consistent with outcome-updated's own "refresh for the full picture"
  // compromise above.
  function upsertComparisonOpinionDom(opinion) {
    const list = document.getElementById("opinions-list");
    if (!list) return;
    const existing = list.querySelector(`[data-opinion-user="${opinion.userId}"]`);
    // The broadcast payload carries only the option id, not its name — the
    // name is looked up from the comparison card already on the page rather
    // than re-sent over SSE, since every viewer of this page already has
    // the full option list rendered.
    const optionName = opinion.selectedOptionId
      ? document.querySelector(`.purchase-option-card[data-option-id="${opinion.selectedOptionId}"] .purchase-option-name`)?.textContent
      : null;
    const badge = opinion.selectedNone
      ? `<span class="stance-badge stance-none stance-badge-small">✋ None of these</span>`
      : `<span class="stance-badge stance-selected stance-badge-small">✅ ${escapeHtml(optionName ?? "an option")}</span>`;
    const html = `
      <div class="opinion-item-head">
        <a href="/u/${encodeURIComponent(opinion.authorHandle)}" class="opinion-author">@${escapeHtml(opinion.authorHandle)}</a>
        ${badge}
        <span class="opinion-time muted">just now</span>
      </div>
      <p class="opinion-comment">${escapeHtml(opinion.comment)}</p>`;

    if (existing) {
      existing.innerHTML = html;
      existing.classList.add("opinion-item-flash");
    } else {
      const emptyMsg = list.querySelector("p.muted");
      emptyMsg?.remove();
      const div = document.createElement("div");
      div.className = "opinion-item opinion-item-flash";
      div.dataset.opinionUser = opinion.userId;
      list.prepend(div);
      div.innerHTML = html;
    }
  }

  // Keep stance-toggle / option-select label styling in sync with the
  // checked radio — same pattern for both the Buy/Pass toggle and the
  // comparison-mode option-select row.
  document.querySelectorAll(".stance-option input[type=radio]").forEach((input) => {
    input.addEventListener("change", () => {
      document.querySelectorAll(".stance-option").forEach((el) => el.classList.remove("selected"));
      input.closest(".stance-option")?.classList.add("selected");
    });
  });
  document.querySelectorAll(".option-select input[type=radio]").forEach((input) => {
    input.addEventListener("change", () => {
      document.querySelectorAll(".option-select").forEach((el) => el.classList.remove("selected"));
      input.closest(".option-select")?.classList.add("selected");
    });
  });
}

function initAdmin() {
  const logEl = document.getElementById("admin-log");
  if (!logEl) return;

  const source = new EventSource("/admin/events");
  const connLabel = document.getElementById("stat-connection-label");
  const connDot = document.getElementById("stat-connection");
  source.addEventListener("open", () => {
    if (connLabel) connLabel.textContent = "live";
    if (connDot) connDot.classList.add("connected");
  });
  source.onerror = () => {
    if (connLabel) connLabel.textContent = "reconnecting…";
    if (connDot) connDot.classList.remove("connected");
  };

  source.addEventListener("activity", (event) => {
    const e = JSON.parse(event.data);
    appendLogLine(e);
  });

  function appendLogLine(e) {
    const row = document.createElement("div");
    row.className = `admin-log-row ${e.status === "failure" ? "log-failure" : "log-success"}`;
    const user = e.userId ? e.userId.slice(0, 8) : "anon";
    const target = e.targetType ? `${e.targetType}:${(e.targetId ?? "").slice(0, 8)}` : "–";
    row.innerHTML = `<span class="log-ts">${new Date(e.ts).toLocaleTimeString()}</span><span class="log-req">${e.requestId.slice(0, 8)}</span><span class="log-user">${user}</span><span class="log-action">${e.action}</span><span class="log-target">${target}</span><span class="log-status">${e.status}</span>${e.latencyMs != null ? `<span class="log-latency">${e.latencyMs}ms</span>` : "<span></span>"}`;
    logEl.prepend(row);
    while (logEl.children.length > 200) logEl.removeChild(logEl.lastChild);
  }

  async function refreshStats() {
    try {
      const res = await fetch("/admin/api/stats");
      if (!res.ok) return;
      const stats = await res.json();
      document.getElementById("stat-active-users").textContent = String(stats.activeUsers);
      document.getElementById("stat-total-events").textContent = String(stats.totalEvents);
      document.getElementById("stat-failed-events").textContent = String(stats.failedEvents);
    } catch {
      // transient network error; next interval will retry
    }
  }
  refreshStats();
  setInterval(refreshStats, 5000);

  const adminCsrf = document.getElementById("admin-root")?.dataset.csrf ?? "";

  async function refreshReports() {
    try {
      const res = await fetch("/admin/api/reports");
      if (!res.ok) return;
      const { reports } = await res.json();
      const container = document.getElementById("admin-reports");
      if (!container) return;
      container.innerHTML = reports.length
        ? reports
            .map(
              (r) =>
                `<div class="admin-report-row">
                  <span>${r.targetType}:${r.targetId.slice(0, 8)}</span>
                  <span class="muted">${escapeHtmlAdmin(r.reason)}</span>
                  <span class="muted">${new Date(r.createdAt).toLocaleString()}</span>
                  <span class="admin-report-actions">
                    <button type="button" class="btn btn-ghost btn-small" data-resolve-report="${r.id}">Resolve</button>
                    <button type="button" class="btn btn-ghost btn-small" data-dismiss-report="${r.id}">Dismiss</button>
                  </span>
                </div>`,
            )
            .join("")
        : `<p class="muted">No open reports.</p>`;

      container.querySelectorAll("[data-resolve-report]").forEach((btn) => {
        btn.addEventListener("click", () => resolveReport(btn.dataset.resolveReport, "resolved"));
      });
      container.querySelectorAll("[data-dismiss-report]").forEach((btn) => {
        btn.addEventListener("click", () => resolveReport(btn.dataset.dismissReport, "dismissed"));
      });
    } catch {
      // transient network error; next interval will retry
    }
  }

  async function resolveReport(id, resolution) {
    try {
      await fetch(`/admin/api/reports/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrf: adminCsrf, resolution }),
      });
      refreshReports();
    } catch {
      // transient network error; the report stays in the open list
    }
  }

  function escapeHtmlAdmin(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  refreshReports();
  setInterval(refreshReports, 15000);
}

function initGallery() {
  const gallery = document.querySelector("[data-gallery]");
  if (!gallery) return;
  const main = document.getElementById("gallery-main-img");
  gallery.querySelectorAll(".gallery-thumb").forEach((btn) => {
    btn.addEventListener("click", () => {
      gallery.querySelectorAll(".gallery-thumb").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (main) main.src = `/images/${btn.dataset.imageId}`;
    });
  });
}

function initCurrencyUppercase() {
  document.querySelectorAll('input[name="currency"]').forEach((input) => {
    input.addEventListener("input", () => {
      input.value = input.value.toUpperCase();
    });
  });
}

/**
 * Image upload drop targets: each `.file-drop` is a real <label> wrapping a
 * real <input type=file> (see src/pages.ts), so clicking, dragging a file
 * onto it, and plain keyboard Tab+Enter/Space all already work with zero JS
 * — this only adds two enhancements neither keyboard nor click needs: a
 * live thumbnail preview via FileReader (no upload round-trip, the file
 * never leaves the browser until actual form submit) and a hover state
 * while a file is dragged over it. A drop target rendered inside an
 * "+ Add option" clone is wired up by renumberOptionBlocks calling this
 * same function again on the new node, same pattern as attachRemoveHandler.
 */
function initFileDrop(root = document) {
  root.querySelectorAll("[data-file-drop]").forEach((drop) => {
    if (drop.dataset.fileDropWired) return;
    drop.dataset.fileDropWired = "true";
    const input = drop.querySelector(".file-drop-input");
    const visual = drop.querySelector(".file-drop-visual");
    const preview = drop.querySelector(".file-drop-preview");
    if (!input || !preview) return;

    function showPreview(file) {
      const reader = new FileReader();
      reader.onload = () => {
        preview.src = String(reader.result);
        preview.hidden = false;
        if (visual) visual.hidden = true;
      };
      reader.readAsDataURL(file);
    }

    input.addEventListener("change", () => {
      if (input.files && input.files[0]) showPreview(input.files[0]);
    });
    ["dragenter", "dragover"].forEach((evt) =>
      drop.addEventListener(evt, (e) => {
        e.preventDefault();
        drop.classList.add("file-drop-dragging");
      }),
    );
    ["dragleave", "drop"].forEach((evt) =>
      drop.addEventListener(evt, () => drop.classList.remove("file-drop-dragging")),
    );
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        input.files = e.dataTransfer.files;
        showPreview(file);
      }
    });
  });

  root.querySelectorAll("[data-file-drop-multi]").forEach((drop) => {
    if (drop.dataset.fileDropWired) return;
    drop.dataset.fileDropWired = "true";
    const input = drop.querySelector(".file-drop-input");
    const row = drop.querySelector(".file-drop-preview-row");
    if (!input || !row) return;

    function showPreviews(files) {
      row.innerHTML = "";
      Array.from(files)
        .slice(0, 4)
        .forEach((file) => {
          const reader = new FileReader();
          reader.onload = () => {
            const img = document.createElement("img");
            img.src = String(reader.result);
            img.alt = "";
            row.appendChild(img);
          };
          reader.readAsDataURL(file);
        });
    }

    input.addEventListener("change", () => {
      if (input.files && input.files.length > 0) showPreviews(input.files);
    });
    ["dragenter", "dragover"].forEach((evt) =>
      drop.addEventListener(evt, (e) => {
        e.preventDefault();
        drop.classList.add("file-drop-dragging");
      }),
    );
    ["dragleave", "drop"].forEach((evt) =>
      drop.addEventListener(evt, () => drop.classList.remove("file-drop-dragging")),
    );
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        input.files = files;
        showPreviews(files);
      }
    });
  });
}

/**
 * Create/edit post form behavior: all of this is pure client-side display
 * logic over HTML the server already fully rendered (every context-prompt
 * block for every category, every initial option block) — nothing here
 * decides what's valid, that's still re-checked server-side on submit.
 *  - Mode radio (Buy or Pass / Which One?) toggles which of
 *    .single-product-fields / .comparison-fields is visible, and keeps the
 *    form's own data-post-mode in sync so a submit always carries the
 *    currently-visible shape.
 *  - The category <select> shows only the matching .context-prompt-block
 *    (all others stay hidden, and their inputs are left blank so an
 *    invisible category's stale answer is never submitted).
 *  - "+ Add another option" clones the form's existing last option block as
 *    a blank template, up to 4 total; "Remove this option" removes one,
 *    down to a minimum of 2; both re-run the legend/name renumbering so
 *    parseOptionInputsFromFields on the server sees a clean 0..N-1 sequence.
 */
function initPostForm() {
  const form = document.querySelector(".post-form[data-post-mode]");
  if (!form) return;

  const modeRadios = document.querySelectorAll('input[name="mode"][type="radio"]');
  const singleFields = form.querySelector(".single-product-fields");
  const comparisonFields = form.querySelector(".comparison-fields");

  function applyMode(mode) {
    form.dataset.postMode = mode;
    if (singleFields) singleFields.hidden = mode === "WHICH_ONE";
    if (comparisonFields) comparisonFields.hidden = mode !== "WHICH_ONE";
  }
  modeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) applyMode(radio.value);
    });
  });

  const categorySelect = document.getElementById("category-select");
  const contextContainer = document.getElementById("context-prompts-container");
  function applyCategory(categoryId) {
    if (!contextContainer) return;
    contextContainer.querySelectorAll(".context-prompt-block").forEach((block) => {
      const isMatch = block.dataset.categoryId === categoryId;
      block.hidden = !isMatch;
      if (!isMatch) block.querySelectorAll("input, textarea").forEach((el) => (el.value = ""));
    });
  }
  if (categorySelect) {
    categorySelect.addEventListener("change", () => applyCategory(categorySelect.value));
    if (categorySelect.value) applyCategory(categorySelect.value);
  }

  const optionBlocksContainer = document.getElementById("option-form-blocks");
  const addOptionBtn = document.getElementById("add-option-btn");
  const MAX_OPTIONS = 4;
  const MIN_OPTIONS = 2;

  function renumberOptionBlocks() {
    if (!optionBlocksContainer) return;
    const blocks = optionBlocksContainer.querySelectorAll(".option-form-block");
    blocks.forEach((block, index) => {
      block.dataset.optionIndex = String(index);
      const legend = block.querySelector("legend");
      if (legend) legend.textContent = `Option ${index + 1}`;
      block.querySelectorAll("[name]").forEach((el) => {
        el.name = el.name.replace(/_\d+$/, `_${index}`);
      });
    });
    if (addOptionBtn) addOptionBtn.hidden = blocks.length >= MAX_OPTIONS;
  }

  function attachRemoveHandler(block) {
    const removeBtn = block.querySelector(".remove-option-btn");
    removeBtn?.addEventListener("click", () => {
      if (!optionBlocksContainer) return;
      if (optionBlocksContainer.querySelectorAll(".option-form-block").length <= MIN_OPTIONS) return;
      block.remove();
      renumberOptionBlocks();
    });
  }

  if (optionBlocksContainer) {
    optionBlocksContainer.querySelectorAll(".option-form-block").forEach(attachRemoveHandler);
  }

  addOptionBtn?.addEventListener("click", () => {
    if (!optionBlocksContainer) return;
    const blocks = optionBlocksContainer.querySelectorAll(".option-form-block");
    if (blocks.length >= MAX_OPTIONS) return;
    const template = blocks[blocks.length - 1];
    const clone = template.cloneNode(true);
    clone.querySelectorAll("input").forEach((input) => {
      if (input.type === "file") return;
      // Blanking every field to "" also blanked currency, which the server
      // only defaults to AUD when the field is *missing* entirely, not when
      // it's present-but-empty — found via an actual 3-option submission
      // test, which failed validation with "currency must be a 3-letter
      // code" because the cloned option's currency input carried an empty
      // string into the request instead of either "AUD" or nothing at all.
      input.value = input.name.startsWith("option_currency_") ? "AUD" : "";
    });
    clone.querySelectorAll(".existing-image-thumb").forEach((img) => img.remove());
    // cloneNode copies attributes (including the wired-marker and any
    // preview <img> src left over from the template block) but not JS
    // listeners, so both the preview state and the wired-marker need a
    // manual reset before initFileDrop runs on the clone.
    clone.querySelectorAll("[data-file-drop]").forEach((drop) => {
      delete drop.dataset.fileDropWired;
      const visual = drop.querySelector(".file-drop-visual");
      const preview = drop.querySelector(".file-drop-preview");
      if (visual) visual.hidden = false;
      if (preview) {
        preview.hidden = true;
        preview.removeAttribute("src");
      }
    });
    clone.querySelectorAll(".option-more-details").forEach((details) => (details.open = false));
    optionBlocksContainer.appendChild(clone);
    attachRemoveHandler(clone);
    initFileDrop(clone);
    renumberOptionBlocks();
  });
}

/**
 * Mobile hamburger menu: a real <button> (keyboard/Enter/Space work for
 * free) toggling aria-expanded and the panel's `hidden` attribute together,
 * so assistive tech and CSS agree on open/closed state from one source of
 * truth rather than a separate class. Closes on Escape and on resizing back
 * past the desktop breakpoint, so a panel left open on mobile doesn't carry
 * into a resized/rotated desktop view where the inline nav is visible again.
 */
function initMobileNav() {
  const toggle = document.querySelector(".nav-toggle");
  const panel = document.getElementById("mobile-nav-panel");
  if (!toggle || !panel) return;

  function setOpen(open) {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    panel.hidden = !open;
  }

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus();
    }
  });

  const desktopQuery = window.matchMedia("(min-width: 641px)");
  desktopQuery.addEventListener("change", (event) => {
    if (event.matches) setOpen(false);
  });
}

// Compare tray: select 2-4 catalog products across product pages, then
// start a Which One? question. Selection is a per-tab convenience only
// (sessionStorage, wrapped so a blocked storage just disables it); the
// server re-validates every id when the comparison form is opened.
function initCompareTray() {
  const toggles = document.querySelectorAll("[data-compare-toggle]");
  if (toggles.length === 0) return;
  const KEY = "bop-compare";
  const MAX = 4;
  const read = () => {
    try {
      const v = JSON.parse(sessionStorage.getItem(KEY) || "[]");
      return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string").slice(0, MAX) : [];
    } catch {
      return [];
    }
  };
  const write = (items) => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable — selection just won't persist */
    }
  };

  const tray = document.createElement("div");
  tray.className = "compare-tray";
  tray.setAttribute("role", "region");
  tray.setAttribute("aria-label", "Products selected for comparison");
  tray.hidden = true;
  tray.innerHTML = '<span class="compare-tray-text"></span><button type="button" class="btn btn-ghost btn-small" data-compare-clear>Clear</button><a class="btn btn-brand btn-small" data-compare-go>Compare</a>';
  document.body.appendChild(tray);
  const text = tray.querySelector(".compare-tray-text");
  const go = tray.querySelector("[data-compare-go]");

  const render = () => {
    const items = read();
    toggles.forEach((btn) => {
      const on = items.some((i) => i.id === btn.dataset.productId);
      btn.classList.toggle("is-selected", on);
      btn.textContent = on ? "✓ In comparison" : "+ Add to comparison";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    tray.hidden = items.length === 0;
    text.textContent = items.length === 1
      ? `1 selected — add at least one more product to compare`
      : `${items.length} selected: ${items.map((i) => i.name).join(", ")}`;
    go.href = `/posts/new?compare=${items.map((i) => encodeURIComponent(i.id)).join(",")}`;
    go.toggleAttribute("aria-disabled", items.length < 2);
    go.style.pointerEvents = items.length < 2 ? "none" : "";
    go.style.opacity = items.length < 2 ? "0.5" : "";
  };

  toggles.forEach((btn) =>
    btn.addEventListener("click", () => {
      let items = read();
      const id = btn.dataset.productId;
      if (items.some((i) => i.id === id)) items = items.filter((i) => i.id !== id);
      else if (items.length < MAX) items.push({ id, name: btn.dataset.productName || id });
      write(items);
      render();
    }),
  );
  tray.querySelector("[data-compare-clear]").addEventListener("click", () => {
    write([]);
    render();
  });
  render();
}

initPostDetail();
initCompareTray();
initAdmin();
initGallery();
initCurrencyUppercase();
initMobileNav();
initPostForm();
initFileDrop();
