"use client";

import { useEffect, useMemo, useState } from "react";
import type { Bookmark, Collection, ImageCollection } from "@/lib/types";
import { api } from "@/lib/api";
import AddBookmarkModal from "@/app/components/AddBookmarkModal";
import CollectionPicker from "@/app/components/CollectionPicker";

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
  // We hold the full `ImageCollection` shape so `CollectionPicker` can render
  // parent/child hierarchy and icons identically to the link-side picker.
  const [imageCollections, setImageCollections] = useState<ImageCollection[]>([]);
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
    // Bookmarklet popups load from a third-party origin, so cookie-based
    // auth may not be present — pass the same bearer token we use for the
    // bootstrap and upload calls so /api/image-collections can identify the
    // user and return their folder list. Without this header the endpoint
    // 401s and the dropdown silently falls back to "Unsorted" only.
    const imgHeaders: Record<string, string> = {};
    if (token) imgHeaders.Authorization = `Bearer ${token}`;
    Promise.all([
      api.bootstrap(token),
      fetch("/api/image-collections", { cache: "no-store", headers: imgHeaders })
        .then((r) => (r.ok ? r.json() : { collections: [] }))
        .catch(() => ({ collections: [] })),
    ])
      .then(([data, imgData]) => {
        setFlat(data.flat);
        setTree(data.collections);
        setBookmarks(data.bookmarks);
        setImageCollections(
          ((imgData?.collections ?? []) as ImageCollection[]) || [],
        );
        setReady(true);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
      });
  }, [url, token]);

  // POSTs to /api/image-collections with the bearer token so the bookmarklet
  // popup (which usually has no session cookie on the third-party origin)
  // can still create folders. Mirrors the bookmark-side onCreateCollection
  // contract — returns the new collection so `CollectionPicker` can select
  // it immediately.
  async function createImageCollection(
    name: string,
    parentId: string | null,
  ): Promise<ImageCollection> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch("/api/image-collections", {
      method: "POST",
      headers,
      body: JSON.stringify({ name, parent_id: parentId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.error || `Create failed (${res.status})`);
    }
    const collection = body.collection as ImageCollection;
    setImageCollections((prev) => [...prev, collection]);
    return collection;
  }

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
            // Image save — same slide-in panel chrome as AddBookmarkModal so
            // the bookmarklet feels like one app regardless of save type.
            <div className="image-backdrop" onClick={() => dismiss()}>
              <div className="image-modal" onClick={(e) => e.stopPropagation()}>
                <div className="image-head">
                  <div className="image-title">Add image</div>
                  <button
                    className="image-close"
                    onClick={() => dismiss()}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>

                <div className="image-body">
                  <div className="image-thumb">
                    {looksLikeImage(url) ? (
                      <img src={url} alt="" />
                    ) : (
                      <div className="image-placeholder">
                        Will fetch hero image from this page
                      </div>
                    )}
                  </div>

                  <div className="image-url" title={url}>{url}</div>

                  <div className="image-field">
                    <div className="image-label">Folder</div>
                    <CollectionPicker
                      flat={imageCollections}
                      value={imgCollectionId}
                      onChange={setImgCollectionId}
                      onCreateCollection={createImageCollection}
                      placeholder="Choose a folder"
                    />
                  </div>

                  {imgSaveError && <div className="image-error">{imgSaveError}</div>}
                </div>

                <div className="image-foot">
                  <button
                    className="btn"
                    onClick={() => dismiss()}
                    disabled={imgSaving}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => void saveImage()}
                    disabled={imgSaving}
                  >
                    {imgSaving ? "Saving…" : "Save image"}
                  </button>
                </div>
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

        /* ------------------------------------------------------------------
           Image save panel — visually identical to AddBookmarkModal so the
           bookmarklet feels like a single app. We duplicate the modal
           chrome locally (instead of importing AddBookmarkModal) because
           the image flow has its own fields and save target.
           ------------------------------------------------------------------ */
        .image-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.28);
          display: flex;
          justify-content: flex-end;
          z-index: 50;
        }
        .image-modal {
          width: 440px;
          max-width: 100%;
          height: 100%;
          background: var(--color-bg);
          border-left: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: imageSlideIn 200ms ease;
          font-family: inherit;
          font-size: 12px;
          line-height: 17px;
          font-weight: 500;
        }
        @keyframes imageSlideIn {
          from { transform: translateX(30px); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        .image-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 54px;
          padding: 0 16px;
          gap: 12px;
          border-bottom: 1px solid var(--color-border);
          box-sizing: border-box;
        }
        .image-title {
          font-size: 12px;
          color: var(--color-text-muted);
        }
        .image-close {
          background: transparent;
          border: none;
          color: var(--color-text);
          font-size: 20px;
          line-height: 1;
          padding: 4px 6px;
          cursor: pointer;
          flex-shrink: 0;
        }
        .image-body {
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          overflow-x: hidden;
          flex: 1;
        }
        .image-thumb {
          width: 100%;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          max-height: 240px;
        }
        .image-thumb img {
          max-width: 100%;
          max-height: 240px;
          object-fit: contain;
        }
        .image-placeholder {
          padding: 32px;
          color: var(--color-text-muted);
          font-size: 12px;
        }
        .image-url {
          font-size: 11px;
          color: var(--color-text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .image-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .image-label {
          font-size: 12px;
          line-height: 17px;
          font-weight: 500;
          color: var(--color-text-muted);
        }
        .image-error {
          padding: 8px 10px;
          background: rgba(220, 80, 80, 0.12);
          color: #d96a6a;
          border-radius: var(--radius-sm);
          font-size: 12px;
        }
        .image-foot {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 10px 14px;
          border-top: 1px solid var(--color-border);
          padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
        }
        .image-foot .btn {
          padding: 6px 14px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--color-border);
          background: var(--color-bg);
          color: var(--color-text);
          font-size: 12px;
          line-height: 17px;
          font-weight: 500;
          cursor: pointer;
        }
        .image-foot .btn:hover:not(:disabled) {
          background: var(--color-bg-hover);
        }
        .image-foot .btn.btn-primary {
          background: var(--color-text);
          color: var(--color-bg);
          border-color: var(--color-text);
        }
        .image-foot .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        @media (max-width: 768px) {
          .image-backdrop {
            padding: 0;
            background: transparent;
          }
          .image-modal {
            width: 100%;
            max-width: 100%;
            height: 100dvh;
            max-height: 100dvh;
            border: 0;
            border-radius: 0;
          }
          .image-head {
            padding: calc(env(safe-area-inset-top, 0px) + 8px) 16px 8px;
            min-height: calc(env(safe-area-inset-top, 0px) + 54px);
            box-sizing: border-box;
          }
          .image-foot {
            flex-wrap: wrap;
          }
          .image-foot .btn {
            flex: 1 1 140px;
            height: 40px;
          }
        }
      `}</style>
    </div>
  );
}
