"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, domainOf, normalizeUrl, screenshotPreviewUrl, tintForDomain } from "@/lib/api";
import type { Bookmark, Collection } from "@/lib/types";
import CollectionPicker from "./CollectionPicker";

type Props = {
  flat: Collection[];
  defaultCollectionId: string | null;
  onCreateCollection: (name: string, parentId: string | null) => Promise<Collection>;
  onClose: () => void;
  onCreated: (b: Bookmark) => void;
};

export default function AddBookmarkModal({
  flat,
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
  const [isDark, setIsDark] = useState(false);
  const lastFetchedRef = useRef("");

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

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div className="title">Add bookmark</div>
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
                  setError(null);
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

          {url && (
            <div className="preview">
              <div className="thumb" style={{ background: tint }}>
                {normalizedUrl && imgOk ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={screenshotPreviewUrl(normalizedUrl)}
                    alt={`Screenshot of ${host || "website"}`}
                    onError={() => setImgOk(false)}
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

          <label className="field">
            <div className="label">Tags <span className="small muted">(comma separated)</span></div>
            <input
              placeholder="design, inspiration"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </label>

          <label className="field">
            <div className="label">Notes</div>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <div className="field">
            <div className="label">Collection</div>
            <CollectionPicker
              flat={flat}
              value={collectionId}
              onChange={setCollectionId}
              onCreateCollection={onCreateCollection}
            />
            <div className="hint small muted">
              Leave as Unsorted — we&rsquo;ll suggest a collection after saving.
            </div>
          </div>

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
        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.28);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 64px 20px;
          z-index: 50;
        }
        .modal {
          width: 520px;
          max-width: 100%;
          max-height: calc(100vh - 128px);
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          border-bottom: 1px solid var(--color-border);
        }
        .title { font-size: 12px; font-weight: 600; }
        .close {
          font-size: 18px;
          color: var(--color-text-muted);
          line-height: 1;
          padding: 0 6px;
        }
        .close:hover { color: var(--color-text); }
        .body {
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
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
        }
      `}</style>
    </div>
  );
}
