const app = document.querySelector("#app");

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
  {
    id: "custom",
    name: "Custom",
    label: "Your ghost",
    text: "Describe the person you want iGhost to emulate.",
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
        <h1>Watch a ghost use your website.</h1>
        <p>Paste a URL, describe the job, and get a playable MP4 with the ghost's voiceover and highlighted cursor.</p>
        <div class="process">
          <span><b>1</b> Add URL</span>
          <span><b>2</b> Pick ghost</span>
          <span><b>3</b> Get MP4</span>
        </div>
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
        <div class="custom-ghost hidden" id="custom-ghost">
          <label>
            <span>Custom ghost name</span>
            <input name="customGhostName" placeholder="Amanda">
          </label>
          <label>
            <span>Who should this ghost behave like?</span>
            <textarea name="customGhostProfile" placeholder="Amanda is a student at NUS. She likes great deals and checks student discounts before buying."></textarea>
          </label>
        </div>
        <button class="button primary large" type="submit">Generate walkthrough</button>
        <div class="status hidden" id="status"></div>
      </form>
    </section>
  `);
  const form = app.querySelector("#run-form");
  form.addEventListener("submit", submitRun);
  form.addEventListener("change", toggleCustomGhost);
  toggleCustomGhost();
}

function toggleCustomGhost() {
  const form = app.querySelector("#run-form");
  const panel = app.querySelector("#custom-ghost");
  if (!form || !panel) return;
  const isCustom = form.ghostProfile.value === "custom";
  panel.classList.toggle("hidden", !isCustom);
  form.customGhostName.required = isCustom;
  form.customGhostProfile.required = isCustom;
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
  if (payload.ghostProfile === "custom") {
    payload.customGhost = {
      name: form.customGhostName.value.trim(),
      profile: form.customGhostProfile.value.trim(),
    };
  }
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

function advice(test) {
  return test.actionableAdvice?.items?.length ? test.actionableAdvice : null;
}

function output(test) {
  const hasVideo = Boolean(test.videoUrl);
  const recommendation = advice(test);
  shell(`
    <section class="watch">
      <header class="watch-head">
        <div>
          <p class="eyebrow">${hasVideo ? "Walkthrough ready" : "Walkthrough failed"}</p>
          <h1>${escapeHtml(ghostName(test))} used ${escapeHtml(test.productName || "your website")}</h1>
        </div>
        <button class="button" data-route="/">New walkthrough</button>
      </header>
      <section class="video-panel">
        ${hasVideo ? `
          <video class="walkthrough-video" controls playsinline preload="metadata" src="${test.videoUrl}"></video>
          <div class="video-actions">
            <a class="button" href="${test.videoUrl}" download="ighost-walkthrough.mp4">Download MP4</a>
          </div>
        ` : `
          <p class="status error">${escapeHtml(test.videoError || "The MP4 was not generated.")}</p>
        `}
      </section>
      ${recommendation ? `
        <section class="advice-panel">
          <p class="eyebrow">Actionable advice</p>
          <h2>${escapeHtml(recommendation.summary)}</h2>
          <div class="advice-grid">
            ${recommendation.items.map((item) => `
              <article>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.why)}</p>
                <strong>${escapeHtml(item.change)}</strong>
              </article>
            `).join("")}
          </div>
        </section>
      ` : ""}
    </section>
  `);
}

function render() {
  const path = location.pathname;
  const testMatch = path.match(/^\/test\/([^/]+)$/);
  if (testMatch) return loadTest(testMatch[1]);
  return landing();
}

window.addEventListener("popstate", render);
render();
