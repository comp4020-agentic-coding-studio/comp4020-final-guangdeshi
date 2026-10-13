import type { CaseDef, CaseSummary } from "./cases/types.ts";
import { pageShell } from "./ui.ts";

// The three built-in cases the brief asks for. Only "checkout-failure" is
// implemented for Crit 9 (P0: one complete case beats three unfinished
// ones); the other two are listed so the product's shape is visible, but
// are not clickable.
export const PLANNED_CASES: CaseSummary[] = [
  { id: "checkout-failure", title: "Checkout Failure", tagline: "A valid order is sometimes rejected under a specific combination of conditions." },
  { id: "responsive-layout", title: "Responsive Layout Bug", tagline: "At one viewport width, an important action becomes unusable. Other widths work." },
  { id: "async-state", title: "Async State Bug", tagline: "Out-of-order async responses leave the UI showing a stale result." },
];

const LIVE_CASE_IDS = new Set(["checkout-failure"]);

export function landingPage(): string {
  const cards = PLANNED_CASES.map((c) => {
    const live = LIVE_CASE_IDS.has(c.id);
    return live
      ? `<a class="card case-card enter" href="/cases/${c.id}"><span class="badge badge-pass" style="margin-bottom:8px;">live case</span><h3>${c.title}</h3><p>${c.tagline}</p></a>`
      : `<div class="card case-card" aria-disabled="true"><span class="badge badge-dim" style="margin-bottom:8px;">coming soon</span><h3>${c.title}</h3><p>${c.tagline}</p></div>`;
  }).join("\n");

  const body = `
<header class="hero">
  <h1>Bug Relay</h1>
  <p class="tagline">Find the condition. Fix the mystery. Together.</p>
  <p class="lede">
    A web app misbehaves under some combination of conditions. One person can't
    reproduce what another person saw. Bug Relay turns that into a shared,
    structured investigation: you and your collaborators run controlled
    experiments against a real small fixture, every result is recorded and
    broadcast live, and the system recommends which untested condition would
    rule out the most remaining explanations &mdash; so the next test is always
    clearer than the last one.
  </p>
  <div class="cta-row">
    <a class="btn btn-primary" href="/cases/checkout-failure">Start investigating</a>
    <a class="btn btn-ghost" href="/cases/checkout-failure">Join a session</a>
  </div>
  <p class="lede" style="font-size:0.85rem;">
    There is one live case right now &mdash; Checkout Failure. Opening it either
    starts the shared investigation or joins whatever evidence others have
    already collected; the room's URL is the same either way.
  </p>
</header>
<div class="wrap">
  <section class="section">
    <h2>Three controlled cases</h2>
    <div class="case-grid">
      ${cards}
    </div>
  </section>
  <section class="section card">
    <h2 style="margin-top:0;">How collaborative debugging works here</h2>
    <p style="color:var(--text-dim);">
      Each case is a small, deterministic fixture with a real (but hidden)
      cause. You pick a combination of test conditions, run it in the
      embedded playground, and the app automatically records what happened
      &mdash; not an arbitrary pass/fail you type in yourself. Every
      participant watching the same case sees new evidence appear within
      about a second, with no reload, and the recommended next test updates
      as the evidence narrows down which explanations are still possible.
      Bug Relay never claims a definitive cause from insufficient evidence:
      the "reveal" for a case only becomes available once the evidence
      actually narrows to a single remaining explanation.
    </p>
  </section>
</div>
<footer class="app">Bug Relay &mdash; a COMP4020/COMP8020 Final Project. <a href="/readme/">Read more</a>.</footer>`;
  return pageShell({ title: "Bug Relay — find the condition, fix the mystery, together", body });
}

export function caseNotFoundPage(caseId: string): string {
  const body = `
<div class="wrap">
  <h1>No such case: ${caseId}</h1>
  <p><a class="btn btn-primary" href="/">Back to all cases</a></p>
</div>`;
  return pageShell({ title: "Case not found — Bug Relay", body });
}

export interface RoomBootstrap {
  participant: { id: string; displayName: string | null };
  caseDef: {
    id: string;
    title: string;
    tagline: string;
    reproductionGoal: string;
    variables: { key: string; label: string; options: { value: string; label: string }[] }[];
    hypotheses: { id: string; label: string }[];
  };
  state: RoomStateBootstrap;
}

export interface RoomStateBootstrap {
  experiments: {
    id: number;
    participantId: string;
    participantName: string;
    params: Record<string, string>;
    expectedResult: string;
    actualResult: string;
    passed: boolean;
    note: string | null;
    createdAt: string;
  }[];
  recommendation: {
    status: "insufficient" | "narrowing" | "identified";
    consistentHypothesisIds: string[];
    testedCount: number;
    totalCombos: number;
    next: { params: Record<string, string>; comboKey: string; expectedInfoGainBits: number } | null;
    explanation: string;
  };
  presence: number;
}

export function roomPage(bootstrap: RoomBootstrap): string {
  const { caseDef } = bootstrap;
  const body = `
<div class="wrap">
  <div class="room-header">
    <div>
      <h1 style="margin-bottom:4px;">${caseDef.title}</h1>
      <p style="color:var(--text-dim); margin:0;">${caseDef.reproductionGoal}</p>
    </div>
    <div class="presence mono" id="presence"><span class="dot" aria-hidden="true"></span><span id="presence-count">connecting&hellip;</span></div>
  </div>

  <section class="section card" aria-label="Your identity in this room">
    <div id="name-section"></div>
  </section>

  <section class="section card">
    <h2 style="margin-top:0;">Test playground</h2>
    <form id="playground-form">
      <div class="playground-grid" id="playground-fields"></div>
      <label for="note">Note (optional)</label>
      <textarea id="note" name="note" placeholder="Anything you noticed about this run"></textarea>
      <p style="margin-top:12px;">
        <button class="btn btn-primary" type="submit" id="run-btn">Run experiment</button>
      </p>
    </form>
    <div id="result-readout" class="result-readout" hidden></div>
  </section>

  <section class="section card">
    <h2 style="margin-top:0;">Next-test recommendation</h2>
    <div id="recommend-container"></div>
  </section>

  <section class="section card">
    <h2 style="margin-top:0;">Candidate explanations</h2>
    <ul class="hyp-list" id="hyp-list"></ul>
    <div id="reveal-container" style="margin-top:14px;"></div>
  </section>

  <section class="section card">
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
      <h2 style="margin-top:0;">Shared evidence board</h2>
      <button class="btn btn-ghost" id="reset-btn" type="button">Reset this investigation</button>
    </div>
    <div id="evidence-container"></div>
  </section>
</div>
<footer class="app"><a href="/">&larr; All cases</a></footer>
<script type="application/json" id="bootstrap">${JSON.stringify(bootstrap)}</script>
<script>${ROOM_CLIENT_SCRIPT}</script>`;
  return pageShell({ title: `${caseDef.title} — Bug Relay`, body });
}

// Vanilla JS, no bundler/framework — consistent with this repo's existing
// stack decision. Owns rendering of every dynamic section from a single
// state object, re-rendered wholesale on each SSE "state" event: at this
// fixture's scale (a handful of experiments, 8 combinations) a full
// re-render is simple, correct, and cheap, and it means there is exactly
// one place (here) that turns evidence into DOM, instead of a server
// renderer and a client patcher that could drift apart.
const ROOM_CLIENT_SCRIPT = `
(function () {
  var bootstrap = JSON.parse(document.getElementById('bootstrap').textContent);
  var caseId = bootstrap.caseDef.id;
  var me = bootstrap.participant;
  var caseDef = bootstrap.caseDef;
  var lastExperimentId = null;

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtParams(params) {
    return caseDef.variables.map(function (v) { return v.label + '=' + params[v.key]; }).join(', ');
  }
  function fmtTime(iso) {
    try { return new Date(iso).toLocaleTimeString(); } catch (e) { return iso; }
  }

  // --- name section ---
  function renderName() {
    var container = document.getElementById('name-section');
    if (me.displayName) {
      container.innerHTML =
        '<p style="margin:0;">Investigating as <strong>' + escapeHtml(me.displayName) + '</strong> &middot; ' +
        '<button class="btn btn-ghost" id="edit-name-btn" type="button" style="padding:4px 10px;">change name</button></p>';
      document.getElementById('edit-name-btn').addEventListener('click', function () {
        me.displayName = null;
        renderName();
      });
    } else {
      container.innerHTML =
        '<form id="name-form" class="name-form">' +
        '<label for="display-name" style="margin:0;">Display name</label>' +
        '<input type="text" id="display-name" name="displayName" maxlength="40" required placeholder="e.g. Alice" autocomplete="off" />' +
        '<button class="btn btn-primary" type="submit">Join as this name</button>' +
        '</form><p style="color:var(--text-dim); font-size:0.85rem; margin:8px 0 0;">You can look around without a name, but running an experiment records who ran it.</p>';
      document.getElementById('name-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var name = document.getElementById('display-name').value.trim();
        if (!name) return;
        fetch('/api/me', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: name }),
        }).then(function (r) { return r.json(); }).then(function (data) {
          me.displayName = data.displayName;
          renderName();
        });
      });
    }
    updateRunButton();
  }

  // --- playground fields ---
  function renderPlaygroundFields() {
    var container = document.getElementById('playground-fields');
    container.innerHTML = caseDef.variables.map(function (v) {
      var options = v.options.map(function (o) { return '<option value="' + o.value + '">' + o.label + '</option>'; }).join('');
      return '<div><label for="field-' + v.key + '">' + v.label + '</label>' +
        '<select id="field-' + v.key + '" name="' + v.key + '">' + options + '</select></div>';
    }).join('');
  }

  function updateRunButton() {
    var btn = document.getElementById('run-btn');
    btn.disabled = !me.displayName;
    btn.title = me.displayName ? '' : 'Set a display name above first';
  }

  document.getElementById('playground-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!me.displayName) return;
    var params = {};
    caseDef.variables.forEach(function (v) {
      params[v.key] = document.getElementById('field-' + v.key).value;
    });
    var note = document.getElementById('note').value.trim();
    var btn = document.getElementById('run-btn');
    btn.disabled = true;
    fetch('/api/cases/' + caseId + '/experiments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: params, note: note || null }),
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'request failed'); });
      return r.json();
    }).then(function (data) {
      renderResult(data.experiment);
      applyState(data.state);
      document.getElementById('note').value = '';
    }).catch(function (err) {
      renderResult(null, err.message);
    }).finally(function () {
      updateRunButton();
    });
  });

  function renderResult(experiment, errorMessage) {
    var box = document.getElementById('result-readout');
    box.hidden = false;
    if (errorMessage) {
      box.innerHTML = '<span class="badge badge-fail">error</span> ' + escapeHtml(errorMessage);
      return;
    }
    var badge = experiment.passed
      ? '<span class="badge badge-pass">passed</span>'
      : '<span class="badge badge-fail">failed</span>';
    box.innerHTML = badge + ' expected: ' + experiment.expectedResult + ' &middot; actual: ' + experiment.actualResult;
  }

  document.getElementById('reset-btn').addEventListener('click', function () {
    if (!confirm('Clear all evidence collected for this case? This affects everyone in the room.')) return;
    fetch('/api/cases/' + caseId + '/reset', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (data) { applyState(data.state); });
  });

  // --- evidence board ---
  function renderEvidence(state) {
    var container = document.getElementById('evidence-container');
    if (state.experiments.length === 0) {
      container.innerHTML = '<p class="evidence-empty">No experiments yet. Run one above to start the investigation.</p>';
      return;
    }
    var comboCounts = {};
    state.experiments.forEach(function (e) {
      var key = JSON.stringify(e.params);
      comboCounts[key] = (comboCounts[key] || 0) + 1;
    });
    var seen = {};
    var rows = state.experiments.slice().reverse().map(function (e) {
      var key = JSON.stringify(e.params);
      seen[key] = (seen[key] || 0) + 1;
      var isRepeat = comboCounts[key] > 1;
      var repeatTag = isRepeat ? ' <span class="repeat-tag">(repeat ' + seen[key] + '/' + comboCounts[key] + ')</span>' : '';
      var youTag = e.participantId === me.id ? ' <span class="badge badge-dim">you</span>' : '';
      var badge = e.passed ? '<span class="badge badge-pass">pass</span>' : '<span class="badge badge-fail">fail</span>';
      var isNew = e.id === lastExperimentId;
      return '<tr class="' + (isNew ? 'enter pulse' : '') + '">' +
        '<td class="mono">' + fmtTime(e.createdAt) + '</td>' +
        '<td>' + escapeHtml(e.participantName) + youTag + '</td>' +
        '<td class="mono">' + escapeHtml(fmtParams(e.params)) + repeatTag + '</td>' +
        '<td>' + badge + '</td>' +
        '<td>' + (e.note ? escapeHtml(e.note) : '<span style="color:var(--text-dim);">&mdash;</span>') + '</td>' +
        '</tr>';
    }).join('');
    container.innerHTML =
      '<table class="evidence"><thead><tr><th>Time</th><th>Participant</th><th>Conditions</th><th>Result</th><th>Note</th></tr></thead><tbody>' +
      rows + '</tbody></table>' +
      '<p style="color:var(--text-dim); font-size:0.82rem; margin-top:10px;">' + state.recommendation.testedCount + ' of ' + state.recommendation.totalCombos + ' combinations tested at least once.</p>';
  }

  // --- hypotheses ---
  function renderHypotheses(state) {
    var container = document.getElementById('hyp-list');
    var consistent = state.recommendation.consistentHypothesisIds;
    container.innerHTML = caseDef.hypotheses.map(function (h) {
      var isConsistent = consistent.indexOf(h.id) !== -1;
      var badge = isConsistent
        ? (consistent.length === 1 ? '<span class="badge badge-pass">only remaining</span>' : '<span class="badge badge-amber">possible</span>')
        : '<span class="badge badge-dim">ruled out</span>';
      return '<li class="' + (isConsistent ? '' : 'ruled-out') + '"><span>' + escapeHtml(h.label) + '</span>' + badge + '</li>';
    }).join('');

    var revealContainer = document.getElementById('reveal-container');
    var identified = state.recommendation.status === 'identified' && consistent.length === 1;
    if (identified) {
      revealContainer.innerHTML = '<button class="btn btn-primary" id="reveal-btn" type="button">Reveal known cause</button><div id="reveal-box"></div>';
      document.getElementById('reveal-btn').addEventListener('click', function () {
        fetch('/api/cases/' + caseId + '/reveal').then(function (r) { return r.json(); }).then(function (data) {
          document.getElementById('reveal-box').innerHTML =
            '<div class="reveal-box enter"><strong>Known cause:</strong> ' + escapeHtml(data.explanation) + '</div>';
        });
      });
    } else {
      revealContainer.innerHTML = '<p style="color:var(--text-dim); font-size:0.85rem;">The known cause becomes revealable once the evidence narrows to exactly one remaining explanation.</p>';
    }
  }

  // --- recommendation ---
  function renderRecommendation(state) {
    var container = document.getElementById('recommend-container');
    var r = state.recommendation;
    var cls = r.status === 'identified' ? 'identified' : '';
    var comboHtml = r.next ? '<p class="combo" style="margin:8px 0 0;">Try: ' + escapeHtml(fmtParams(r.next.params)) + '</p>' : '';
    container.innerHTML = '<div class="recommend-box ' + cls + '"><p style="margin:0;">' + escapeHtml(r.explanation) + '</p>' + comboHtml + '</div>';
  }

  function renderPresence(count) {
    document.getElementById('presence-count').textContent = count + (count === 1 ? ' investigator connected' : ' investigators connected');
  }

  function applyState(state) {
    if (state.experiments.length > 0) {
      lastExperimentId = state.experiments[state.experiments.length - 1].id;
    }
    renderEvidence(state);
    renderHypotheses(state);
    renderRecommendation(state);
    renderPresence(state.presence);
  }

  renderName();
  renderPlaygroundFields();
  applyState(bootstrap.state);

  var source = new EventSource('/api/cases/' + caseId + '/events');
  source.addEventListener('state', function (e) { applyState(JSON.parse(e.data)); });
  source.addEventListener('presence', function (e) { renderPresence(JSON.parse(e.data).count); });
  source.onerror = function () {
    // EventSource retries on its own; re-fetch authoritative state once the
    // connection drops so a flaky network doesn't leave stale evidence
    // showing until the retry succeeds.
    fetch('/api/cases/' + caseId + '/state').then(function (r) { return r.json(); }).then(applyState).catch(function () {});
  };
})();
`;
