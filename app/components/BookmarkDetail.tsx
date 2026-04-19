"use client";

import { useEffect, useState } from "react";
import type { Bookmark, Collection } from "@/lib/types";
import { api, domainOf } from "@/lib/api";
import CollectionPicker from "./CollectionPicker";
import ConfirmDialog from "./ConfirmDialog";

type Props = {
  bookmark: Bookmark;
  flat: Collection[];
  tree: Collection[];
  onCreateCollection: (name: string, parentId: string | null) => Promise<Collection>;
  onClose: () => void;
  onSaved: (b: Bookmark) => void;
  onPatched: (b: Bookmark) => void;
  onDeleted: (id: string) => void;
};

export default function BookmarkDetail({
  bookmark,
  flat,
  tree,
  onCreateCollection,
  onClose,
  onSaved,
  onPatched,
  onDeleted,
}: Props) {
  const [title, setTitle] = useState(bookmark.title ?? "");
  const [description, setDescription] = useState(bookmark.description ?? "");
  const [notes, setNotes] = useState(bookmark.notes ?? "");
  const [tags, setTags] = useState<string[]>(bookmark.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [collectionId, setCollectionId] = useState<string | null>(bookmark.collection_id);
  const [saving, setSaving] = useState(false);
  const [tagSaving, setTagSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{
    collection_id: string | null;
    collection_path: string | null;
    proposed_collection_name?: string | null;
    proposed_parent_collection_id?: string | null;
    proposed_parent_collection_path?: string | null;
    confidence: "high" | "medium" | "low";
  } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [aiDismissed, setAiDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setAiSuggestion(null);
    setAiDismissed(false);
  }, [bookmark.id]);

  useEffect(() => {
    if (!tree.length) return;

    let cancelled = false;

    const run = async () => {
      setAiLoading(true);
      try {
        const { suggestion } = await api.categorize({
          url: bookmark.url,
          title: title.trim() || bookmark.title,
          description: description.trim() || bookmark.description,
          collections: tree,
        });

        if (cancelled) return;
        if (
          !suggestion ||
          suggestion.confidence === "low" ||
          (suggestion.collection_id && suggestion.collection_id === collectionId)
        ) {
          setAiSuggestion(null);
          return;
        }

        setAiSuggestion(suggestion);
      } catch {
        if (!cancelled) setAiSuggestion(null);
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    };

    const timer = window.setTimeout(run, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bookmark.url, bookmark.title, bookmark.description, collectionId, description, title, tree]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { bookmark: updated } = await api.updateBookmark(bookmark.id, {
        title: title.trim() || null,
        description: description.trim() || null,
        notes: notes.trim() || null,
        tags,
        collection_id: collectionId,
      });
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function patchTags(nextTags: string[]) {
    setTagSaving(true);
    setError(null);
    try {
      const { bookmark: updated } = await api.updateBookmark(bookmark.id, {
        tags: nextTags,
      });
      onPatched(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save tags");
      setTags(bookmark.tags ?? []);
    } finally {
      setTagSaving(false);
    }
  }

  function buildNextTags(rawValue: string) {
    const next = normalizeTag(rawValue);
    if (!next) return null;
    if (tags.some((tag) => tag.toLowerCase() === next.toLowerCase())) return null;
    return [...tags, next];
  }

  async function commitTag(rawValue: string) {
    const nextTags = buildNextTags(rawValue);
    setTagInput("");
    if (!nextTags) return;
    setTags(nextTags);
    await patchTags(nextTags);
  }

  async function removeTag(tagToRemove: string) {
    const nextTags = tags.filter((tag) => tag !== tagToRemove);
    setTags(nextTags);
    await patchTags(nextTags);
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await api.deleteBookmark(bookmark.id);
      setConfirmDeleteOpen(false);
      onDeleted(bookmark.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
      setDeleting(false);
    }
  }

  async function applyAiSuggestion() {
    if (!aiSuggestion) return;
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

      const { bookmark: updated } = await api.updateBookmark(bookmark.id, {
        collection_id: nextCollectionId,
      });
      setCollectionId(updated.collection_id);
      setAiSuggestion(null);
      setAiDismissed(false);
      onPatched(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply suggestion");
    } finally {
      setAiApplying(false);
    }
  }

  const host = domainOf(bookmark.url);
  const showAiSuggestion = !aiDismissed && !!aiSuggestion;
  const aiTargetLabel = aiSuggestion?.collection_path
    ? aiSuggestion.collection_path
    : aiSuggestion?.proposed_parent_collection_path
      ? `${aiSuggestion.proposed_parent_collection_path} / ${aiSuggestion.proposed_collection_name}`
      : aiSuggestion?.proposed_collection_name;

  return (
    <div className="backdrop" onClick={onClose}>
      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Delete "${bookmark.title ?? host}"?`}
        description="This bookmark will be removed from Savers."
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={doDelete}
      />
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div className="title small muted">Bookmark</div>
          <button className="close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="body">
          <div className="site-row">
            <div className="site-meta">
              {bookmark.favicon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="fav" src={bookmark.favicon} alt="" />
              )}
              <span className="host muted">{host}</span>
            </div>
            <a
              className="site-link"
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open site <span className="ext small muted">↗</span>
            </a>
          </div>

          <label className="field">
            <div className="label">Title</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className="field">
            <div className="label">Description</div>
            <textarea
              rows={3}
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
              onCreateCollection={onCreateCollection}
            />
          </div>

          {showAiSuggestion && aiTargetLabel && (
            <div className="ai-card">
              <div className="ai-title">Suggestion</div>
              <div className="ai-copy">
                <span className="ai-confidence">{capitalize(aiSuggestion.confidence)}</span>
                {": "}
                {aiTargetLabel}
              </div>
              <div className="ai-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => void applyAiSuggestion()}
                  disabled={aiApplying}
                >
                  {aiApplying ? "Applying…" : "Use suggestion"}
                </button>
                <button
                  className="btn"
                  onClick={() => setAiDismissed(true)}
                  disabled={aiApplying}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {aiLoading && !showAiSuggestion && (
            <div className="small muted">Suggesting…</div>
          )}

          <label className="field">
            <div className="label">Tags <span className="small muted">(press Enter)</span></div>
            <div className={`tag-editor ${tagSaving ? "busy" : ""}`}>
              {tags.map((tag) => (
                <span key={tag} className="tag-pill">
                  <span>{tag}</span>
                  <button
                    type="button"
                    className="tag-pill-remove"
                    aria-label={`Remove ${tag}`}
                    onClick={() => void removeTag(tag)}
                    disabled={tagSaving}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                className="tag-input"
                value={tagInput}
                placeholder={tags.length ? "Add tag" : "Add a tag"}
                onChange={(e) => setTagInput(e.target.value)}
                onBlur={() => {
                  if (tagInput.trim()) void commitTag(tagInput);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    void commitTag(tagInput);
                    return;
                  }
                  if (e.key === "Backspace" && !tagInput && tags.length) {
                    e.preventDefault();
                    void removeTag(tags[tags.length - 1]);
                  }
                }}
              />
            </div>
          </label>

          <label className="field">
            <div className="label">Notes</div>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <div className="field">
            <div className="label">Saved</div>
            <div className="small muted">{formatDate(bookmark.created_at)}</div>
          </div>

          {error && <div className="error small">{error}</div>}
        </div>

        <div className="foot">
          <button
            className="btn btn-ghost danger"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={deleting || saving}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <div className="right">
            <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.28);
          display: flex;
          justify-content: flex-end;
          padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
          z-index: 50;
        }
        .panel {
          width: 440px;
          max-width: 100%;
          height: 100%;
          background: var(--color-bg);
          border-left: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          animation: slideIn 180ms ease;
        }
        @media (max-width: 768px) {
          .backdrop {
            padding: 0;
            background: transparent;
          }
          .panel {
            width: 100%;
            max-width: 100%;
            height: 100dvh;
            margin-top: 0;
            border: 0;
            border-radius: 0;
          }
          .body :global(input),
          .body :global(textarea),
          .body :global(select) {
            font-size: 16px;
            padding: 10px 12px;
          }
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
          font-size: 18px;
          color: var(--color-text-muted);
          line-height: 1;
          padding: 0 6px;
        }
        .close:hover { color: var(--color-text); }
        .body {
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          overflow-x: hidden;
          flex: 1;
        }
        .site-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .site-meta {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .site-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--color-text);
          white-space: nowrap;
        }
        .site-link:hover { color: var(--color-text-muted); }
        .host { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fav { width: 12px; height: 12px; border-radius: 2px; flex-shrink: 0; }
        .field { display: flex; flex-direction: column; gap: 5px; }
        .label { font-size: 12px; color: var(--color-text-muted); }
        .ai-card {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius);
          background: var(--color-bg-secondary);
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
        .ai-confidence {
          font-weight: 600;
        }
        .ai-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .tag-editor {
          min-height: 32px;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          padding: 6px 8px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg);
        }
        .tag-editor.busy {
          opacity: 0.8;
        }
        .tag-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 7px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg-secondary);
          color: var(--color-text);
          line-height: 1;
        }
        .tag-pill-remove {
          width: 14px;
          height: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          color: var(--color-text-muted);
          line-height: 1;
        }
        .tag-pill-remove:hover:not(:disabled) {
          color: var(--color-text);
          background: var(--color-bg-hover);
        }
        .tag-input {
          flex: 1 1 96px;
          min-width: 96px;
          padding: 0;
          border: 0;
          background: transparent;
        }
        .tag-input:focus {
          border: 0;
        }
        .error {
          padding: 8px 10px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg-secondary);
        }
        .foot {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          padding: 10px 14px;
          border-top: 1px solid var(--color-border);
          padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
        }
        .right { display: flex; gap: 8px; }
        .danger:hover { background: var(--color-bg-hover); }
        @media (max-width: 768px) {
          .foot,
          .right {
            flex-wrap: wrap;
          }
          .foot :global(.btn),
          .right :global(.btn) {
            flex: 1 1 140px;
            height: 40px;
            font-size: 14px;
          }
        }
      `}</style>
    </div>
  );
}

function normalizeTag(value: string) {
  return value.trim().replace(/^#+/, "").replace(/\s+/g, " ");
}

function capitalize(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : "";
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
