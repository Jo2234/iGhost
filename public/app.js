const app = document.querySelector("#app");

const state = {
  screenshots: [],
  selectedStep: 0,
  selectedGhostId: "",
};

const ghostProfiles = [
  {
    id: "mara",
    name: "Mara",
    label: "Impatient",
    color: "#ff7a59",
    profile: "Scans fast, hates vague CTAs, leaves when value is not obvious.",
  },
  {
    id: "nico",
    name: "Nico",
    label: "Unsure",
    color: "#8b5cf6",
    profile: "Needs plain language, examples, and reassurance before committing.",
  },
  {
    id: "ada",
    name: "Ada",
    label: "Skeptical",
    color: "#45d6c5",
    profile: "Looks for proof, privacy signals, and technical credibility.",
  },
];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function route(path) {
  history.pushState({}, "", path);
  render();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function shell(content) {
  app.innerHTML = `
    <main>
      <nav class="nav">
        <button class="brand" data-route="/">
          <span class="brand-mark"></span>
          <span>iGhost</span>
        </button>
        <button class="button primary" data-route="/new">Run a ghost test</button>
      </nav>
      ${content}
    </main>
  `;
  app.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => route(button.dataset.route));
  });
}

function landing() {
  shell(`
    <section class="landing">
      <div class="landing-copy">
        <p class="eyebrow">AI usability lab</p>
        <h1>Watch synthetic users struggle before real users do.</h1>
        <p class="lead">iGhost reviews a website or product flow through task-driven ghost users, narrates what they notice, and turns confusion into fixes.</p>
        <button class="button primary large" data-route="/new">Run a ghost test</button>
      </div>
      <div class="steps">
        <div><span>01</span><strong>Add the flow</strong><p>Upload screenshots or paste a website URL.</p></div>
        <div><span>02</span><strong>Set the task</strong><p>Tell the ghosts exactly what the user should understand or complete.</p></div>
        <div><span>03</span><strong>Pick ghosts</strong><p>Choose up to three viewpoints with distinct patience and trust patterns.</p></div>
        <div><span>04</span><strong>Get the replay</strong><p>Hear the ghost narration, download the report, then request a Codex patch.</p></div>
      </div>
    </section>
  `);
}

function newTest() {
  state.screenshots = [];
  shell(`
    <section class="setup">
      <div class="page-head">
        <p class="eyebrow">New test</p>
        <h1>Give the ghosts something to inspect.</h1>
      </div>
      <form class="setup-card" id="test-form">
        <div class="source-grid">
          <label class="field">
            <span>Website URL</span>
            <input name="websiteUrl" type="url" placeholder="https://your-product.com">
            <small>iGhost captures this page in a headless browser and gives the screenshot to the ghosts.</small>
          </label>
          <label class="upload-box">
            <span>Upload screenshots</span>
            <input id="file-input" type="file" accept="image/*" multiple>
            <small>PNG, JPEG, WebP, or GIF. Screenshots give the strongest visual critique.</small>
          </label>
        </div>
        <div class="thumbs" id="thumbs"></div>
        <label class="field">
          <span>What should the ghosts test?</span>
          <textarea name="intendedTask" required placeholder="Example: Can a first-time visitor understand what this product does and start a demo without confusion?"></textarea>
        </label>
        <label class="field">
          <span>Product context</span>
          <textarea name="productDescription" placeholder="Optional: who this is for, what it promises, what the page/flow is meant to do."></textarea>
        </label>
        <div>
          <span class="field-label">Ghosts</span>
          <div class="ghost-picker">
            ${ghostProfiles.map((ghost, index) => `
              <label class="ghost-option" title="${escapeHtml(ghost.profile)}">
                <input type="checkbox" name="ghost" value="${ghost.id}" ${index < 3 ? "checked" : ""}>
                <span class="ghost-orb" style="--ghost:${ghost.color}"></span>
                <strong>${ghost.name}</strong>
                <small>${ghost.label}</small>
              </label>
            `).join("")}
          </div>
        </div>
        <button class="button primary large" type="submit">Start ghost test</button>
        <div class="status hidden" id="status"></div>
      </form>
    </section>
  `);
  app.querySelector("#file-input").addEventListener("change", readScreenshots);
  app.querySelector("#test-form").addEventListener("submit", submitTest);
}

async function readScreenshots(event) {
  const files = Array.from(event.target.files || []);
  for (const file of files) {
    state.screenshots.push({
      label: file.name.replace(/\.[^.]+$/, ""),
      url: await fileToDataUrl(file),
    });
  }
  renderThumbs();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderThumbs() {
  const node = app.querySelector("#thumbs");
  if (!node) return;
  node.innerHTML = state.screenshots.map((shot, index) => `
    <div class="thumb">
      <img src="${shot.url}" alt="Screenshot ${index + 1}">
      <input value="${escapeHtml(shot.label)}" data-shot="${index}" aria-label="Screenshot label">
      <button type="button" data-remove="${index}">Remove</button>
    </div>
  `).join("");
  node.querySelectorAll("[data-shot]").forEach((input) => {
    input.addEventListener("input", () => {
      state.screenshots[Number(input.dataset.shot)].label = input.value;
    });
  });
  node.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      state.screenshots.splice(Number(button.dataset.remove), 1);
      renderThumbs();
    });
  });
}

function setStatus(message, isError = false) {
  const status = app.querySelector("#status");
  if (!status) return;
  status.className = `status${isError ? " error" : ""}`;
  status.textContent = message;
}

async function submitTest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const selectedGhosts = Array.from(form.querySelectorAll("input[name='ghost']:checked")).map((input) => input.value);
  if (selectedGhosts.length < 1) return setStatus("Choose at least one ghost.", true);
  if (!form.websiteUrl.value.trim() && !state.screenshots.length) return setStatus("Add a website URL or upload screenshots.", true);

  setStatus("Capturing the website, then starting OpenAI analysis.");
  try {
    const payload = {
      websiteUrl: form.websiteUrl.value.trim(),
      productName: new URL(form.websiteUrl.value.trim() || "https://product.local").hostname.replace(/^www\./, "") || "Product",
      productDescription: form.productDescription.value.trim(),
      intendedTask: form.intendedTask.value.trim(),
      ghostCount: selectedGhosts.length,
      screenshots: state.screenshots,
    };
    const { test } = await api("/api/tests", { method: "POST", body: JSON.stringify(payload) });
    setStatus("Summoning ghosts and generating voice.");
    await api(`/api/tests/${test.id}/run`, { method: "POST", body: "{}" });
    route(`/test/${test.id}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function loadTest(id) {
  shell(`<section class="setup"><div class="status">Loading ghost replay...</div></section>`);
  try {
    const { test } = await api(`/api/tests/${id}`);
    renderOutput(test);
  } catch (error) {
    shell(`<section class="setup"><div class="status error">${escapeHtml(error.message)}</div></section>`);
  }
}

function activeReaction(test) {
  const reactions = test.reactions || [];
  const current = reactions[state.selectedStep] || reactions[0] || {};
  const ghost = test.ghosts?.find((item) => item.id === (state.selectedGhostId || current.ghostId)) || test.ghosts?.[0] || {};
  const ghostReaction = reactions.find((item) => item.ghostId === ghost.id && item.stepOrder === current.stepOrder) || reactions.find((item) => item.ghostId === ghost.id) || current;
  const screen = test.screenshots?.find((item) => item.id === ghostReaction.screenshotId) || test.screenshots?.[0] || {};
  return { reaction: ghostReaction, ghost, screen };
}

function ghostName(ghost, index = 0) {
  return ghost?.name || ghost?.label || ["Mara", "Nico", "Ada"][index] || "Ghost";
}

function reactionText(reaction) {
  return reaction.quote || reaction.reaction || reaction.interpretation || reaction.evidence || "The ghost is forming a first impression.";
}

function findingTitle(item) {
  return item.title || item.friction || item.description || item.affectedArea || "Finding";
}

function findingFix(item) {
  return item.recommendedFix || item.suggestion || item.impact || item.evidence || item.description || "";
}

function renderOutput(test) {
  const { reaction, ghost, screen } = activeReaction(test);
  const activeGhostIndex = Math.max(0, test.ghosts?.findIndex((item) => item.id === ghost.id) ?? 0);
  const reportUrl = test.reportSlug ? `${location.origin}/report/${test.reportSlug}` : "";
  shell(`
    <section class="output">
      <header class="output-head">
        <div>
          <p class="eyebrow">Ghost viewpoint</p>
          <h1>${escapeHtml(ghostName(ghost, activeGhostIndex))} is testing ${escapeHtml(test.productName || "your flow")}</h1>
        </div>
        <div class="output-actions">
          <button class="button" id="download-report">Download report</button>
          <button class="button primary" id="request-patch">Request Codex patch</button>
        </div>
      </header>

      <div class="stage">
        <div class="viewport">
          ${screen.url ? `<img src="${screen.url}" alt="${escapeHtml(screen.label || "Product screenshot")}">` : `<div class="url-card"><span>Website under test</span><strong>${escapeHtml(test.websiteUrl || test.productName)}</strong></div>`}
          <div class="thought">
            <span class="avatar ${escapeHtml(reaction.emotion || "neutral")}" style="--ghost:${ghost.color || "#8b5cf6"}"></span>
            <div>
              <strong>${escapeHtml(ghostName(ghost, activeGhostIndex))}</strong>
              <p>${escapeHtml(reactionText(reaction))}</p>
            </div>
          </div>
        </div>
        <aside class="agent-panel">
          <div class="ghost-tabs">
            ${(test.ghosts || []).map((item, index) => `<button class="${item.id === ghost.id ? "active" : ""}" data-ghost-id="${item.id}">${escapeHtml(ghostName(item, index))}</button>`).join("")}
          </div>
          <div class="meter"><span style="--value:${reaction.patienceAfter || 50}%"></span></div>
          <p class="meta">Patience ${reaction.patienceBefore ?? 70} -> ${reaction.patienceAfter ?? 50}</p>
          <h2>What they feel</h2>
          <p><strong>Noticed:</strong> ${escapeHtml(reaction.noticedFirst || reaction.evidence || "")}</p>
          <p><strong>Likely action:</strong> ${escapeHtml(reaction.actualLikelyAction || reaction.expectedNextAction || reaction.impact || "")}</p>
          ${(reaction.confusion || []).slice(0, 2).map((item) => `<p><strong>Friction:</strong> ${escapeHtml(item)}</p>`).join("")}
          <div class="voice-box">
            ${reaction.audioUrl ? `<audio controls src="${reaction.audioUrl}"></audio><small>AI-generated OpenAI voice narration</small>` : `<small>Voice was not generated for this reaction.</small>`}
          </div>
          <form class="interrupt-box" id="interrupt-form">
            <label>
              <span>Interrupt this ghost</span>
              <textarea name="question" placeholder="Ask about something specific on screen..."></textarea>
            </label>
            <button class="button primary" type="submit">Ask ghost</button>
          </form>
          <div class="interrupt-answer" id="interrupt-answer">
            ${renderFollowups(test, ghost.id)}
          </div>
          <div class="step-controls">
            <button class="button" id="prev-step">Previous</button>
            <button class="button" id="next-step">Next</button>
          </div>
        </aside>
      </div>

      <section class="summary-grid">
        <div class="summary-card">
          <h2>Top findings</h2>
          ${(test.frictionPoints || []).slice(0, 3).map((item) => `<article><strong>${escapeHtml(findingTitle(item))}</strong><p>${escapeHtml(findingFix(item))}</p></article>`).join("")}
        </div>
        <div class="summary-card">
          <h2>Report</h2>
          <p>Download the current findings as a compact text report, or open the public report route.</p>
          ${reportUrl ? `<button class="button" data-route="/report/${test.reportSlug}">Open report</button>` : ""}
        </div>
        <div class="summary-card" id="patch-card">
          <h2>Codex patch</h2>
          <p>${escapeHtml(test.codexPatch?.summary || test.codexPatch?.instructions || "Request a patch when you are ready to turn findings into code changes.")}</p>
          <pre class="patch hidden">${escapeHtml(test.codexPatch?.filesChanged?.map((file) => file.diff).join("\n\n") || test.codexPatch?.instructions || "")}</pre>
        </div>
      </section>
    </section>
  `);
  app.querySelectorAll("[data-ghost-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedGhostId = button.dataset.ghostId;
      renderOutput(test);
    });
  });
  app.querySelector("#prev-step")?.addEventListener("click", () => {
    state.selectedStep = Math.max(0, state.selectedStep - 1);
    renderOutput(test);
  });
  app.querySelector("#next-step")?.addEventListener("click", () => {
    state.selectedStep = Math.min((test.reactions?.length || 1) - 1, state.selectedStep + 1);
    renderOutput(test);
  });
  app.querySelector("#download-report")?.addEventListener("click", () => downloadReport(test));
  app.querySelector("#request-patch")?.addEventListener("click", () => {
    app.querySelector(".patch")?.classList.toggle("hidden");
  });
  app.querySelector("#interrupt-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const question = form.question.value.trim();
    if (!question) return;
    const answerBox = app.querySelector("#interrupt-answer");
    answerBox.innerHTML = `<p class="meta">The ghost is looking again...</p>`;
    try {
      const { followup, test: updatedTest } = await api(`/api/tests/${test.id}/ask`, {
        method: "POST",
        body: JSON.stringify({ question, ghostId: ghost.id, stepIndex: state.selectedStep }),
      });
      test.followups = updatedTest.followups;
      answerBox.innerHTML = renderFollowups(test, ghost.id, followup.id);
      form.reset();
    } catch (error) {
      answerBox.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
    }
  });
}

function renderFollowups(test, ghostId, activeId = "") {
  const followups = (test.followups || []).filter((item) => item.ghostId === ghostId).slice(-2);
  if (!followups.length) return `<p class="meta">Ask a focused question and the selected ghost will answer in-character.</p>`;
  return followups.map((item) => `
    <article class="${item.id === activeId ? "fresh" : ""}">
      <small>${escapeHtml(item.question)}</small>
      <p>${escapeHtml(item.answer)}</p>
    </article>
  `).join("");
}

function downloadReport(test) {
  const lines = [
    `iGhost report: ${test.productName}`,
    "",
    `Task: ${test.intendedTask}`,
    "",
    "Top findings:",
    ...(test.frictionPoints || []).map((item, index) => `${index + 1}. ${findingTitle(item)}\nFix: ${findingFix(item)}`),
    "",
    "Synthetic testing disclaimer: These findings are AI-generated hypotheses. Validate important decisions with real users.",
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${test.productName || "ighost"}-report.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadReport(slug) {
  shell(`<section class="setup"><div class="status">Opening report...</div></section>`);
  try {
    const { test } = await api(`/api/reports/${slug}`);
    renderOutput(test);
  } catch (error) {
    shell(`<section class="setup"><div class="status error">${escapeHtml(error.message)}</div></section>`);
  }
}

function render() {
  const path = location.pathname;
  if (path === "/") return landing();
  if (path === "/new") return newTest();
  const testMatch = path.match(/^\/test\/([^/]+)$/);
  if (testMatch) return loadTest(testMatch[1]);
  const reportMatch = path.match(/^\/report\/([^/]+)$/);
  if (reportMatch) return loadReport(reportMatch[1]);
  return landing();
}

window.addEventListener("popstate", render);
render();
