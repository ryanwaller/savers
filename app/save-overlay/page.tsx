"use client";

import { useEffect, useMemo, useState } from "react";
import type { Bookmark, Collection } from "@/lib/types";
import { api } from "@/lib/api";
import AddBookmarkModal from "@/app/components/AddBookmarkModal";

function dismiss(type: "close" | "saved" = "close") {
  // Popup (opened by script) — window.close() works
  if (window.opener) {
    window.close();
    return;
  }
  // Iframe fallback (Chrome extension, etc.) — notify parent
  try {
    window.parent.postMessage({ type }, "*");
  } catch {
    window.close();
  }
}

type SaveKind = "bookmark" | "image";

function looksLikeImage(url: string): boolean {
  try {
    const u = new URL(url);
    return /\.(jpe?g|png|gif|webp|heic|heif|svg|bmp|avif)(\?|$|#)/i.test(u.pathname);
  } catch {
    return false;
  }
}

export default function SaveOverlayPage() {
  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const url = searchParams.get("url") ?? "";
  const token = searchParams.get("token") ?? undefined;
  // Explicit override from the bookmarklet, e.g. `?kind=image`. Falls
  // back to URL sniffing when unset.
  const initialKind: SaveKind = useMemo(() => {
    const k = searchParams.get("kind");
    if (k === "image" || k === "bookmark") return k;
    return looksLikeImage(url) ? "image" : "bookmark";
  }, [url, searchParams]);

  const [kind, setKind] = useState<SaveKind>(initialKind);
  const [ready, setReady] = useState(false);
  const [flat, setFlat] = useState<Collection[]>([]);
  const [tree, setTree] = useState<Collection[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [imageCollections, setImageCollections] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  // Image save form state
  const [imgCollectionId, setImgCollectionId] = useState<string | null>(null);
  const [imgSaving, setImgSaving] = useState(false);
  const [imgSaveError, setImgSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      dismiss();
      return;
    }
    Promise.all([
      api.bootstrap(token),
      fetch("/api/image-collections", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { collections: [] }))
        .catch(() => ({ collections: [] })),
    ])
      .then(([data, imgData]) => {
        setFlat(data.flat);
        setTree(data.collections);
        setBookmarks(data.bookmarks);
        setImageCollections(
          ((imgData?.collections ?? []) as Array<{ id: string; name: string }>) || [],
        );
        setReady(true);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
      });
  }, [url, token]);

  async function saveImage() {
    if (!url || imgSaving) return;
    setImgSaving(true);
    setImgSaveError(null);
    try {
      const fd = new FormData();
      fd.append("remote_url", url);
      if (imgCollectionId) fd.append("collection_id", imgCollectionId);
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch("/api/images/upload", {
        method: "POST",
        body: fd,
        headers,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImgSaveError(body?.error || `Save failed (${res.status})`);
        setImgSaving(false);
        return;
      }
      if (body.errors?.length) {
        setImgSaveError(body.errors[0].reason);
        setImgSaving(false);
        return;
      }
      dismiss("saved");
    } catch (e) {
      setImgSaveError(e instanceof Error ? e.message : "Save failed");
      setImgSaving(false);
    }
  }

  if (!url) return null;

  return (
    <div className="overlay-shell">
      {error && <div className="overlay-error">{error}</div>}

      {ready && (
        <>
          {/* Pinned toggle floats above AddBookmarkModal's fixed backdrop
              so it stays visible no matter what we render below. */}
          <div className="overlay-toggle-bar">
            <div className="overlay-toggle">
              <button
                className={`toggle-btn ${kind === "bookmark" ? "on" : ""}`}
                onClick={() => setKind("bookmark")}
              >
                Bookmark
              </button>
              <button
                className={`toggle-btn ${kind === "image" ? "on" : ""}`}
                onClick={() => setKind("image")}
              >
                Image
              </button>
            </div>
          </div>

          {kind === "bookmark" ? (
            <AddBookmarkModal
              existingBookmarks={bookmarks}
              flat={flat}
              tree={tree}
              defaultCollectionId={null}
              defaultUrl={url}
              onCreateCollection={async (name, parentId) => {
                const { collection } = await api.createCollection(name, parentId);
                setFlat((prev) => [...prev, collection]);
                setTree((prev) => [...prev, collection]);
                return collection;
              }}
              onClose={() => dismiss()}
              onCreated={() => {
                dismiss("saved");
              }}
              onFeedCreated={() => dismiss()}
            />
          ) : (
            <div className="image-save">
              <div className="image-save-thumb">
                {looksLikeImage(url) ? (
                  <img src={url} alt="" />
                ) : (
                  <div className="image-save-placeholder">
                    Will fetch hero image from this page
                  </div>
                )}
              </div>
              <div className="image-save-meta">
                <div className="image-save-url" title={url}>{url}</div>
              </div>
              <label className="image-save-field">
                <span>Folder</span>
                <select
                  value={imgCollectionId ?? ""}
                  onChange={(e) => setImgCollectionId(e.target.value || null)}
                >
                  <option value="">Unsorted</option>
                  {imageCollections.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              {imgSaveError && <div className="image-save-error">{imgSaveError}</div>}
              <div className="image-save-actions">
                <button className="btn ghost" onClick={() => dismiss()} disabled={imgSaving}>
                  Cancel
                </button>
                <button
                  className="btn primary"
                  onClick={() => void saveImage()}
                  disabled={imgSaving}
                >
                  {imgSaving ? "Saving…" : "Save image"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <style jsx global>{`
        html, body {
          background: transparent !important;
          overflow: hidden;
        }
        .overlay-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .overlay-error {
          color: #ff8f8f;
          font-size: 12px;
          padding: 24px;
        }
        /* Pinned to the top of the popup, sits above AddBookmarkModal's
           backdrop (z-index 50) so the kind toggle is always reachable. */
        .overlay-toggle-bar {
          position: fixed;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
        }
        .overlay-toggle {
          display: inline-flex;
          gap: 4px;
          padding: 4px;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 999px;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
        }
        .toggle-btn {
          padding: 6px 14px;
          font-size: 12px;
          background: transparent;
          color: var(--color-text-muted);
          border: none;
          border-radius: 999px;
          cursor: pointer;
        }
        .toggle-btn.on {
          background: var(--color-text);
          color: var(--color-bg);
        }

        .image-save {
          width: 100%;
          max-width: 440px;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 14px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
        }
        .image-save-thumb {
          width: 100%;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          max-height: 240px;
        }
        .image-save-thumb img {
          max-width: 100%;
          max-height: 240px;
          object-fit: contain;
        }
        .image-save-placeholder {
          padding: 32px;
          color: var(--color-text-muted);
          font-size: 13px;
        }
        .image-save-url {
          font-size: 11px;
          color: var(--color-text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .image-save-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 12px;
          color: var(--color-text-muted);
        }
        .image-save-field select {
          padding: 8px 10px;
          border: 1px solid var(--color-border);
          border-radius: 8px;
          background: var(--color-bg);
          color: var(--color-text);
          font-size: 13px;
        }
        .image-save-error {
          padding: 8px 10px;
          background: rgba(220, 80, 80, 0.12);
          color: #d96a6a;
          border-radius: 6px;
          font-size: 12px;
        }
        .image-save-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .image-save-actions .btn {
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          border: 1px solid var(--color-border);
          cursor: pointer;
        }
        .image-save-actions .btn.ghost {
          background: transparent;
          color: var(--color-text);
        }
        .image-save-actions .btn.ghost:hover { background: var(--color-bg-hover); }
        .image-save-actions .btn.primary {
          background: var(--color-text);
          color: var(--color-bg);
          border-color: var(--color-text);
        }
        .image-save-actions .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
