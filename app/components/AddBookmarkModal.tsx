"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  canonicalBookmarkUrl,
  domainOf,
  normalizeUrl,
  previewImageUrl,
  screenshotPreviewUrl,
  tintForDomain,
} from "@/lib/api";
import type { AISuggestion, Bookmark, Collection } from "@/lib/types";
import CollectionPicker from "./CollectionPicker";

type Props = {
  existingBookmarks: Bookmark[];
  flat: Collection[];
  tree: Collection[];
  defaultCollectionId: string | null;
  onCreateCollection: (name: string, parentId: string | null) => Promise<Collection>;
  onClose: () => void;
  onCreated: (b: Bookmark) => void;
};

export default function AddBookmarkModal({
  existingBookmarks,
  flat,
  tree,
  defaultCollectionId,
  onCreateCollection,
  onClose,
  onCreated,
}: Props) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ogImage, setOgImage] = useState<string | null>(null);
  const [favicon, setFavicon] = useState<string | null>(null);
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [collectionId, setCollectionId] = useState<string | null>(defaultCollectionId);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgOk, setImgOk] = useState(true);
  const [previewStage, setPreviewStage] = useState<"microlink" | "fallback" | "fail">("microlink");
  const [isDark, setIsDark] = useState(false);
  const lastFetchedRef = useRef("");

  // Suggestion state
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [aiDismissed, setAiDismissed] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);

  // Inline "+ New collection" state
  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);

  // Tag suggestion state
  const [tagProposals, setTagProposals] = useState<string[]>([]);
  const [tagSuggestLoading, setTagSuggestLoading] = useState(false);
  const [tagSuggestStatus, setTagSuggestStatus] = useState<string | null>(null);

  function parseTags(raw: string): string[] {
    return raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  }

  function appendTag(tag: string) {
    const existing = parseTags(tags);
    if (existing.some((t) => t === tag.toLowerCase())) return;
    const next = existing.length ? `${tags.replace(/,\s*$/, "")}, ${tag}` : tag;
    setTags(next);
  }

  async function runTagSuggest() {
    if (tagSuggestLoading) return;
    const candidateUrl = url.trim();
    if (!candidateUrl) {
      setTagSuggestStatus("Paste a URL first.");
      return;
    }
    setTagSuggestLoading(true);
    setTagSuggestStatus("Reading the page…");
    try {
      const { tags: proposed } = await api.suggestTags({
        url: candidateUrl,
        title: title.trim() || null,
        description: description.trim() || null,
        existing_tags: parseTags(tags),
      });
      const existing = new Set(parseTags(tags));
      const fresh = proposed.filter((t) => !existing.has(t.toLowerCase()));
      setTagProposals(fresh);
      setTagSuggestStatus(fresh.length ? null : "No new tags to suggest.");
    } catch (e) {
      setTagProposals([]);
      setTagSuggestStatus(
        `Couldn't suggest tags: ${e instanceof Error ? e.message : "unknown error"}`
      );
    } finally {
      setTagSuggestLoading(false);
    }
  }

  function acceptProposal(tag: string) {
    appendTag(tag);
    setTagProposals((prev) => prev.filter((t) => t !== tag));
  }

  function dismissProposal(tag: string) {
    setTagProposals((prev) => prev.filter((t) => t !== tag));
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener?.("change", h);
    return () => mq.removeEventListener?.("change", h);
  }, []);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fetchMetadata = useCallback(async (force = false) => {
    const u = normalizeUrl(url);
    if (!u) return;
    try {
      new URL(u);
    } catch {
      return;
    }
    if (!force && lastFetchedRef.current === u) return;
    setFetching(true);
    setError(null);
    try {
      const og = await api.fetchMetadata(u);
      lastFetchedRef.current = u;
      setTitle((current) => current || og.title || "");
      setDescription((current) => current || og.description || "");
      setOgImage(og.og_image);
      setFavicon(og.favicon);
      return og;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch metadata");
    } finally {
      setFetching(false);
    }
  }, [url]);

  useEffect(() => {
    const u = normalizeUrl(url);
    if (!u) return;
    try {
      new URL(u);
    } catch {
      return;
    }
    if (lastFetchedRef.current === u) return;

    const timer = window.setTimeout(() => {
      void fetchMetadata();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [url, fetchMetadata]);

  const runSuggest = useCallback(async () => {
    const u = normalizeUrl(url);
    if (!u) return;
    try {
      new URL(u);
    } catch {
      return;
    }
    setAiLoading(true);
    setAiStatus("Suggesting a collection…");
    try {
      const { suggestion } = await api.categorize({
        url: u,
        title: title.trim() || null,
        description: description.trim() || null,
        collections: tree,
      });
      if (!suggestion || suggestion.confidence === "low") {
        setAiSuggestion(null);
        setAiStatus("No clear suggestion.");
        return;
      }
      if (suggestion.collection_id && suggestion.collection_id === collectionId) {
        setAiSuggestion(null);
        setAiStatus("Already in the suggested collection.");
        return;
      }
      setAiSuggestion(suggestion);
      setAiDismissed(false);
      setAiStatus("Suggestion ready.");
    } catch (e) {
      setAiSuggestion(null);
      setAiStatus(
        `Suggestion failed: ${e instanceof Error ? e.message : "unknown error"}`
      );
    } finally {
      setAiLoading(false);
    }
  }, [url, title, description, tree, collectionId]);

  async function applySuggestion() {
    if (!aiSuggestion) return;
    const u = normalizeUrl(url);
    if (!u) {
      setError("URL is required");
      return;
    }
    try {
      new URL(u);
    } catch {
      setError("Enter a valid URL");
      return;
    }
    setAiApplying(true);
    setError(null);
    try {
      let nextCollectionId = aiSuggestion.collection_id;

      if (!nextCollectionId && aiSuggestion.proposed_collection_name) {
        const created = await onCreateCollection(
          aiSuggestion.proposed_collection_name,
          aiSuggestion.proposed_parent_collection_id ?? null
        );
        nextCollectionId = created.id;
      }

      if (!nextCollectionId) return;

      // Ensure metadata is in-hand before saving, so the bookmark gets a preview
      // even if the user accepts the suggestion before the debounce fires.
      const og =
        lastFetchedRef.current === u ? null : await fetchMetadata(true);

      const tagArray = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const { bookmark } = await api.createBookmark({
        url: u,
        title: title.trim() || og?.title || null,
        description: description.trim() || og?.description || null,
        og_image: ogImage ?? og?.og_image ?? null,
        favicon: favicon ?? og?.favicon ?? null,
        tags: tagArray,
        notes: notes.trim() || null,
        collection_id: nextCollectionId,
      });

      // Close the modal — bookmark is safely persisted in the suggested collection.
      onCreated(bookmark);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply suggestion");
      setAiApplying(false);
    }
  }

  async function createInlineCollection() {
    const name = newCollectionName.trim();
    if (!name) return;
    setCreatingCollection(true);
    setError(null);
    try {
      const created = await onCreateCollection(name, null);
      setCollectionId(created.id);
      setNewCollectionName("");
      setShowCreateCollection(false);
      setAiStatus(`Created ${created.name}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create collection");
    } finally {
      setCreatingCollection(false);
    }
  }

  async function handleSave() {
    const u = normalizeUrl(url);
    if (!u) {
      setError("URL is required");
      return;
    }
    try {
      new URL(u);
    } catch {
      setError("Enter a valid URL");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const og =
        lastFetchedRef.current === u
          ? null
          : await fetchMetadata(true);

      const tagArray = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const { bookmark } = await api.createBookmark({
        url: u,
        title: title.trim() || og?.title || null,
        description: description.trim() || og?.description || null,
        og_image: ogImage ?? og?.og_image ?? null,
        favicon: favicon ?? og?.favicon ?? null,
        tags: tagArray,
        notes: notes.trim() || null,
        collection_id: collectionId,
      });

      // Close the modal immediately — parent kicks off categorize in the background.
      onCreated(bookmark);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  }

  const normalizedUrl = url.trim() ? normalizeUrl(url) : "";
  const host = normalizedUrl ? domainOf(normalizedUrl) : "";
  const tint = normalizedUrl ? tintForDomain(normalizedUrl, isDark) : "var(--color-bg-secondary)";
  const duplicateBookmarks = useMemo(() => {
    if (!normalizedUrl) return [];
    const canonical = canonicalBookmarkUrl(normalizedUrl);
    return existingBookmarks.filter((bookmark) => canonicalBookmarkUrl(bookmark.url) === canonical);
  }, [existingBookmarks, normalizedUrl]);

  const showAiSuggestion = !aiDismissed && !!aiSuggestion;
  const aiTargetLabel = aiSuggestion?.collection_path
    ? aiSuggestion.collection_path
    : aiSuggestion?.proposed_parent_collection_path
      ? `${aiSuggestion.proposed_parent_collection_path} / ${aiSuggestion.proposed_collection_name}`
      : aiSuggestion?.proposed_collection_name;

  const urlReady = normalizedUrl && (() => {
    try { new URL(normalizedUrl); return true; } catch { return false; }
  })();
  const microlinkPreviewSrc = urlReady ? screenshotPreviewUrl(normalizedUrl) : null;
  const fallbackPreviewSrc = urlReady
    ? previewImageUrl(normalizedUrl, {
        ogImage,
        favicon,
      })
    : null;
  const previewSrc = previewStage === "microlink" ? microlinkPreviewSrc : fallbackPreviewSrc;

  useEffect(() => {
    setImgOk(true);
    setPreviewStage("microlink");
  }, [microlinkPreviewSrc, fallbackPreviewSrc]);

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div className="title small muted">Add bookmark</div>
          <button className="close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="body">
          <label className="field">
            <div className="label">URL</div>
            <input
              autoFocus
              placeholder="https://…"
              value={url}
              onChange={(e) => {
                const next = e.target.value;
                const nextNormalized = normalizeUrl(next);
                if (nextNormalized !== lastFetchedRef.current) {
                  lastFetchedRef.current = "";
                  setTitle("");
                  setDescription("");
                  setOgImage(null);
                  setFavicon(null);
                  setImgOk(true);
                  setPreviewStage("microlink");
                  setError(null);
                  setAiSuggestion(null);
                  setAiDismissed(false);
                  setAiStatus(null);
                }
                setUrl(next);
              }}
              onBlur={() => {
                void fetchMetadata();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  fetchMetadata();
                }
              }}
            />
            <div className="hint small muted">
              {fetching ? "Fetching preview…" : "Press Enter or Tab to fetch preview."}
            </div>
          </label>

          {duplicateBookmarks.length > 0 && (
            <div className="duplicate-card">
              <div className="duplicate-title">
                Duplicate warning
              </div>
              <div className="duplicate-copy">
                {duplicateBookmarks.length === 1
                  ? "This page is already saved once."
                  : `This page is already saved ${duplicateBookmarks.length} times.`}
              </div>
              <div className="duplicate-list small muted">
                {duplicateBookmarks.slice(0, 3).map((bookmark) => (
                  <div key={bookmark.id} className="duplicate-item">
                    {bookmark.title || domainOf(bookmark.url)}
                  </div>
                ))}
                {duplicateBookmarks.length > 3 && (
                  <div className="duplicate-item">
                    +{duplicateBookmarks.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )}

          {url && (
            <div className="preview">
              <div className="thumb" style={{ background: tint }}>
                {normalizedUrl && imgOk ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewSrc ?? ""}
                    alt={`Screenshot of ${host || "website"}`}
                    onError={() => {
                      if (previewStage === "microlink") {
                        setPreviewStage("fallback");
                        return;
                      }
                      setImgOk(false);
                      setPreviewStage("fail");
                    }}
                  />
                ) : (
                  <span className="thumb-label small muted">Preview unavailable</span>
                )}
              </div>
              <div className="preview-meta">
                <div className="preview-title">{title || host || "Untitled"}</div>
                <div className="preview-host small muted">
                  {favicon && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="fav" src={favicon} alt="" />
                  )}
                  {host}
                </div>
              </div>
            </div>
          )}

          <label className="field">
            <div className="label">Title</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className="field">
            <div className="label">Description</div>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div className="field">
            <div className="label">Collection</div>
            <CollectionPicker
              flat={flat}
              value={collectionId}
              onChange={setCollectionId}
            />

            {showAiSuggestion && aiTargetLabel && (
              <div className="ai-card">
                <div className="ai-title">Suggestion</div>
                <div className="ai-copy">
                  <span className="ai-confidence">{capitalize(aiSuggestion!.confidence)}</span>
                  {": "}
                  {aiTargetLabel}
                </div>
                <div className="ai-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void applySuggestion()}
                    disabled={aiApplying}
                  >
                    {aiApplying ? "Applying…" : "Use suggestion"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setAiDismissed(true);
                      setAiStatus("Suggestion dismissed.");
                    }}
                    disabled={aiApplying}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {aiStatus && <div className="ai-status small muted">{aiStatus}</div>}

            <div className="inline-actions">
              <button
                type="button"
                className="btn btn-small"
                onClick={() => void runSuggest()}
                disabled={!urlReady || aiLoading}
              >
                {aiLoading ? "Suggesting…" : "Suggest"}
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setShowCreateCollection((v) => !v);
                  setNewCollectionName("");
                }}
                disabled={creatingCollection}
              >
                + New collection
              </button>
            </div>

            {showCreateCollection && (
              <div className="create-wrap">
                <input
                  autoFocus
                  placeholder="Collection name"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void createInlineCollection();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setShowCreateCollection(false);
                      setNewCollectionName("");
                    }
                  }}
                />
                <div className="inline-actions">
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => void createInlineCollection()}
                    disabled={creatingCollection || !newCollectionName.trim()}
                  >
                    {creatingCollection ? "Creating…" : "Create"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-small btn-ghost"
                    onClick={() => {
                      setShowCreateCollection(false);
                      setNewCollectionName("");
                    }}
                    disabled={creatingCollection}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <label className="field">
            <div className="label">Tags <span className="small muted">(comma separated)</span></div>
            <input
              placeholder="design, inspiration"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />

            <div className="ai-actions">
              <button
                type="button"
                className="btn btn-small"
                onClick={(event) => {
                  event.preventDefault();
                  void runTagSuggest();
                }}
                disabled={tagSuggestLoading || !url.trim()}
                title={
                  url.trim()
                    ? "Suggest tags from the page content"
                    : "Add a URL to suggest tags"
                }
              >
                {tagSuggestLoading ? "Suggesting…" : "Suggest"}
              </button>
            </div>

            {(tagProposals.length > 0 || tagSuggestStatus) && (
              <div className="tag-proposals">
                {tagProposals.map((tag) => (
                  <span key={tag} className="tag-proposal">
                    <button
                      type="button"
                      className="tag-proposal-add"
                      onClick={(event) => {
                        event.preventDefault();
                        acceptProposal(tag);
                      }}
                      title={`Add "${tag}"`}
                    >
                      + {tag}
                    </button>
                    <button
                      type="button"
                      className="tag-proposal-skip"
                      aria-label={`Skip ${tag}`}
                      onClick={(event) => {
                        event.preventDefault();
                        dismissProposal(tag);
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {tagSuggestStatus && (
                  <span className="tag-proposals-status small muted">{tagSuggestStatus}</span>
                )}
              </div>
            )}
          </label>

          <label className="field">
            <div className="label">Notes</div>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {error && <div className="error small">{error}</div>}
        </div>

        <div className="foot">
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !url.trim()}>
            {saving ? "Saving…" : "Save bookmark"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .tag-proposals {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          padding: 4px 0 2px;
        }
        .tag-proposal {
          display: inline-flex;
          align-items: stretch;
          border: 1px dashed var(--color-border-strong);
          border-radius: 999px;
          background: var(--color-bg-secondary);
          overflow: hidden;
          line-height: 1;
        }
        .tag-proposal-add {
          padding: 4px 8px;
          font-size: 12px;
          color: var(--color-text);
          line-height: 1;
        }
        .tag-proposal-add:hover {
          background: var(--color-bg-hover);
        }
        .tag-proposal-skip {
          padding: 0 7px;
          font-size: 12px;
          color: var(--color-text-muted);
          border-left: 1px dashed var(--color-border-strong);
        }
        .tag-proposal-skip:hover {
          background: var(--color-bg-hover);
          color: var(--color-text);
        }
        .tag-proposals-status {
          padding: 2px 4px;
        }
        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.28);
          display: flex;
          justify-content: flex-end;
          padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
          z-index: 50;
        }
        .modal {
          width: 440px;
          max-width: 100%;
          height: 100%;
          background: var(--color-bg);
          border-left: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: slideIn 200ms ease;
        }
        @keyframes slideIn {
          from { transform: translateX(30px); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 54px;
          padding: 0 16px;
          border-bottom: 1px solid var(--color-border);
          box-sizing: border-box;
        }
        .title { font-size: 12px; }
        .close {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg);
          color: var(--color-text);
          font-size: 16px;
          line-height: 1;
          flex-shrink: 0;
        }
        .close:hover { border-color: var(--color-border-strong); }
        .body {
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          overflow-x: hidden;
          flex: 1;
        }
        .field { display: flex; flex-direction: column; gap: 5px; }
        .label { font-size: 12px; color: var(--color-text-muted); }
        .hint { margin-top: 2px; }
        .preview {
          display: flex;
          gap: 10px;
          padding: 8px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius);
          align-items: center;
        }
        .thumb {
          width: 180px;
          aspect-ratio: 16 / 10;
          border-radius: var(--radius-sm);
          overflow: hidden;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--color-border);
        }
        .thumb :global(img) {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .thumb-label { padding: 0 10px; text-align: center; }
        .preview-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
          flex: 1;
        }
        .preview-title {
          font-size: 12px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .preview-host {
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
        }
        .fav { width: 12px; height: 12px; border-radius: 2px; }
        .ai-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
          padding: 10px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius);
          background: var(--color-bg-secondary);
        }
        .duplicate-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 10px 12px;
          border: 1px solid #ff8f8f;
          border-radius: var(--radius);
          background: rgba(255, 90, 90, 0.08);
        }
        .duplicate-title {
          font-size: 12px;
          color: #ff8f8f;
          font-weight: 600;
        }
        .duplicate-copy {
          font-size: 12px;
          color: #ff8f8f;
        }
        .duplicate-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          color: #ffb4b4;
        }
        .duplicate-item {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ai-title {
          font-size: 12px;
          color: var(--color-text-muted);
        }
        .ai-copy {
          font-size: 12px;
          color: var(--color-text);
          line-height: 1.45;
        }
        .ai-confidence { font-weight: 600; }
        .ai-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ai-status {
          margin-top: 6px;
        }
        .inline-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 6px;
        }
        .btn-small {
          height: 26px;
          padding: 0 10px;
          font-size: 12px;
        }
        .create-wrap {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 8px;
          padding: 8px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg-secondary);
        }
        .error {
          padding: 8px 10px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg-secondary);
          color: var(--color-text);
        }
        .foot {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 10px 14px;
          border-top: 1px solid var(--color-border);
          padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
        }
        @media (max-width: 768px) {
          .backdrop {
            padding: 0;
            background: transparent;
          }
          .modal {
            width: 100%;
            max-width: 100%;
            height: 100dvh;
            max-height: 100dvh;
            border: 0;
            border-radius: 0;
          }
          .head {
            padding: calc(env(safe-area-inset-top, 0px) + 8px) 12px 8px;
            height: auto;
            min-height: 48px;
          }
          .body :global(input),
          .body :global(textarea),
          .body :global(select) {
            font-size: 13px;
            padding: 8px 10px;
          }
          .btn-small {
            height: 32px;
            font-size: 13px;
          }
          .preview {
            flex-direction: column;
            align-items: stretch;
          }
          .thumb {
            width: 100%;
          }
          .foot {
            flex-wrap: wrap;
          }
          .foot :global(.btn) {
            flex: 1 1 140px;
            height: 40px;
            font-size: 13px;
          }
        }
      `}</style>
    </div>
  );
}

function capitalize(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : "";
}
