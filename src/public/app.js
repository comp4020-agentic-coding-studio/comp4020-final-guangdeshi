// Vanilla browser JS, no build step. Two independent SSE consumers:
//  - post detail pages subscribe to /posts/:id/events for live opinion/count
//    updates (see initPostDetail);
//  - the admin page subscribes to /admin/events for the live log + polls
//    /admin/api/stats and /admin/api/reports (see initAdmin).
function initPostDetail() {
  const article = document.querySelector(".post-detail[data-post-id]");
  if (!article) return;
  const postId = article.dataset.postId;
  const label = document.getElementById("live-connection-label");

  const source = new EventSource(`/posts/${postId}/events`);
  source.addEventListener("open", () => label?.setAttribute("data-connected", "true"));

  source.addEventListener("opinion-upserted", (event) => {
    const { opinion, counts } = JSON.parse(event.data);
    upsertOpinionDom(opinion);
    updateCounts(counts);
  });

  source.addEventListener("opinion-deleted", (event) => {
    const { opinionId, counts } = JSON.parse(event.data);
    document.querySelector(`[data-opinion-id="${opinionId}"]`)?.remove();
    updateCounts(counts);
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
      div.innerHTML = html;
      list.prepend(div);
    }
  }

  // Keep stance-toggle label styling in sync with the checked radio.
  document.querySelectorAll(".stance-option input[type=radio]").forEach((input) => {
    input.addEventListener("change", () => {
      document.querySelectorAll(".stance-option").forEach((el) => el.classList.remove("selected"));
      input.closest(".stance-option")?.classList.add("selected");
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

initPostDetail();
initAdmin();
initGallery();
initCurrencyUppercase();
