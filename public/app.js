const app = document.querySelector("#app");

const state = {
  clientVideoUrl: "",
};

const ghosts = [
  {
    id: "impatient",
    name: "Mara",
    label: "Impatient",
    text: "Fast scanner. Wants value and a next step immediately.",
  },
  {
    id: "unsure",
    name: "Nico",
    label: "Unsure",
    text: "Needs plain language and reassurance before clicking.",
  },
  {
    id: "skeptical",
    name: "Ada",
    label: "Skeptical",
    text: "Looks for proof, platform fit, and trust signals.",
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

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function route(path) {
  history.pushState({}, "", path);
  render();
}

function shell(content) {
  app.innerHTML = `
    <main>
      <nav class="nav">
        <button class="brand" data-route="/">
          <span class="brand-mark"></span>
          <span>iGhost</span>
        </button>
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
    <section class="mvp">
      <div class="intro">
        <p class="eyebrow">Ghost walkthrough</p>
        <h1>Generate a voiceover video of an AI user trying your website.</h1>
        <p>Paste a URL, choose a ghost, describe the task. iGhost opens the site, acts like that user, records what it sees and thinks, and gives you a downloadable walkthrough.</p>
      </div>
      <form class="run-card" id="run-form">
        <label>
          <span>Website</span>
          <input name="websiteUrl" type="url" placeholder="https://wisprflow.ai" required>
        </label>
        <label>
          <span>What should the ghost try to do?</span>
          <textarea name="intendedTask" required placeholder="Can a first-time visitor understand what this product does, trust it, and know how to get started?"></textarea>
        </label>
        <div>
          <span class="field-label">Ghost personality</span>
          <div class="ghost-grid">
            ${ghosts.map((ghost, index) => `
              <label class="ghost-choice">
                <input type="radio" name="ghostProfile" value="${ghost.id}" ${index === 0 ? "checked" : ""}>
                <strong>${ghost.name}</strong>
                <small>${ghost.label}</small>
                <p>${ghost.text}</p>
              </label>
            `).join("")}
          </div>
        </div>
        <button class="button primary large" type="submit">Generate walkthrough</button>
        <div class="status hidden" id="status"></div>
      </form>
    </section>
  `);
  app.querySelector("#run-form").addEventListener("submit", submitRun);
}

function setStatus(message, isError = false) {
  const status = app.querySelector("#status");
  status.className = `status${isError ? " error" : ""}`;
  status.textContent = message;
}

async function submitRun(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    websiteUrl: form.websiteUrl.value.trim(),
    intendedTask: form.intendedTask.value.trim(),
    ghostProfile: form.ghostProfile.value,
  };
  setStatus("Opening the website and creating the ghost walkthrough...");
  try {
    const { test } = await api("/api/tests", { method: "POST", body: JSON.stringify(payload) });
    setStatus("The ghost is browsing. Generating voiceover next...");
    await api(`/api/tests/${test.id}/run`, { method: "POST", body: "{}" });
    route(`/test/${test.id}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function loadTest(id) {
  shell(`<section class="mvp"><div class="status">Loading walkthrough...</div></section>`);
  try {
    const { test } = await api(`/api/tests/${id}`);
    output(test);
  } catch (error) {
    shell(`<section class="mvp"><div class="status error">${escapeHtml(error.message)}</div></section>`);
  }
}

function ghostName(test) {
  return test.ghosts?.[0]?.name || "Ghost";
}

function steps(test) {
  return test.sessionSteps?.length ? test.sessionSteps : [];
}

function firstAudio(test) {
  return test.walkthroughAudioUrl || test.reactions?.find((reaction) => reaction.audioUrl)?.audioUrl || "";
}

function output(test) {
  const replaySteps = steps(test);
  shell(`
    <section class="watch">
      <header class="watch-head">
        <div>
          <p class="eyebrow">Walkthrough ready</p>
          <h1>${escapeHtml(ghostName(test))} used ${escapeHtml(test.productName || "your website")}</h1>
        </div>
        <button class="button" data-route="/">New walkthrough</button>
      </header>
      <section class="video-panel">
        <div class="video-actions">
          <button class="button primary" id="record-video">Generate video with voiceover</button>
          <a class="button hidden" id="download-video" download="ighost-walkthrough.webm">Download video</a>
        </div>
        <canvas id="walkthrough-canvas" width="1280" height="720"></canvas>
        ${firstAudio(test) ? `<audio class="voice-preview" controls src="${firstAudio(test)}"></audio>` : `<p class="status error">Voiceover was not generated.</p>`}
      </section>
      <section class="steps-list">
        ${replaySteps.map((step, index) => `
          <article>
            <span>${index + 1}</span>
            <p>${escapeHtml(step.thought || "The ghost is deciding what to do next.")}</p>
            <small>${escapeHtml(step.actionLabel || step.action || "")}</small>
          </article>
        `).join("")}
      </section>
    </section>
  `);
  drawFrame(test, 0);
  app.querySelector("#record-video")?.addEventListener("click", () => recordVideo(test));
}

async function image(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function wrap(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || "").split(" ");
  let line = "";
  let count = 0;
  for (const word of words) {
    const test = `${line}${word} `;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, y);
      line = `${word} `;
      y += lineHeight;
      count += 1;
      if (count >= maxLines) return;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, y);
}

async function drawFrame(test, ms = 0) {
  const canvas = document.querySelector("#walkthrough-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const replaySteps = steps(test);
  const index = Math.min(replaySteps.length - 1, Math.floor(ms / 4500));
  const local = (ms % 4500) / 4500;
  const current = replaySteps[index] || replaySteps[0] || {};
  const next = replaySteps[index + 1] || current;
  ctx.fillStyle = "#06040b";
  ctx.fillRect(0, 0, 1280, 720);
  if (current.screenshotUrl) {
    const img = await image(current.screenshotUrl);
    const scale = Math.min(1120 / img.width, 540 / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, 80 + (1120 - w) / 2, 28 + (540 - h) / 2, w, h);
  }
  const cx1 = (current.cursor?.x || 720) / 1440;
  const cy1 = (current.cursor?.y || 520) / 1100;
  const cx2 = (next.cursor?.x || current.cursor?.x || 820) / 1440;
  const cy2 = (next.cursor?.y || current.cursor?.y || 560) / 1100;
  const x = 80 + 1120 * (cx1 + (cx2 - cx1) * local);
  const y = 28 + 540 * (cy1 + (cy2 - cy1) * local);
  ctx.fillStyle = "rgba(255,255,255,.28)";
  ctx.beginPath();
  ctx.arc(x, y, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#a78bfa";
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(5,3,10,.9)";
  roundRect(ctx, 54, 546, 1172, 126, 18);
  ctx.fillStyle = "#efe8ff";
  ctx.font = "700 28px Arial, sans-serif";
  ctx.fillText(`${ghostName(test)} thinking aloud`, 82, 588);
  ctx.fillStyle = "#fff";
  ctx.font = "24px Arial, sans-serif";
  wrap(ctx, current.thought || "I am deciding what to try next.", 82, 632, 1080, 31, 2);
}

async function audioStream(url) {
  if (!url) return [];
  const context = new AudioContext();
  const response = await fetch(url);
  const buffer = await context.decodeAudioData(await response.arrayBuffer());
  const source = context.createBufferSource();
  source.buffer = buffer;
  const destination = context.createMediaStreamDestination();
  source.connect(destination);
  source.start();
  return destination.stream.getAudioTracks();
}

async function recordVideo(test) {
  const canvas = document.querySelector("#walkthrough-canvas");
  const button = document.querySelector("#record-video");
  const link = document.querySelector("#download-video");
  if (!canvas || !window.MediaRecorder) return;
  button.disabled = true;
  button.textContent = "Generating...";
  const tracks = [...canvas.captureStream(30).getVideoTracks(), ...(await audioStream(firstAudio(test)).catch(() => []))];
  const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: "video/webm" });
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: "video/webm" });
    state.clientVideoUrl = URL.createObjectURL(blob);
    link.href = state.clientVideoUrl;
    link.classList.remove("hidden");
    button.textContent = "Regenerate video";
    button.disabled = false;
  };
  recorder.start();
  const duration = Math.max(4500, steps(test).length * 4500);
  const start = performance.now();
  async function tick(now) {
    const elapsed = now - start;
    await drawFrame(test, elapsed);
    if (elapsed < duration) requestAnimationFrame(tick);
    else recorder.stop();
  }
  requestAnimationFrame(tick);
}

function render() {
  const path = location.pathname;
  const testMatch = path.match(/^\/test\/([^/]+)$/);
  if (testMatch) return loadTest(testMatch[1]);
  return landing();
}

window.addEventListener("popstate", render);
render();
