const app = document.querySelector("#app");

const state = {
  screenshots: [],
  selectedStep: 0,
  selectedGhostId: "",
  recognition: null,
  clientVideoUrl: "",
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
          <p class="eyebrow">Ghost session replay</p>
          <h1>Watch ${escapeHtml(ghostName(ghost, activeGhostIndex))} use ${escapeHtml(test.productName || "your flow")}</h1>
        </div>
        <div class="output-actions">
          <button class="button" id="download-report">Download report</button>
          ${test.videoUrl ? `<a class="button primary" href="${test.videoUrl}" download>Download video</a>` : ""}
          <button class="button primary" id="request-patch">Request Codex patch</button>
        </div>
      </header>

      <div class="video-first">
        ${test.videoUrl ? `
          <video class="session-video" controls playsinline src="${test.videoUrl}"></video>
        ` : `
          <div class="client-video-maker">
            <canvas id="replay-canvas" width="1280" height="720"></canvas>
            <div class="video-maker-actions">
              <button class="button primary" id="record-replay">Generate downloadable replay video</button>
              <a class="button hidden" id="download-client-video" download="ighost-replay.webm">Download video</a>
            </div>
            <p class="meta">Local MP4 export is unavailable on this machine, so iGhost can record the replay in-browser as WebM.</p>
          </div>
        `}
      </div>

      <div class="stage secondary-stage">
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
              <span>Ask the ghost by voice</span>
              <textarea name="question" placeholder="Press Speak, then ask about something specific on screen..."></textarea>
            </label>
            <div class="voice-actions">
              <button class="button" type="button" id="speak-question">Speak</button>
              <button class="button primary" type="submit">Ask ghost</button>
            </div>
            <small>This is a follow-up question after the generated session. Live mid-session interruption requires a Realtime browser-control loop.</small>
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
  drawReplayCanvas(test, 0);
  app.querySelector("#record-replay")?.addEventListener("click", () => recordClientReplay(test));
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
  app.querySelector("#speak-question")?.addEventListener("click", () => startVoiceQuestion());
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function cursorPoint(index) {
  const points = [
    [0.22, 0.32],
    [0.54, 0.48],
    [0.72, 0.56],
    [0.35, 0.72],
  ];
  return points[index % points.length];
}

async function drawReplayCanvas(test, progress = 0) {
  const canvas = app.querySelector("#replay-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reactions = test.reactions || [];
  const step = Math.min(reactions.length - 1, Math.floor(progress / 4500));
  const local = (progress % 4500) / 4500;
  const reaction = reactions[step] || reactions[0] || {};
  const screen = test.screenshots?.find((item) => item.id === reaction.screenshotId) || test.screenshots?.[0];
  const ghost = test.ghosts?.find((item) => item.id === reaction.ghostId) || test.ghosts?.[0] || {};
  ctx.fillStyle = "#06040b";
  ctx.fillRect(0, 0, 1280, 720);
  if (screen?.url) {
    try {
      const image = await loadImage(screen.url);
      const scale = Math.min(1120 / image.width, 560 / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      ctx.drawImage(image, 80 + (1120 - width) / 2, 30 + (560 - height) / 2, width, height);
    } catch {
      ctx.fillStyle = "#17102c";
      ctx.fillRect(80, 30, 1120, 560);
    }
  }
  const [startX, startY] = cursorPoint(step);
  const [endX, endY] = cursorPoint(step + 1);
  const x = 80 + 1120 * (startX + (endX - startX) * local);
  const y = 30 + 560 * (startY + (endY - startY) * local);
  ctx.fillStyle = "rgba(255,255,255,.28)";
  ctx.beginPath();
  ctx.arc(x, y, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b08cff";
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(5,3,10,.86)";
  roundRectCanvas(ctx, 54, 538, 1172, 132, 18);
  ctx.fillStyle = "#e9ddff";
  ctx.font = "700 28px Arial, sans-serif";
  ctx.fillText(`${ghostName(ghost)} thinking aloud`, 82, 580);
  ctx.fillStyle = "#ffffff";
  ctx.font = "24px Arial, sans-serif";
  wrapCanvasText(ctx, reactionText(reaction), 82, 624, 1080, 31, 2);
}

function roundRectCanvas(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fill();
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || "").split(" ");
  let line = "";
  let lines = 0;
  for (const word of words) {
    const testLine = `${line}${word} `;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, y);
      line = `${word} `;
      y += lineHeight;
      lines += 1;
      if (lines >= maxLines) return;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, y);
}

async function recordClientReplay(test) {
  const canvas = app.querySelector("#replay-canvas");
  const button = app.querySelector("#record-replay");
  const link = app.querySelector("#download-client-video");
  if (!canvas || !window.MediaRecorder) return;
  button.textContent = "Recording replay...";
  button.disabled = true;
  const canvasStream = canvas.captureStream(30);
  const firstAudio = (test.reactions || []).map((reaction) => reaction.audioUrl).find(Boolean);
  let audio;
  let stream = canvasStream;
  if (firstAudio) {
    audio = new Audio(firstAudio);
    audio.crossOrigin = "anonymous";
    await audio.play().catch(() => {});
    audio.pause();
    audio.currentTime = 0;
    if (audio.captureStream) {
      stream = new MediaStream([...canvasStream.getVideoTracks(), ...audio.captureStream().getAudioTracks()]);
    }
  }
  const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: "video/webm" });
    state.clientVideoUrl = URL.createObjectURL(blob);
    link.href = state.clientVideoUrl;
    link.classList.remove("hidden");
    button.textContent = "Regenerate replay video";
    button.disabled = false;
  };
  recorder.start();
  const duration = Math.max(4500, (test.reactions?.length || 1) * 4500);
  const start = performance.now();
  if (audio) audio.play().catch(() => {});
  async function tick(now) {
    const elapsed = now - start;
    await drawReplayCanvas(test, elapsed);
    if (elapsed < duration) {
      requestAnimationFrame(tick);
    } else {
      if (audio) audio.pause();
      recorder.stop();
    }
  }
  requestAnimationFrame(tick);
}

function startVoiceQuestion() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const textarea = app.querySelector("#interrupt-form textarea");
  const button = app.querySelector("#speak-question");
  if (!SpeechRecognition || !textarea) {
    textarea.placeholder = "Speech input is not supported in this browser. Type your question here.";
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;
  button.textContent = "Listening...";
  recognition.onresult = (event) => {
    textarea.value = event.results?.[0]?.[0]?.transcript || "";
  };
  recognition.onerror = () => {
    textarea.placeholder = "Could not hear that. Try again or type the question.";
  };
  recognition.onend = () => {
    button.textContent = "Speak";
  };
  recognition.start();
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
