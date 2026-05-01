/**
 * Savers Bookmarklet — injected script for cross-browser quick-save.
 *
 * Creates a minimal modal overlay on any page. Posts to the Savers API
 * and auto-closes on success. Works in Chrome, Firefox, Safari, and Edge
 * without any extension install required.
 */
(function () {
  if (document.getElementById("savers-bm-root")) return;

  /* ── DOM ── */
  const root = document.createElement("div");
  root.id = "savers-bm-root";
  root.innerHTML = `
    <style>
      #savers-bm-root {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 14px;
        --bm-bg: #111;
        --bm-panel: #1a1a1a;
        --bm-border: #2a2a2a;
        --bm-text: #ececec;
        --bm-muted: #9b9b9b;
        --bm-accent: #fff;
        --bm-green: #1f6f43;
        --bm-red: #8b1e1e;
      }
      .savers-bm-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(4px);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .savers-bm-panel {
        background: var(--bm-panel);
        border: 1px solid var(--bm-border);
        border-radius: 14px;
        padding: 20px;
        max-width: 400px;
        width: 100%;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        animation: saversBmIn 180ms ease;
      }
      @keyframes saversBmIn {
        from { transform: translateY(-12px); opacity: 0; }
        to   { transform: translateY(0); opacity: 1; }
      }
      .savers-bm-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--bm-text);
        margin: 0 0 4px;
        word-break: break-word;
      }
      .savers-bm-url {
        font-size: 12px;
        color: var(--bm-muted);
        margin: 0 0 14px;
        word-break: break-all;
        line-height: 1.3;
      }
      .savers-bm-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: 12px;
      }
      .savers-bm-label {
        font-size: 11px;
        color: var(--bm-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .savers-bm-input {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 10px;
        border: 1px solid var(--bm-border);
        border-radius: 8px;
        background: var(--bm-bg);
        color: var(--bm-text);
        font: inherit;
        font-size: 14px;
      }
      .savers-bm-input:focus {
        outline: none;
        border-color: #555;
      }
      .savers-bm-select {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 10px;
        border: 1px solid var(--bm-border);
        border-radius: 8px;
        background: var(--bm-bg);
        color: var(--bm-text);
        font: inherit;
        font-size: 14px;
      }
      .savers-bm-actions {
        display: flex;
        gap: 8px;
        margin-top: 16px;
      }
      .savers-bm-btn {
        flex: 1;
        padding: 10px;
        border: 1px solid var(--bm-border);
        border-radius: 8px;
        background: transparent;
        color: var(--bm-text);
        font: inherit;
        font-size: 14px;
        cursor: pointer;
        text-align: center;
      }
      .savers-bm-btn:hover {
        border-color: #555;
      }
      .savers-bm-btn-primary {
        background: var(--bm-text);
        color: var(--bm-bg);
        border-color: var(--bm-text);
        font-weight: 600;
      }
      .savers-bm-btn-primary:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .savers-bm-status {
        margin-top: 10px;
        font-size: 12px;
        min-height: 16px;
      }
      .savers-bm-status-error { color: #ff8f8f; }
      .savers-bm-status-success { color: #9ce7b1; }
      .savers-bm-powered {
        margin-top: 10px;
        font-size: 11px;
        color: var(--bm-muted);
        text-align: right;
      }
    </style>
    <div class="savers-bm-backdrop">
      <div class="savers-bm-panel">
        <div class="savers-bm-title"></div>
        <div class="savers-bm-url"></div>
        <div class="savers-bm-field">
          <label class="savers-bm-label">Title</label>
          <input class="savers-bm-input savers-bm-title-input" type="text" />
        </div>
        <div class="savers-bm-field">
          <label class="savers-bm-label">Tags (comma-separated)</label>
          <input class="savers-bm-input savers-bm-tags" type="text" placeholder="design, inspiration" />
        </div>
        <div class="savers-bm-field">
          <label class="savers-bm-label">Collection</label>
          <select class="savers-bm-select savers-bm-collection"></select>
        </div>
        <div class="savers-bm-actions">
          <button class="savers-bm-btn savers-bm-cancel" type="button">Cancel</button>
          <button class="savers-bm-btn savers-bm-btn-primary savers-bm-save" type="button">Save</button>
        </div>
        <div class="savers-bm-status"></div>
        <div class="savers-bm-powered">Saved to Savers</div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  /* ── State ── */
  const apiBase = "https://savers-production.up.railway.app";
  let saving = false;

  const pageTitle = document.title || "";
  const pageUrl = location.href;
  const pageDesc =
    document.querySelector('meta[name="description"], meta[property="og:description"]')
      ?.content?.trim() || "";

  /* ── Elements ── */
  const titleEl = root.querySelector(".savers-bm-title");
  const urlEl = root.querySelector(".savers-bm-url");
  const titleInput = root.querySelector(".savers-bm-title-input");
  const tagsInput = root.querySelector(".savers-bm-tags");
  const collSelect = root.querySelector(".savers-bm-collection");
  const statusEl = root.querySelector(".savers-bm-status");
  const saveBtn = root.querySelector(".savers-bm-save");
  const cancelBtn = root.querySelector(".savers-bm-cancel");
  const backdrop = root.querySelector(".savers-bm-backdrop");

  titleEl.textContent = pageTitle;
  urlEl.textContent = pageUrl;
  titleInput.value = pageTitle;

  function setStatus(msg, kind) {
    statusEl.textContent = msg || "";
    statusEl.className = "savers-bm-status";
    if (kind) statusEl.classList.add("savers-bm-status-" + kind);
  }

  /* ── API ── */
  async function apiFetch(path, options) {
    const res = await fetch(apiBase + path, {
      credentials: "include",
      ...options,
    });
    if (!res.ok) {
      let msg = res.status + " " + res.statusText;
      try {
        const body = await res.json();
        if (body?.error) msg = body.error;
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  }

  /* ── Load collections ── */
  async function loadCollections() {
    try {
      const data = await apiFetch("/api/collections", { method: "GET" });
      const flat = data?.flat || [];
      collSelect.innerHTML = '<option value="">Unsorted</option>';
      for (const c of flat) {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.name;
        collSelect.appendChild(opt);
      }
    } catch {
      collSelect.innerHTML = '<option value="">Unsorted</option>';
    }
  }

  /* ── Save ── */
  async function doSave() {
    if (saving) return;
    saving = true;
    saveBtn.disabled = true;
    setStatus("Saving…", null);

    try {
      await apiFetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: pageUrl,
          title: titleInput.value.trim() || pageTitle,
          description: pageDesc,
          og_image: null,
          favicon: null,
          tags: String(tagsInput.value || "")
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
          notes: null,
          collection_id: collSelect.value || null,
          source: "bookmarklet",
        }),
      });
      setStatus("Saved!", "success");
      setTimeout(() => root.remove(), 800);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed", "error");
      saving = false;
      saveBtn.disabled = false;
    }
  }

  /* ── Events ── */
  saveBtn.addEventListener("click", doSave);
  cancelBtn.addEventListener("click", () => root.remove());
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) root.remove();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") root.remove();
  });
  tagsInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSave();
    }
  });

  loadCollections();
})();
