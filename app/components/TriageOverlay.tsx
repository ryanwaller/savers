"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, storedPreviewUrl } from "@/lib/api";
import type { AISuggestion, Bookmark, Collection } from "@/lib/types";
import CollectionIcon from "./CollectionIcon";

type Step =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "empty" }
  | { kind: "error"; message: string };

type UndoState = {
  bookmark: Bookmark;
  previousCollectionId: string | null;
  message: string;
} | null;

const RECENT_COLLECTION_LIMIT = 4;
const TOAST_TIMEOUT_MS = 5000;

type Props = {
  open: boolean;
  onClose: () => void;
  /**
   * Notifies the parent that a bookmark moved/deleted, so it can refresh
   * its local state if it wants. Called after each mutation succeeds.
   */
  onMutated?: () => void;
  allTags?: string[];
};

export default function TriageOverlay({ open, onClose, onMutated, allTags = [] }: Props) {
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [queue, setQueue] = useState<Bookmark[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [flat, setFlat] = useState<Collection[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState<AISuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef("");
  const [tags, setTags] = useState<string[]>([]);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [undo, setUndo] = useState<UndoState>(null);
  const undoTimerRef = useRef<number | null>(null);

  const current = queue[0] ?? null;

  const loadAll = useCallback(async () => {
    setStep({ kind: "loading" });
    try {
      const [{ collections: tree, flat: flatList }, { bookmarks }] =
        await Promise.all([
          api.listCollections(),
          api.listBookmarks({ collection_id: null }),
        ]);

      setCollections(tree);
      setFlat(flatList);
      const unsorted = bookmarks.filter((b) => b.collection_id === null);
      setQueue(unsorted);
      setStep(unsorted.length === 0 ? { kind: "empty" } : { kind: "ready" });
    } catch (e) {
      setStep({
        kind: "error",
        message: e instanceof Error ? e.message : "Couldn't load triage queue.",
      });
    }
  }, []);

  // Reload whenever the overlay opens.
  useEffect(() => {
    if (open) void loadAll();
  }, [open, loadAll]);

  // Reset per-bookmark state and ask the AI when the head of the queue moves.
  useEffect(() => {
    setTags(current?.tags ?? []);
    setTagInput("");
    tagInputRef.current = "";
    setSuggestion(null);
    setSuggestedTags([]);
    setSelectedCollection(null);
    if (!current || !open) return;
    let cancelled = false;
    setAiLoading(true);
    void api
      .categorize({
        url: current.url,
        title: current.title,
        description: current.description,
        collections,
      })
      .then((res) => {
        if (!cancelled) setSuggestion(res.suggestion ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAiLoading(false);
      });
    void api
      .suggestTags({
        url: current.url,
        title: current.title,
        description: current.description,
        existing_tags: current.tags ?? [],
      })
      .then((res) => {
        if (!cancelled) setSuggestedTags(res.tags ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [current?.id, collections, open]);

  const collectionsById = useMemo(() => {
    const map = new Map<string, Collection>();
    for (const c of flat) map.set(c.id, c);
    return map;
  }, [flat]);

  function pathFor(id: string | null): string | null {
    if (!id) return null;
    const segments: string[] = [];
    let cur = collectionsById.get(id);
    let safety = 0;
    while (cur && safety < 30) {
      segments.unshift(cur.name);
      cur = cur.parent_id ? collectionsById.get(cur.parent_id) : undefined;
      safety += 1;
    }
    return segments.length ? segments.join(" / ") : null;
  }

  const choiceCollections = useMemo<Collection[]>(() => {
    const ids = new Set<string>();
    const out: Collection[] = [];
    if (suggestion?.collection_id) {
      const c = collectionsById.get(suggestion.collection_id);
      if (c) {
        ids.add(c.id);
        out.push(c);
      }
    }
    for (const id of recentIds) {
      if (ids.has(id)) continue;
      const c = collectionsById.get(id);
      if (!c) continue;
      ids.add(id);
      out.push(c);
      if (out.length >= 1 + RECENT_COLLECTION_LIMIT) break;
    }
    if (out.length < 6) {
      for (const c of flat) {
        if (ids.has(c.id) || c.parent_id) continue;
        ids.add(c.id);
        out.push(c);
        if (out.length >= 6) break;
      }
    }
    return out;
  }, [suggestion, recentIds, collectionsById, flat]);

  function clearUndo() {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndo(null);
  }

  function scheduleUndo(state: NonNullable<UndoState>) {
    clearUndo();
    setUndo(state);
    undoTimerRef.current = window.setTimeout(() => {
      setUndo(null);
      undoTimerRef.current = null;
    }, TOAST_TIMEOUT_MS);
  }

  async function handleFile(target: Collection) {
    if (!current) return;
    const previousCollectionId = current.collection_id;

    setQueue((prev) => prev.slice(1));
    setRecentIds((prev) => {
      const filtered = prev.filter((id) => id !== target.id);
      return [target.id, ...filtered].slice(0, 8);
    });

    const currentTags = current.tags ?? [];

    try {
      const updates: Partial<Bookmark> = { collection_id: target.id };
      if (
        tags.length !== currentTags.length ||
        tags.some((t, i) => t !== currentTags[i])
      ) {
        updates.tags = tags;
      }
      await api.updateBookmark(current.id, updates);
      onMutated?.();
      scheduleUndo({
        bookmark: { ...current, collection_id: target.id },
        previousCollectionId,
        message: `Filed "${trimTitle(current)}" in ${target.name}.`,
      });
    } catch (e) {
      setQueue((prev) => [current, ...prev]);
      window.alert(
        e instanceof Error ? e.message : "Couldn't move that bookmark."
      );
    }
  }

  async function handleSkip() {
    if (!current) return;
    setQueue((prev) => {
      const [head, ...rest] = prev;
      return [...rest, head];
    });
  }

  async function handleDelete() {
    if (!current) return;
    if (!window.confirm(`Delete "${trimTitle(current)}"?`)) return;
    setQueue((prev) => prev.slice(1));
    try {
      await api.deleteBookmark(current.id);
      onMutated?.();
    } catch (e) {
      setQueue((prev) => [current, ...prev]);
      window.alert(
        e instanceof Error ? e.message : "Couldn't delete that bookmark."
      );
    }
  }

  async function handleUndo() {
    if (!undo) return;
    const restore = undo;
    clearUndo();
    setQueue((prev) => [restore.bookmark, ...prev]);
    try {
      await api.updateBookmark(restore.bookmark.id, {
        collection_id: restore.previousCollectionId,
      });
      onMutated?.();
    } catch {
      // best-effort
    }
  }

  // Keyboard shortcuts (only while the overlay is open).
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (event.key >= "1" && event.key <= "6") {
        const idx = parseInt(event.key, 10) - 1;
        const target = choiceCollections[idx];
        if (target) {
          event.preventDefault();
          setSelectedCollection((prev) => prev?.id === target.id ? null : target);
        }
        return;
      }
      if (event.key === "Enter") {
        const target = choiceCollections[0];
        if (target) {
          event.preventDefault();
          setSelectedCollection((prev) => prev?.id === target.id ? null : target);
        }
      }
      if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        void handleSkip();
      }
      if (event.key === "Backspace" && (event.metaKey || event.shiftKey)) {
        event.preventDefault();
        void handleDelete();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "z") {
        event.preventDefault();
        void handleUndo();
      }
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, choiceCollections, current?.id, undo?.bookmark.id]);

  const tagSuggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return [];
    return allTags
      .filter((t) => t.includes(q) && !tags.includes(t))
      .slice(0, 6);
  }, [tagInput, allTags, tags]);

  function commitTagInput(value?: string) {
    const v = (value ?? tagInputRef.current).trim().toLowerCase();
    if (!v) return;
    tagInputRef.current = "";
    setTagInput("");
    setTags((prev) => (prev.includes(v) ? prev : [...prev, v]));
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  if (!open) return null;

  let body: React.ReactNode;

  if (step.kind === "loading") {
    body = <div className="triage-state muted">Loading…</div>;
  } else if (step.kind === "error") {
    body = (
      <div className="triage-state">
        <p className="triage-error">{step.message}</p>
        <button onClick={onClose} className="triage-btn">
          Close
        </button>
      </div>
    );
  } else if (step.kind === "empty" || !current) {
    body = (
      <div className="triage-state">
        <div className="triage-empty-mark">✓</div>
        <h2>Inbox zero.</h2>
        <p className="muted">
          Nothing left to triage. Your unsorted queue is clear.
        </p>
        <button className="triage-btn" onClick={onClose}>
          Close
        </button>
      </div>
    );
  } else {
    const storedSrc = storedPreviewUrl(current.preview_path, {
      previewVersion: current.preview_version,
    });
    const previewSrc = storedSrc || current.og_image || current.favicon;

    body = (
      <main className="triage-main">
        <a
          href={current.url}
          target="_blank"
          rel="noopener noreferrer"
          className="triage-thumb"
        >
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewSrc}
              alt=""
              loading="eager"
            />
          ) : (
            <div className="triage-thumb-fallback">
              {domainOf(current.url)}
            </div>
          )}
        </a>

        <div className="triage-info">
          <div className="triage-host muted">
            {current.favicon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="triage-favicon" src={current.favicon} alt="" />
            )}
            <span>{domainOf(current.url)}</span>
          </div>
          {current.description && (
            <p className="triage-description">{current.description}</p>
          )}
        </div>

        <div className="triage-choice-row">
          {choiceCollections.map((c, idx) => {
            const isPrimary =
              idx === 0 && suggestion?.collection_id === c.id;
            const isSelected = selectedCollection?.id === c.id;
            const hasOtherSelected = selectedCollection !== null && !isSelected;
            return (
              <button
                key={c.id}
                className={`triage-choice ${isPrimary && !hasOtherSelected ? "primary" : ""} ${isSelected ? "selected" : ""}`}
                onClick={() => setSelectedCollection(isSelected ? null : c)}
                title={pathFor(c.id) ?? c.name}
              >
                <span className="triage-choice-key">{idx + 1}</span>
                <span className="triage-choice-icon" aria-hidden>
                  <CollectionIcon name={c.icon} size={14} />
                </span>
                <span className="triage-choice-name">{c.name}</span>
                {isPrimary && (
                  <span
                    className="triage-choice-ai"
                    aria-hidden
                    title="AI suggestion"
                  >
                    ✦
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="triage-tag-row">
          {tags.map((tag) => (
            <span key={tag} className="triage-tag-pill">
              <span>{tag}</span>
              <button
                className="triage-tag-remove"
                onClick={() => removeTag(tag)}
                aria-label={`Remove tag ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
          {suggestedTags
            .filter((t) => !tags.includes(t))
            .slice(0, 6)
            .map((tag) => (
              <button
                key={`suggest-${tag}`}
                className="triage-tag-suggest"
                onClick={() => {
                  setTags((prev) =>
                    prev.includes(tag) ? prev : [...prev, tag]
                  );
                }}
              >
                +{tag}
              </button>
            ))}
          {tagSuggestions.map((tag) => (
            <button
              key={`auto-${tag}`}
              className="triage-tag-autocomplete"
              onMouseDown={(e) => {
                e.preventDefault();
                commitTagInput(tag);
              }}
            >
              {tag}
            </button>
          ))}
          <input
            className="triage-tag-input"
            placeholder="Add a tag"
            value={tagInput}
            onChange={(e) => {
              tagInputRef.current = e.target.value;
              setTagInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commitTagInput();
              }
            }}
            onBlur={() => commitTagInput()}
          />
        </div>

        <div className="triage-actions">
          <button
            className="triage-action danger"
            onClick={() => void handleDelete()}
            title="Delete (⌘⌫)"
          >
            Delete
          </button>
          <div className="triage-actions-right">
            <button
              className="triage-action"
              onClick={() => void handleSkip()}
              title="Skip (S)"
            >
              Skip
            </button>
            <button
              className="triage-action primary"
              disabled={!selectedCollection}
              onClick={() => {
                if (selectedCollection) void handleFile(selectedCollection);
              }}
            >
              Save
            </button>
          </div>
        </div>
      </main>
    );
  }

  const remaining = queue.length;
  const showRemaining = step.kind === "ready" && current !== null;

  return (
    <div className="triage-backdrop" onClick={onClose}>
      <div className="triage-panel" onClick={(e) => e.stopPropagation()}>
        <header className="triage-head">
          <span className="triage-head-title">
            {current ? trimTitle(current) : step.kind === "empty" ? "Inbox zero" : "Triage"}
          </span>
          <div className="triage-head-right">
            {showRemaining && (
              <span className="triage-head-progress muted">
                {remaining === 1 ? "1 left" : `${remaining} left`}
              </span>
            )}
            <button
              className="triage-close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </header>
        {body}
      </div>

      {undo && (
        <div className="triage-undo" role="status">
          <span>{undo.message}</span>
          <button
            className="triage-undo-btn"
            onClick={() => void handleUndo()}
          >
            Undo
          </button>
        </div>
      )}

      <style jsx global>{`
        .triage-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.48);
          backdrop-filter: blur(14px) saturate(120%);
          -webkit-backdrop-filter: blur(14px) saturate(120%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          z-index: 70;
          overflow-y: auto;
        }
        .triage-panel {
          width: 920px;
          max-width: 100%;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32);
          animation: triage-rise 180ms ease both;
        }
        @keyframes triage-rise {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .triage-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid var(--color-border);
        }
        .triage-head-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }
        .triage-head-right {
          display: inline-flex;
          align-items: center;
          gap: 12px;
        }
        .triage-head-progress {
          font-size: 13px;
          font-feature-settings: "tnum" 1;
        }
        .triage-close {
          appearance: none;
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg);
          color: var(--color-text);
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          padding-bottom: 2px;
        }
        .triage-close:hover {
          border-color: var(--color-border-strong);
        }
        .triage-state {
          padding: 64px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          text-align: center;
        }
        .triage-state h2 {
          font-size: 15px;
          font-weight: 600;
          margin: 0;
        }
        .triage-empty-mark {
          font-size: 36px;
          opacity: 0.3;
        }
        .triage-main {
          padding: 28px 28px 0;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .triage-thumb {
          display: block;
          aspect-ratio: 16 / 9;
          max-height: 360px;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          overflow: hidden;
        }
        .triage-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .triage-thumb-fallback {
          display: flex;
          height: 100%;
          align-items: center;
          justify-content: center;
          color: var(--color-text-muted);
          font-size: 13px;
        }
        .triage-info {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .triage-host {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }
        .triage-favicon {
          width: 14px;
          height: 14px;
          border-radius: 2px;
        }
        .triage-title {
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -0.005em;
          line-height: 1.35;
          margin: 0;
        }
        .triage-description {
          font-size: 13px;
          line-height: 1.5;
          color: var(--color-text-muted);
          margin: 4px 0 0;
        }
        .triage-choice-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .triage-choice {
          appearance: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 12px 7px 6px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg);
          color: var(--color-text);
          font: inherit;
          font-size: 13px;
          line-height: 1;
          cursor: pointer;
          transition: border-color 120ms ease, background 120ms ease;
        }
        .triage-choice:hover {
          border-color: var(--color-border-strong);
          background: var(--color-bg-hover);
        }
        .triage-choice.primary {
          background: var(--color-text);
          color: var(--color-bg);
          border-color: var(--color-text);
        }
        .triage-choice.primary:hover {
          opacity: 0.92;
        }
        .triage-choice.selected {
          border-color: var(--color-text);
          box-shadow: 0 0 0 1px var(--color-text);
        }
        .triage-choice.primary .triage-choice-key {
          background: rgba(255, 255, 255, 0.18);
          color: var(--color-bg);
        }
        .triage-choice-key {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: var(--color-bg-secondary);
          color: var(--color-text-muted);
          font-size: 10px;
          font-feature-settings: "tnum" 1;
          flex-shrink: 0;
        }
        .triage-choice-icon {
          display: inline-flex;
          align-items: center;
        }
        .triage-choice-ai {
          margin-left: 2px;
          font-size: 11px;
          opacity: 0.7;
        }
        .triage-tag-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }
        .triage-tag-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 7px 10px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg-secondary);
          font-size: 13px;
          line-height: 1;
        }
        .triage-tag-remove {
          appearance: none;
          background: transparent;
          border: 0;
          color: var(--color-text-muted);
          cursor: pointer;
          font-size: 13px;
          line-height: 1;
          padding: 0;
        }
        .triage-tag-remove:hover {
          color: var(--color-text);
        }
        .triage-tag-suggest {
          appearance: none;
          display: inline-flex;
          align-items: center;
          padding: 7px 10px;
          border: 1px dashed var(--color-border);
          border-radius: 999px;
          background: transparent;
          color: var(--color-text-muted);
          font: inherit;
          font-size: 13px;
          line-height: 1;
          cursor: pointer;
        }
        .triage-tag-suggest:hover {
          border-color: var(--color-border-strong);
          color: var(--color-text);
          background: var(--color-bg-hover);
        }
        .triage-tag-autocomplete {
          appearance: none;
          display: inline-flex;
          align-items: center;
          padding: 7px 10px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg);
          color: var(--color-text-muted);
          font: inherit;
          font-size: 13px;
          line-height: 1;
          cursor: pointer;
        }
        .triage-tag-autocomplete:hover {
          border-color: var(--color-border-strong);
          color: var(--color-text);
          background: var(--color-bg-hover);
        }
        .triage-tag-input {
          flex: 1 1 100%;
          min-width: 150px;
          height: 30px;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 6px;
          color: var(--color-text);
          font: inherit;
          font-size: 13px;
          line-height: 1;
          padding: 0 10px;
        }
        .triage-tag-input::placeholder {
          color: var(--color-text-muted);
        }
        .triage-tag-input:focus {
          outline: none;
        }
        .triage-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 14px 16px;
        }
        .triage-actions-right {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .triage-action {
          appearance: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 30px;
          padding: 0 10px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg);
          color: var(--color-text);
          font: inherit;
          font-size: 12px;
          line-height: 1;
          white-space: nowrap;
          cursor: pointer;
        }
        .triage-action:hover {
          background: var(--color-bg-hover);
        }
        .triage-action.primary {
          background: var(--color-text);
          color: var(--color-bg);
          border-color: var(--color-text);
        }
        .triage-action.primary:hover {
          opacity: 0.88;
        }
        .triage-action.danger {
          border-color: transparent;
          color: var(--color-text-muted);
        }
        .triage-action.danger:hover {
          color: #d13030;
          background: var(--color-bg-hover);
        }
        .triage-error {
          color: #d13030;
        }
        .triage-btn {
          appearance: none;
          padding: 8px 14px;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg);
          color: var(--color-text);
          font: inherit;
          font-size: 13px;
          cursor: pointer;
        }
        .triage-undo {
          position: fixed;
          left: 50%;
          bottom: 24px;
          transform: translateX(-50%);
          background: var(--color-text);
          color: var(--color-bg);
          padding: 10px 16px;
          border-radius: 999px;
          font-size: 13px;
          display: inline-flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
          z-index: 80;
        }
        .triage-undo-btn {
          appearance: none;
          background: transparent;
          border: 0;
          color: var(--color-bg);
          font: inherit;
          font-size: 13px;
          text-decoration: underline;
          cursor: pointer;
          padding: 0;
        }
        .muted {
          color: var(--color-text-muted);
        }
        @media (max-width: 768px) {
          .triage-backdrop {
            padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px);
          }
          .triage-panel {
            max-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 32px);
            overflow-y: auto;
          }
        }
      `}</style>
    </div>
  );
}

function trimTitle(b: Bookmark): string {
  const t = (b.title ?? domainOf(b.url)).trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
