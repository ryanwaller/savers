/**
 * Savers Bookmarklet — injected script for cross-browser quick-save.
 *
 * Creates a minimal modal overlay on any page. Posts to the Savers API
 * and auto-closes on success. Works in Chrome, Firefox, Safari, and Edge
 * without any extension install required.
 *
 * Usage:
 *   1. Create an API token in Savers Settings → API tokens
 *   2. Append ?token=<your-token> to the script src:
 *      javascript:(function(){var s=document.createElement('script');s.src='https://.../bookmarklet.js?token=svr_...';document.head.appendChild(s);})();
 *
 * When a token is provided, requests use Authorization: Bearer <token>.
 * Without a token, falls back to session cookies (requires SameSite=None).
 */
(function () {
  if (document.getElementById("savers-bm-root")) return;

  /* Parse token from script src */
  var token = null;
  try {
    var me = document.currentScript;
    if (me && me.src) {
      var m = me.src.match(/[?&]token=([^&#]+)/);
      if (m) token = decodeURIComponent(m[1]);
    }
  } catch (_) {}

  /* DOM */
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
        font-size: 14px;
        font-weight: 500;
        color: #b0b0b0;
        text-transform: none;
        letter-spacing: normal;
      }
      .savers-bm-input {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 10px;
        border: 1px solid var(--bm-border);
        border-radius: 8px;
        background: var(--bm-bg);
        color: #e8e8e8;
        font: inherit;
        font-size: 14px;
      }
      .savers-bm-input::placeholder {
        color: #888;
        opacity: 1;
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
        color: #e8e8e8;
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
          <label class="savers-bm-label">Tags</label>
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
      </div>
    </div>
  `;
  document.body.appendChild(root);

  /* State */
  const apiBase = "https://savers-production.up.railway.app";
  let saving = false;

  const pageTitle = document.title || "";
  const pageUrl = location.href;
  const pageDesc =
    document.querySelector('meta[name="description"], meta[property="og:description"]')
      ?.content?.trim() || "";

  /* Elements */
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

  /* API */
  async function apiFetch(path, options) {
    const headers = { ...(options.headers || {}) };
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }
    const res = await fetch(apiBase + path, {
      ...options,
      credentials: token ? "omit" : "include",
      headers,
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

  /* Load collections (sorted hierarchically) */
  async function loadCollections() {
    try {
      const data = await apiFetch("/api/collections", { method: "GET" });
      const flat = data?.flat || [];
      if (!flat.length) {
        collSelect.innerHTML = '<option value="">Unsorted</option>';
        return;
      }

      // Build lookup + path resolver
      const byId = {};
      for (let i = 0; i < flat.length; i++) byId[flat[i].id] = flat[i];

      function resolvePath(id) {
        const c = byId[id];
        if (!c) return "";
        if (c.parent_id) {
          const parentPath = resolvePath(c.parent_id);
          return parentPath ? parentPath + " / " + c.name : c.name;
        }
        return c.name;
      }

      function getDepth(id) {
        let depth = 0;
        let c = byId[id];
        while (c && c.parent_id) {
          depth++;
          c = byId[c.parent_id];
        }
        return depth;
      }

      // Sort by full path for parent->child grouping
      const sorted = flat.slice().sort(function (a, b) {
        return resolvePath(a.id).localeCompare(resolvePath(b.id), undefined, { numeric: true, sensitivity: "base" });
      });

      collSelect.innerHTML = '<option value="">Unsorted</option>';
      for (let i = 0; i < sorted.length; i++) {
        const c = sorted[i];
        const opt = document.createElement("option");
        opt.value = c.id;
        const depth = Math.min(getDepth(c.id), 3);
        const indent = depth > 0
          ? "   ".repeat(depth) + "↳ "
          : "";
        opt.textContent = indent + c.name;
        collSelect.appendChild(opt);
      }
    } catch {
      collSelect.innerHTML = '<option value="">Unsorted</option>';
    }
  }

  /* Save */
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

  /* Events */
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
