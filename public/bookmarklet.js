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
  var apiBase = "https://savers-production.up.railway.app";
  try {
    var me = document.currentScript;
    if (me && me.src) {
      var origin = new URL(me.src).origin;
      if (origin) apiBase = origin;
      var m = me.src.match(/[?&]token=([^&#]+)/);
      if (m) token = decodeURIComponent(m[1]);
    }
  } catch (_) {}

  /* DOM */
  const root = document.createElement("div");
  root.id = "savers-bm-root";
  root.innerHTML = `
    <style>
      @import url("${apiBase}/save-surface-theme.css");
      #savers-bm-root {
        font-family: var(--save-font-family);
        font-size: var(--save-font-size);
        line-height: var(--save-line-height);
        font-weight: var(--save-font-weight);
        letter-spacing: var(--save-letter-spacing);
        --bm-bg: var(--save-dark-bg);
        --bm-panel: var(--save-dark-panel);
        --bm-panel-2: var(--save-dark-panel-2);
        --bm-border: var(--save-dark-border);
        --bm-border-strong: var(--save-dark-border-strong);
        --bm-text: var(--save-dark-text);
        --bm-muted: var(--save-dark-muted);
        --bm-accent: var(--save-light-accent);
        --bm-accent-text: var(--save-light-accent-text);
        --bm-brat: var(--save-brat);
      }
      #savers-bm-root,
      #savers-bm-root * {
        font-family: var(--save-font-family) !important;
        font-size: var(--save-font-size) !important;
        line-height: var(--save-line-height) !important;
        font-weight: var(--save-font-weight) !important;
        letter-spacing: var(--save-letter-spacing) !important;
        text-transform: none !important;
        box-sizing: border-box;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      .savers-bm-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.52);
        backdrop-filter: blur(10px);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .savers-bm-panel {
        background: var(--bm-panel);
        border: 1px solid var(--bm-border);
        border-radius: var(--save-panel-radius);
        padding: 20px;
        max-width: 500px;
        width: min(500px, calc(100vw - 48px));
        max-height: calc(100vh - 48px);
        box-shadow: var(--save-shadow);
        animation: saversBmIn 180ms ease;
        display: flex;
        flex-direction: column;
        gap: 16px;
        overflow-y: auto;
      }
      @keyframes saversBmIn {
        from { transform: translateY(-12px); opacity: 0; }
        to   { transform: translateY(0); opacity: 1; }
      }
      .savers-bm-field {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }
      .savers-bm-inline {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .savers-bm-label {
        color: var(--bm-muted);
        font-weight: 400;
      }
      .savers-bm-input {
        width: 100%;
        box-sizing: border-box;
        padding: 10px 12px;
        border: 1px solid var(--bm-border) !important;
        border-radius: var(--save-field-radius) !important;
        background: var(--bm-bg) !important;
        color: var(--bm-text) !important;
        -webkit-text-fill-color: var(--bm-text) !important;
        box-shadow: none !important;
        text-shadow: none !important;
        outline: none !important;
        font: inherit;
        letter-spacing: inherit;
        font-weight: 400 !important;
        opacity: 1 !important;
      }
      .savers-bm-input::placeholder {
        color: var(--bm-muted);
        opacity: 1;
      }
      .savers-bm-input:focus {
        outline: none !important;
        border-color: var(--bm-border-strong) !important;
      }
      .savers-bm-picker-trigger,
      .savers-bm-picker-search {
        width: 100%;
        box-sizing: border-box;
        padding: 10px 12px;
        border: 1px solid var(--bm-border) !important;
        border-radius: var(--save-field-radius) !important;
        background: var(--bm-bg) !important;
        color: var(--bm-text) !important;
        -webkit-text-fill-color: var(--bm-text) !important;
        box-shadow: none !important;
        text-shadow: none !important;
        outline: none !important;
        font: inherit;
        letter-spacing: inherit;
        font-weight: 400 !important;
        opacity: 1 !important;
      }
      .savers-bm-picker-trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        text-align: left;
        cursor: pointer;
        min-height: 44px;
      }
      .savers-bm-picker-chevron {
        color: var(--bm-muted);
        flex-shrink: 0;
      }
      .savers-bm-picker {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px;
        border: 1px solid var(--bm-border) !important;
        border-radius: var(--save-button-radius) !important;
        background: var(--bm-panel-2) !important;
      }
      .savers-bm-picker[hidden] {
        display: none !important;
      }
      .savers-bm-picker-options {
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-height: 224px;
        overflow-y: auto;
      }
      .savers-bm-picker-option {
        appearance: none;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: var(--bm-text);
        min-height: 44px;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        font: inherit;
        letter-spacing: inherit;
        text-align: left;
        cursor: pointer;
      }
      .savers-bm-picker-option:hover {
        background: rgba(255,255,255,0.06);
      }
      .savers-bm-picker-option.is-active {
        background: var(--bm-accent);
        color: var(--bm-accent-text);
      }
      .savers-bm-picker-empty {
        min-height: 44px;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        color: var(--bm-muted);
      }
      .savers-bm-textarea {
        min-height: 96px;
        resize: vertical;
      }
      .savers-bm-pill {
        appearance: none;
        border: 1px solid var(--bm-border) !important;
        border-radius: var(--save-pill-radius);
        background: #222222 !important;
        color: var(--bm-text) !important;
        padding: 6px 12px;
        min-height: 30px;
        font: inherit;
        font-weight: 400;
        letter-spacing: inherit;
        cursor: pointer;
        opacity: 1 !important;
      }
      .savers-bm-pill-primary {
        background: var(--bm-accent) !important;
        color: var(--bm-accent-text) !important;
        border-color: var(--bm-accent) !important;
      }
      .savers-bm-pill:disabled,
      .savers-bm-btn:disabled {
        opacity: 0.55;
        cursor: default;
      }
      .savers-bm-tag-proposals {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        min-height: 32px;
      }
      .savers-bm-tag-proposals:empty {
        display: none;
      }
      .savers-bm-tag-proposal {
        display: inline-flex;
        align-items: stretch;
        border: 1px dashed var(--bm-border-strong);
        border-radius: 999px;
        background: var(--bm-panel-2);
        overflow: hidden;
      }
      .savers-bm-tag-proposal-add,
      .savers-bm-tag-proposal-skip {
        appearance: none;
        border: 0;
        background: transparent;
        color: var(--bm-text);
        font: inherit;
        cursor: pointer;
      }
      .savers-bm-tag-proposal-add {
        padding: 6px 10px;
      }
      .savers-bm-tag-proposal-skip {
        padding: 0 9px;
        color: var(--bm-muted);
        border-left: 1px dashed var(--bm-border-strong);
      }
      .savers-bm-tag-status {
        color: var(--bm-muted);
      }
      .savers-bm-ai {
        display: flex;
        flex-direction: column;
        gap: 12px;
        border: 1px solid rgba(151, 215, 0, 0.2);
        border-radius: var(--save-button-radius);
        background: linear-gradient(180deg, rgba(151, 215, 0, 0.08), rgba(151, 215, 0, 0.02));
        padding: 12px;
      }
      .savers-bm-ai[hidden] {
        display: none;
      }
      .savers-bm-ai-label {
        color: var(--bm-brat);
      }
      .savers-bm-ai-copy {
        color: var(--bm-text);
        word-break: break-word;
      }
      .savers-bm-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-top: auto;
        padding-top: 4px;
      }
      .savers-bm-btn {
        padding: 10px 14px;
        min-height: 40px;
        border: 1px solid var(--bm-border) !important;
        border-radius: var(--save-button-radius);
        background: #222222 !important;
        color: var(--bm-text) !important;
        font: inherit;
        font-weight: 400;
        letter-spacing: inherit;
        cursor: pointer;
        text-align: center;
        opacity: 1 !important;
      }
      .savers-bm-btn:hover {
        border-color: var(--bm-border-strong) !important;
      }
      .savers-bm-btn-primary {
        background: var(--bm-accent) !important;
        color: var(--bm-accent-text) !important;
        border-color: var(--bm-accent) !important;
      }
      .savers-bm-status {
        min-height: 17px;
        color: var(--bm-muted);
      }
      .savers-bm-status-error { color: #ff8f8f; }
      .savers-bm-status-success { color: #9ce7b1; }
      .savers-bm-status-brat { color: var(--bm-brat); }
      @media (max-width: 560px) {
        .savers-bm-backdrop {
          padding: 14px;
        }
        .savers-bm-panel {
          width: min(100vw - 28px, 500px);
          min-height: 0;
          max-height: calc(100vh - 28px);
          padding: 18px;
        }
        .savers-bm-actions {
          grid-template-columns: 1fr;
        }
      }
    </style>
    <div class="savers-bm-backdrop">
      <div class="savers-bm-panel">
        <div class="savers-bm-field">
          <label class="savers-bm-label">Title</label>
          <input class="savers-bm-input savers-bm-title-input" type="text" />
        </div>
        <div class="savers-bm-field">
          <label class="savers-bm-label">Tags</label>
          <input class="savers-bm-input savers-bm-tags" type="text" placeholder="design, inspiration" />
          <div class="savers-bm-inline">
            <button class="savers-bm-pill savers-bm-pill-primary savers-bm-suggest-tags" type="button">Suggest tags</button>
          </div>
          <div class="savers-bm-tag-proposals"></div>
        </div>
        <div class="savers-bm-field">
          <label class="savers-bm-label">Collection</label>
          <select class="savers-bm-select savers-bm-collection" hidden></select>
          <button class="savers-bm-picker-trigger savers-bm-collection-trigger" type="button" aria-expanded="false">
            <span class="savers-bm-collection-label">Unsorted</span>
            <span class="savers-bm-picker-chevron" aria-hidden="true">⌄</span>
          </button>
          <div class="savers-bm-picker savers-bm-collection-picker" hidden>
            <input class="savers-bm-picker-search savers-bm-collection-search" type="text" placeholder="Find a collection" />
            <div class="savers-bm-picker-options savers-bm-collection-options"></div>
          </div>
          <div class="savers-bm-inline">
            <button class="savers-bm-pill savers-bm-pill-primary savers-bm-suggest-collection" type="button">Suggest collection</button>
          </div>
        </div>
        <div class="savers-bm-ai" hidden>
          <div class="savers-bm-ai-label">Suggested collection</div>
          <div class="savers-bm-ai-copy"></div>
          <div class="savers-bm-inline">
            <button class="savers-bm-pill savers-bm-pill-primary savers-bm-apply-suggestion" type="button">Use suggestion</button>
            <button class="savers-bm-pill savers-bm-dismiss-suggestion" type="button">Dismiss</button>
          </div>
        </div>
        <div class="savers-bm-field">
          <label class="savers-bm-label">Description</label>
          <textarea class="savers-bm-input savers-bm-textarea savers-bm-description" rows="3"></textarea>
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
  let saving = false;
  let tagProposals = [];
  let tagSuggestStatus = null;
  let aiSuggestion = null;
  let collectionTouched = false;
  let flatCollections = [];
  let collectionOptionRows = [];

  const pageTitle = document.title || "";
  const pageUrl = location.href;
  const pageDesc =
    document.querySelector('meta[name="description"], meta[property="og:description"]')
      ?.content?.trim() || "";

  /* Elements */
  const titleInput = root.querySelector(".savers-bm-title-input");
  const tagsInput = root.querySelector(".savers-bm-tags");
  const collSelect = root.querySelector(".savers-bm-collection");
  const collTrigger = root.querySelector(".savers-bm-collection-trigger");
  const collLabel = root.querySelector(".savers-bm-collection-label");
  const collPicker = root.querySelector(".savers-bm-collection-picker");
  const collSearch = root.querySelector(".savers-bm-collection-search");
  const collOptions = root.querySelector(".savers-bm-collection-options");
  const descriptionInput = root.querySelector(".savers-bm-description");
  const suggestTagsBtn = root.querySelector(".savers-bm-suggest-tags");
  const tagProposalsEl = root.querySelector(".savers-bm-tag-proposals");
  const suggestCollectionBtn = root.querySelector(".savers-bm-suggest-collection");
  const aiCard = root.querySelector(".savers-bm-ai");
  const aiCopyEl = root.querySelector(".savers-bm-ai-copy");
  const applySuggestionBtn = root.querySelector(".savers-bm-apply-suggestion");
  const dismissSuggestionBtn = root.querySelector(".savers-bm-dismiss-suggestion");
  const statusEl = root.querySelector(".savers-bm-status");
  const saveBtn = root.querySelector(".savers-bm-save");
  const cancelBtn = root.querySelector(".savers-bm-cancel");
  const backdrop = root.querySelector(".savers-bm-backdrop");

  titleInput.value = pageTitle;
  descriptionInput.value = pageDesc;

  function updateCollectionLabel() {
    const selected = collSelect.options[collSelect.selectedIndex];
    collLabel.textContent = selected ? selected.textContent : "Unsorted";
  }

  function closeCollectionPicker() {
    collPicker.hidden = true;
    collTrigger.setAttribute("aria-expanded", "false");
  }

  function openCollectionPicker() {
    collPicker.hidden = false;
    collTrigger.setAttribute("aria-expanded", "true");
    collSearch.value = "";
    renderCollectionOptions("");
    collSearch.focus();
  }

  function renderCollectionOptions(query) {
    const q = String(query || "").trim().toLowerCase();
    collOptions.innerHTML = "";
    const filtered = collectionOptionRows.filter((row) => !q || row.searchText.includes(q));

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "savers-bm-picker-empty";
      empty.textContent = "No collections found";
      collOptions.appendChild(empty);
      return;
    }

    for (const row of filtered) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "savers-bm-picker-option";
      if (row.value === collSelect.value) btn.classList.add("is-active");
      btn.textContent = row.label;
      btn.addEventListener("click", () => {
        collSelect.value = row.value;
        collectionTouched = true;
        updateCollectionLabel();
        closeCollectionPicker();
      });
      collOptions.appendChild(btn);
    }
  }

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
    let res;
    try {
      res = await fetch(apiBase + path, {
        ...options,
        credentials: token ? "omit" : "include",
        headers,
      });
    } catch (e) {
      throw new Error("Network error — check your connection");
    }
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
      flatCollections = flat;
      if (!flat.length) {
        collSelect.innerHTML = '<option value="">Unsorted</option>';
        collectionOptionRows = [{ value: "", label: "Unsorted", searchText: "unsorted" }];
        updateCollectionLabel();
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
      collectionOptionRows = [{ value: "", label: "Unsorted", searchText: "unsorted" }];
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
        collectionOptionRows.push({
          value: c.id,
          label: indent + c.name,
          searchText: (resolvePath(c.id) + " " + c.name).toLowerCase(),
        });
      }
      updateCollectionLabel();
    } catch {
      collSelect.innerHTML = '<option value="">Unsorted</option>';
      collectionOptionRows = [{ value: "", label: "Unsorted", searchText: "unsorted" }];
      updateCollectionLabel();
    }
  }

  function parseTags(raw) {
    return String(raw || "")
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
  }

  function appendTag(tag) {
    const existing = parseTags(tagsInput.value);
    if (existing.some((t) => t === tag.toLowerCase())) return;
    const trimmed = (tagsInput.value || "").replace(/,\s*$/, "");
    tagsInput.value = trimmed ? trimmed + ", " + tag : tag;
  }

  function renderTagProposals() {
    tagProposalsEl.innerHTML = "";
    if (!tagProposals.length && !tagSuggestStatus) {
      return;
    }

    for (const tag of tagProposals) {
      const wrap = document.createElement("span");
      wrap.className = "savers-bm-tag-proposal";

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "savers-bm-tag-proposal-add";
      addBtn.textContent = "+ " + tag;
      addBtn.addEventListener("click", () => {
        appendTag(tag);
        tagProposals = tagProposals.filter((t) => t !== tag);
        renderTagProposals();
      });
      wrap.appendChild(addBtn);

      const skipBtn = document.createElement("button");
      skipBtn.type = "button";
      skipBtn.className = "savers-bm-tag-proposal-skip";
      skipBtn.textContent = "×";
      skipBtn.addEventListener("click", () => {
        tagProposals = tagProposals.filter((t) => t !== tag);
        renderTagProposals();
      });
      wrap.appendChild(skipBtn);

      tagProposalsEl.appendChild(wrap);
    }

    if (tagSuggestStatus) {
      const status = document.createElement("span");
      status.className = "savers-bm-tag-status";
      status.textContent = tagSuggestStatus;
      tagProposalsEl.appendChild(status);
    }
  }

  async function suggestTags() {
    suggestTagsBtn.disabled = true;
    const previousLabel = suggestTagsBtn.textContent;
    suggestTagsBtn.textContent = "Suggesting…";
    tagSuggestStatus = "Reading the page…";
    renderTagProposals();

    try {
      const data = await apiFetch("/api/suggest-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: pageUrl,
          title: titleInput.value.trim() || pageTitle || null,
          description: descriptionInput.value.trim() || null,
          existing_tags: parseTags(tagsInput.value),
        }),
      });

      const existing = new Set(parseTags(tagsInput.value));
      tagProposals = (Array.isArray(data.tags) ? data.tags : []).filter(
        (t) => !existing.has(String(t).toLowerCase())
      );
      tagSuggestStatus = tagProposals.length ? "Tap a tag to add it." : "No new tags to suggest.";
      renderTagProposals();
    } catch (error) {
      tagProposals = [];
      tagSuggestStatus = token
        ? "Suggestions unavailable right now."
        : "Use a fresh save link from Settings for suggestions.";
      renderTagProposals();
    } finally {
      suggestTagsBtn.disabled = false;
      suggestTagsBtn.textContent = previousLabel;
    }
  }

  function clearSuggestion() {
    aiSuggestion = null;
    aiCopyEl.textContent = "";
    aiCard.hidden = true;
    applySuggestionBtn.textContent = "Use suggestion";
  }

  async function suggestCollection(force = false) {
    if (aiSuggestion && !force) return;

    suggestCollectionBtn.disabled = true;
    setStatus("Suggesting a collection…", "brat");

    try {
      const data = await apiFetch("/api/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: pageUrl,
          title: titleInput.value.trim() || pageTitle,
          description: descriptionInput.value.trim() || null,
          collections: dataCollectionsForCategorize(),
        }),
      });

      aiSuggestion = data?.suggestion || null;
      if (!aiSuggestion) {
        clearSuggestion();
        setStatus("");
        return;
      }

      renderSuggestion();
      if (!collectionTouched && aiSuggestion.collection_id && aiSuggestion.confidence !== "low") {
        collSelect.value = aiSuggestion.collection_id;
      }
      setStatus("");
    } catch (error) {
      clearSuggestion();
      setStatus(
        token
          ? "Collection suggestions unavailable right now."
          : "Use a fresh save link from Settings for suggestions.",
      );
    } finally {
      suggestCollectionBtn.disabled = false;
    }
  }

  function dataCollectionsForCategorize() {
    const byId = new Map(flatCollections.map((item) => [item.id, { ...item, children: [] }]));
    const roots = [];
    for (const collection of byId.values()) {
      if (collection.parent_id && byId.has(collection.parent_id)) {
        byId.get(collection.parent_id).children.push(collection);
      } else {
        roots.push(collection);
      }
    }
    return roots;
  }

  function renderSuggestion() {
    if (!aiSuggestion) {
      clearSuggestion();
      return;
    }

    let copy = "";
    let actionLabel = "Use suggestion";

    if (aiSuggestion.collection_id && aiSuggestion.collection_path) {
      copy = capitalize(aiSuggestion.confidence) + " confidence: " + aiSuggestion.collection_path;
    } else if (aiSuggestion.proposed_collection_name) {
      const parent = aiSuggestion.proposed_parent_collection_path
        ? " under " + aiSuggestion.proposed_parent_collection_path
        : "";
      copy = capitalize(aiSuggestion.confidence) + " confidence: create " + aiSuggestion.proposed_collection_name + parent;
      actionLabel = "Create + use";
    }

    if (!copy) {
      clearSuggestion();
      return;
    }

    aiCopyEl.textContent = copy;
    applySuggestionBtn.textContent = actionLabel;
    aiCard.hidden = false;
  }

  async function applySuggestion() {
    if (!aiSuggestion) return;

    applySuggestionBtn.disabled = true;
    try {
      if (aiSuggestion.collection_id) {
        collSelect.value = aiSuggestion.collection_id;
        collectionTouched = true;
        updateCollectionLabel();
        setStatus("Using suggested collection.", "success");
        return;
      }

      if (aiSuggestion.proposed_collection_name) {
        const data = await apiFetch("/api/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: aiSuggestion.proposed_collection_name,
            parent_id: aiSuggestion.proposed_parent_collection_id || null,
          }),
        });
        const collection = data.collection;
        await loadCollections();
        collSelect.value = collection.id;
        collectionTouched = true;
        updateCollectionLabel();
        setStatus('Created "' + collection.name + '".', "success");
      }
    } catch (error) {
      setStatus("Failed to apply suggestion.", "error");
    } finally {
      applySuggestionBtn.disabled = false;
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
          description: descriptionInput.value.trim() || pageDesc || null,
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
  suggestTagsBtn.addEventListener("click", () => {
    void suggestTags();
  });
  suggestCollectionBtn.addEventListener("click", () => {
    void suggestCollection(true);
  });
  collTrigger.addEventListener("click", (e) => {
    e.preventDefault();
    if (collPicker.hidden) openCollectionPicker();
    else closeCollectionPicker();
  });
  collSearch.addEventListener("input", () => {
    renderCollectionOptions(collSearch.value);
  });
  applySuggestionBtn.addEventListener("click", () => {
    void applySuggestion();
  });
  dismissSuggestionBtn.addEventListener("click", () => {
    clearSuggestion();
    setStatus("Suggestion dismissed.");
  });
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      root.remove();
      return;
    }
    if (!collPicker.hidden && !collPicker.contains(e.target) && e.target !== collTrigger && !collTrigger.contains(e.target)) {
      closeCollectionPicker();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!collPicker.hidden) closeCollectionPicker();
      else root.remove();
    }
  });
  tagsInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSave();
    }
  });
  collSelect.addEventListener("change", () => {
    collectionTouched = true;
    updateCollectionLabel();
  });

  loadCollections()
    .then(async () => {
      await Promise.allSettled([suggestCollection(), suggestTags()]);
    })
    .catch(() => {});

  function capitalize(value) {
    return value ? value[0].toUpperCase() + value.slice(1) : "";
  }
})();
