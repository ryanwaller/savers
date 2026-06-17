"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ImageRow } from "./ImageGrid";

type ImageCollection = {
  id: string;
  name: string;
  parent_id: string | null;
  icon?: string | null;
};

type Props = {
  image: ImageRow & {
    description?: string | null;
    notes?: string | null;
    tags?: string[];
    original_filename?: string | null;
    original_size_bytes?: number | null;
    mime_type?: string | null;
    taken_at?: string | null;
    camera_make?: string | null;
    camera_model?: string | null;
    collection_id?: string | null;
    ai_processed_at?: string | null;
    ai_failed_at?: string | null;
  };
  imageCollections: ImageCollection[];
  onClose: () => void;
  onPatched: (updated: PatchedImage) => void;
  onDeleted: (id: string) => void;
};

type PatchedImage = ImageRow & Record<string, unknown>;

function formatBytes(n: number | null | undefined): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function filenameWithoutExt(name: string | null | undefined): string {
  if (!name) return "";
  return name.replace(/\.[^.]+$/, "");
}

/**
 * Right-side editing panel for an image. Mirrors the shape of the
 * BookmarkDetail overlay so the muscle memory carries over: top region
 * shows the asset and its metadata, the form lives below.
 */
export default function ImageDetail({
  image,
  imageCollections,
  onClose,
  onPatched,
  onDeleted,
}: Props) {
  const [title, setTitle] = useState(image.title ?? "");
  const [description, setDescription] = useState(image.description ?? "");
  const [notes, setNotes] = useState(image.notes ?? "");
  const [tags, setTags] = useState<string[]>(image.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [collectionId, setCollectionId] = useState<string | null>(image.collection_id ?? null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reenriching, setReenriching] = useState(false);
  const [regeneratingPreview, setRegeneratingPreview] = useState(false);

  // When the user picks a different image in the slideshow, reset state.
  useEffect(() => {
    setTitle(image.title ?? "");
    setDescription(image.description ?? "");
    setNotes(image.notes ?? "");
    setTags(image.tags ?? []);
    setTagInput("");
    setCollectionId(image.collection_id ?? null);
    setError(null);
    setConfirmDelete(false);
  }, [image.id, image.title, image.description, image.notes, image.tags, image.collection_id]);

  // Close on Esc unless we're confirming a delete.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !confirmDelete) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, confirmDelete]);

  const patchAndPropagate = useCallback(
    async (updates: Record<string, unknown>) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/images/${image.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body?.error || `Save failed (${res.status})`);
          return;
        }
        onPatched(body.image as PatchedImage);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [image.id, onPatched],
  );

  const commitTitle = useCallback(() => {
    if ((title ?? "") === (image.title ?? "")) return;
    void patchAndPropagate({ title });
  }, [title, image.title, patchAndPropagate]);

  const commitDescription = useCallback(() => {
    if ((description ?? "") === (image.description ?? "")) return;
    void patchAndPropagate({ description });
  }, [description, image.description, patchAndPropagate]);

  const commitNotes = useCallback(() => {
    if ((notes ?? "") === (image.notes ?? "")) return;
    void patchAndPropagate({ notes });
  }, [notes, image.notes, patchAndPropagate]);

  const addTag = useCallback(() => {
    const next = tagInput.trim().toLowerCase();
    if (!next) return;
    if (tags.includes(next)) {
      setTagInput("");
      return;
    }
    const updated = [...tags, next];
    setTags(updated);
    setTagInput("");
    void patchAndPropagate({ tags: updated });
  }, [tagInput, tags, patchAndPropagate]);

  const removeTag = useCallback(
    (t: string) => {
      const updated = tags.filter((x) => x !== t);
      setTags(updated);
      void patchAndPropagate({ tags: updated });
    },
    [tags, patchAndPropagate],
  );

  const moveToCollection = useCallback(
    (newId: string | null) => {
      setCollectionId(newId);
      void patchAndPropagate({ collection_id: newId });
    },
    [patchAndPropagate],
  );

  const revertTitleToFilename = useCallback(() => {
    const base = filenameWithoutExt(image.original_filename);
    if (!base) return;
    setTitle(base);
    void patchAndPropagate({ title: base });
  }, [image.original_filename, patchAndPropagate]);

  const handleSuggestAi = useCallback(async () => {
    setReenriching(true);
    setError(null);
    try {
      const res = await fetch(`/api/images/${image.id}/reenrich`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (body?.image) {
        onPatched(body.image as PatchedImage);
      }
      if (!res.ok) {
        setError(body?.error || `AI suggest failed (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI suggest failed");
    } finally {
      setReenriching(false);
    }
  }, [image.id, onPatched]);

  const handleRegeneratePreview = useCallback(async () => {
    setRegeneratingPreview(true);
    setError(null);
    try {
      const res = await fetch(`/api/images/${image.id}/regenerate-preview`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || `Regenerate failed (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setRegeneratingPreview(false);
    }
  }, [image.id]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/images/${image.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || `Delete failed (${res.status})`);
        setDeleting(false);
        return;
      }
      onDeleted(image.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }, [image.id, onDeleted]);

  const dimensions = useMemo(() => {
    if (image.width && image.height) return `${image.width} × ${image.height}`;
    return "—";
  }, [image.width, image.height]);

  return (
    <div className="img-detail-backdrop" onClick={onClose}>
      <aside
        className="img-detail-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="head">
          <div className="head-title">
            {saving ? "Saving…" : "Edit image"}
          </div>
          <button className="close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="body">
          {image.preview_url && (
            <div className="preview-thumb">
              <img src={image.preview_url} alt="" draggable={false} />
            </div>
          )}

          {/* Regenerate-preview affordance only relevant for non-raster
              uploads (PDF/EPS/SVG) — the raster path generates inline at
              upload time and has no worker job to re-enqueue. */}
          {image.file_kind !== "image" && (
            <button
              type="button"
              className="link-btn"
              style={{ alignSelf: "flex-start", marginTop: "-6px" }}
              onClick={() => void handleRegeneratePreview()}
              disabled={regeneratingPreview}
              title="Re-run the worker job that rasterises this file into a preview"
            >
              {regeneratingPreview ? "Queued…" : "Regenerate preview"}
            </button>
          )}

          {error && <div className="err">{error}</div>}

          <label className="field">
            <span className="label-row">
              <span>Title</span>
              <span className="label-actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => void handleSuggestAi()}
                  disabled={reenriching}
                  title="Ask AI to suggest a title, description, and tags"
                >
                  {reenriching ? "Suggesting…" : "Suggest with AI"}
                </button>
                {image.original_filename && (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={revertTitleToFilename}
                    title="Use the original filename as the title"
                  >
                    Use filename
                  </button>
                )}
              </span>
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder="Title"
            />
          </label>

          {image.ai_failed_at && !image.ai_processed_at && (
            <div className="ai-note">AI title didn&apos;t land on import. Try Suggest with AI.</div>
          )}

          <label className="field">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={commitDescription}
              placeholder="A short description of the image"
              rows={3}
            />
          </label>

          <div className="field">
            <span>Tags</span>
            <div className="tag-row">
              {tags.map((t) => (
                <span key={t} className="tag-chip">
                  {t}
                  <button
                    className="tag-x"
                    onClick={() => removeTag(t)}
                    aria-label={`Remove tag ${t}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                className="tag-input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag();
                  } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
                    removeTag(tags[tags.length - 1]);
                  }
                }}
                onBlur={addTag}
                placeholder={tags.length === 0 ? "Add a tag and press Enter" : "Add another"}
              />
            </div>
          </div>

          <div className="field">
            <span>Folder</span>
            <select
              value={collectionId ?? ""}
              onChange={(e) => moveToCollection(e.target.value || null)}
            >
              <option value="">Unsorted</option>
              {imageCollections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <label className="field">
            <span>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={commitNotes}
              placeholder="Private notes — only you see these"
              rows={2}
            />
          </label>

          <div className="meta-block">
            <div className="meta-row">
              <span className="meta-key">File</span>
              <span className="meta-val">
                {image.original_filename || "—"}
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-key">Type</span>
              <span className="meta-val">{image.mime_type || image.file_kind || "—"}</span>
            </div>
            <div className="meta-row">
              <span className="meta-key">Dimensions</span>
              <span className="meta-val">{dimensions}</span>
            </div>
            <div className="meta-row">
              <span className="meta-key">Size</span>
              <span className="meta-val">{formatBytes(image.original_size_bytes)}</span>
            </div>
            {image.taken_at && (
              <div className="meta-row">
                <span className="meta-key">Taken</span>
                <span className="meta-val">{formatDate(image.taken_at)}</span>
              </div>
            )}
            {(image.camera_make || image.camera_model) && (
              <div className="meta-row">
                <span className="meta-key">Camera</span>
                <span className="meta-val">
                  {[image.camera_make, image.camera_model].filter(Boolean).join(" ")}
                </span>
              </div>
            )}
            {image.source_url && (
              <div className="meta-row">
                <span className="meta-key">Source</span>
                <span className="meta-val">
                  <a href={image.source_url} target="_blank" rel="noopener noreferrer">
                    {image.source_url}
                  </a>
                </span>
              </div>
            )}
            <div className="meta-row">
              <span className="meta-key">Added</span>
              <span className="meta-val">{formatDate(image.created_at)}</span>
            </div>
          </div>

          <div className="danger-zone">
            {confirmDelete ? (
              <div className="confirm">
                <span>Delete this image?</span>
                <div className="confirm-btns">
                  <button
                    className="btn ghost"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn danger"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="btn ghost danger-trigger"
                onClick={() => setConfirmDelete(true)}
              >
                Delete image
              </button>
            )}
          </div>
        </div>
      </aside>

      <style jsx>{`
        .img-detail-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          z-index: 250;
          display: flex;
          justify-content: flex-end;
        }
        .img-detail-panel {
          width: 100%;
          max-width: 440px;
          height: 100%;
          background: var(--color-bg);
          color: var(--color-text);
          border-left: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          box-shadow: -12px 0 30px rgba(0, 0, 0, 0.25);
        }
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid var(--color-border);
        }
        .head-title { font-size: 14px; font-weight: 600; }
        .close {
          width: 28px;
          height: 28px;
          border-radius: 14px;
          border: 1px solid var(--color-border);
          background: transparent;
          color: var(--color-text);
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
        }
        .close:hover { background: var(--color-bg-hover); }

        .body {
          flex: 1 1 auto;
          overflow-y: auto;
          padding: 16px 18px 24px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .err {
          padding: 8px 10px;
          background: rgba(220, 80, 80, 0.12);
          color: #d96a6a;
          border-radius: 6px;
          font-size: 12px;
        }
        .preview-thumb {
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
        .preview-thumb img {
          max-width: 100%;
          max-height: 240px;
          object-fit: contain;
          display: block;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
          color: var(--color-text-muted);
        }
        .field > span,
        .label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .label-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .field input[type="text"],
        .field textarea,
        .field select {
          width: 100%;
          font-size: 13px;
          color: var(--color-text);
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 6px;
          padding: 8px 10px;
          font-family: inherit;
          box-sizing: border-box;
        }
        .field input:focus,
        .field textarea:focus,
        .field select:focus {
          outline: none;
          border-color: var(--color-border-strong);
        }
        .field textarea { resize: vertical; }
        .link-btn {
          background: transparent;
          color: var(--color-text-muted);
          border: none;
          font-size: 11px;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
        }
        .link-btn:hover { color: var(--color-text); }
        .link-btn:disabled {
          opacity: 0.55;
          cursor: default;
        }
        .ai-note {
          margin-top: -4px;
          font-size: 11px;
          line-height: 1.4;
          color: var(--color-text-muted);
        }

        .tag-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding: 6px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg);
        }
        .tag-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 6px 3px 10px;
          font-size: 12px;
          color: var(--color-text);
          background: var(--color-bg-hover);
          border-radius: 999px;
        }
        .tag-x {
          background: transparent;
          color: var(--color-text-muted);
          border: none;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          padding: 0 4px;
        }
        .tag-x:hover { color: var(--color-text); }
        .tag-input {
          flex: 1 1 80px;
          min-width: 80px;
          border: none !important;
          padding: 0 6px !important;
          background: transparent !important;
        }
        .tag-input:focus { outline: none; }

        .meta-block {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
          padding: 12px;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: 8px;
        }
        .meta-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }
        .meta-key {
          color: var(--color-text-muted);
          flex-shrink: 0;
        }
        .meta-val {
          color: var(--color-text);
          text-align: right;
          word-break: break-word;
        }
        .meta-val a {
          color: var(--color-text);
          text-decoration: underline;
        }

        .danger-zone {
          margin-top: 6px;
          padding-top: 12px;
          border-top: 1px solid var(--color-border);
        }
        .danger-trigger {
          color: #d96a6a;
        }
        .confirm {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 10px;
          background: rgba(220, 80, 80, 0.08);
          border: 1px solid rgba(220, 80, 80, 0.3);
          border-radius: 8px;
          color: var(--color-text);
          font-size: 13px;
        }
        .confirm-btns { display: flex; gap: 8px; justify-content: flex-end; }
        .btn {
          padding: 7px 14px;
          font-size: 13px;
          border-radius: 6px;
          border: 1px solid var(--color-border);
          background: var(--color-bg);
          color: var(--color-text);
          cursor: pointer;
        }
        .btn.ghost { background: transparent; }
        .btn.ghost:hover { background: var(--color-bg-hover); }
        .btn.danger {
          background: #c04040;
          border-color: #c04040;
          color: #fff;
        }
        .btn.danger:hover { background: #a83838; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }

        @media (max-width: 768px) {
          .img-detail-panel { max-width: 100%; }
        }
      `}</style>
    </div>
  );
}
