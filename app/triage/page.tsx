"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { api, screenshotPreviewUrl } from "@/lib/api";
import type { AISuggestion, Bookmark, Collection } from "@/lib/types";
import CollectionIcon from "@/app/components/CollectionIcon";
import { getSupabaseBrowserClient } from "@/lib/supabase";

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

export default function TriagePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [queue, setQueue] = useState<Bookmark[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [flat, setFlat] = useState<Collection[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState<AISuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [undo, setUndo] = useState<UndoState>(null);
  const undoTimerRef = useRef<number | null>(null);

  const current = queue[0] ?? null;

  const loadAll = useCallback(async () => {
    setStep({ kind: "loading" });
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/");
        return;
      }

      const [{ collections: tree, flat: flatList }, { bookmarks }] =
        await Promise.all([
          api.listCollections(),
          api.listBookmarks({ collection_id: null }),
        ]);

      setCollections(tree);
      setFlat(flatList);
      // Only items still uncategorized — exclude pinned-but-unsorted? Keep them.
      const unsorted = bookmarks.filter((b) => b.collection_id === null);
      setQueue(unsorted);
      setStep(unsorted.length === 0 ? { kind: "empty" } : { kind: "ready" });
    } catch (e) {
      setStep({
        kind: "error",
        message: e instanceof Error ? e.message : "Couldn't load triage queue.",
      });
    }
  }, [router]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Reset per-bookmark state and ask the AI when the head of the queue moves.
  useEffect(() => {
    setTags(current?.tags ?? []);
    setTagInput("");
    setSuggestion(null);
    if (!current) return;
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
    return () => {
      cancelled = true;
    };
  }, [current?.id, collections]);

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

  // Build the choice row: AI suggestion first (pre-selected), then recent
  // collections, deduped, capped.
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
    // If we still have room, fill with top-level collections in display order.
    if (out.length < 5) {
      for (const c of flat) {
        if (ids.has(c.id) || c.parent_id) continue;
        ids.add(c.id);
        out.push(c);
        if (out.length >= 5) break;
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

  async function handleFile(target: Collection | null) {
    if (!current) return;
    const previousCollectionId = current.collection_id;
    const targetId = target?.id ?? null;
    const targetName = target ? target.name : "Unsorted";

    // Optimistically advance the queue.
    setQueue((prev) => prev.slice(1));
    setRecentIds((prev) => {
      if (!targetId) return prev;
      const filtered = prev.filter((id) => id !== targetId);
      return [targetId, ...filtered].slice(0, 8);
    });

    try {
      const updates: Partial<Bookmark> = {
        collection_id: targetId,
      };
      if (tags.length !== current.tags.length || tags.some((t, i) => t !== current.tags[i])) {
        updates.tags = tags;
      }
      await api.updateBookmark(current.id, updates);
      scheduleUndo({
        bookmark: { ...current, collection_id: targetId },
        previousCollectionId,
        message: target
          ? `Filed “${trimTitle(current)}” in ${targetName}.`
          : `Marked “${trimTitle(current)}” as triaged.`,
      });
    } catch (e) {
      // Roll back on failure.
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
    if (!window.confirm(`Delete “${trimTitle(current)}”?`)) return;
    setQueue((prev) => prev.slice(1));
    try {
      await api.deleteBookmark(current.id);
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
    } catch {
      // best-effort
    }
  }

  // Keyboard shortcuts.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (event.key >= "1" && event.key <= "5") {
        const idx = parseInt(event.key, 10) - 1;
        const target = choiceCollections[idx];
        if (target) {
          event.preventDefault();
          void handleFile(target);
        }
        return;
      }
      if (event.key === "Enter") {
        const target = choiceCollections[0];
        if (target) {
          event.preventDefault();
          void handleFile(target);
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
        router.push("/");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choiceCollections, current?.id, undo?.bookmark.id]);

  function commitTagInput() {
    const value = tagInput.trim().toLowerCase();
    if (!value) return;
    setTagInput("");
    setTags((prev) => (prev.includes(value) ? prev : [...prev, value]));
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  if (step.kind === "loading") {
    return <div className="triage-shell">Loading…</div>;
  }
  if (step.kind === "error") {
    return (
      <div className="triage-shell">
        <p className="triage-error">{step.message}</p>
        <button onClick={() => router.push("/")} className="triage-btn">
          ← Back to bookmarks
        </button>
      </div>
    );
  }
  if (step.kind === "empty" || !current) {
    return (
      <div className="triage-shell triage-empty">
        <div className="triage-empty-mark">✓</div>
        <h1>Inbox zero.</h1>
        <p className="triage-empty-sub">
          Nothing left to triage. Your unsorted queue is clear.
        </p>
        <button className="triage-btn" onClick={() => router.push("/")}>
          ← Back to bookmarks
        </button>
        <TriageStyles />
      </div>
    );
  }

  const total = queue.length;
  const previewSrc = screenshotPreviewUrl(current.url, {
    cacheBust: current.preview_version,
  });
  const fallbackSrc = current.og_image ?? null;
  const aiPath =
    suggestion?.collection_path ??
    (suggestion?.proposed_parent_collection_path
      ? `${suggestion.proposed_parent_collection_path} / ${suggestion.proposed_collection_name ?? ""}`
      : null);

  return (
    <div className="triage-shell">
      <header className="triage-head">
        <button
          className="triage-back"
          onClick={() => router.push("/")}
          aria-label="Close"
        >
          ←
        </button>
        <div className="triage-progress">
          <div className="triage-progress-text small muted">
            {total === 1 ? "1 to triage" : `${total} to triage`}
          </div>
          <div className="triage-progress-bar">
            <span
              className="triage-progress-fill"
              style={{ width: `${100 - Math.min(95, total * 5)}%` } as CSSProperties}
            />
          </div>
        </div>
      </header>

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
              onError={(e) => {
                if (fallbackSrc) (e.target as HTMLImageElement).src = fallbackSrc;
              }}
              loading="eager"
            />
          ) : (
            <div className="triage-thumb-fallback">{domainOf(current.url)}</div>
          )}
        </a>

        <div className="triage-info">
          <div className="triage-host muted small">
            {current.favicon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="triage-favicon" src={current.favicon} alt="" />
            )}
            <span>{domainOf(current.url)}</span>
          </div>
          <h1 className="triage-title">{current.title || current.url}</h1>
          {current.description && (
            <p className="triage-description">{current.description}</p>
          )}
        </div>

        <section className="triage-choices">
          <div className="triage-choices-label small muted">
            File in collection {aiPath && <span className="ai-hint">· AI: {aiPath}</span>}
            {aiLoading && <span className="ai-hint"> · suggesting…</span>}
          </div>
          <div className="triage-choice-row">
            {choiceCollections.map((c, idx) => (
              <button
                key={c.id}
                className={`triage-choice ${idx === 0 && suggestion?.collection_id === c.id ? "primary" : ""}`}
                onClick={() => void handleFile(c)}
              >
                <span className="triage-choice-key small muted">{idx + 1}</span>
                <span className="triage-choice-icon" aria-hidden>
                  <CollectionIcon name={c.icon} size={14} />
                </span>
                <span className="triage-choice-name">{c.name}</span>
                {pathFor(c.id) && pathFor(c.id) !== c.name && (
                  <span className="triage-choice-path small muted">
                    {pathFor(c.id)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        <section className="triage-tags">
          <div className="triage-choices-label small muted">Tags</div>
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
            <input
              className="triage-tag-input"
              placeholder="Add tag"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  commitTagInput();
                }
                if (e.key === "Backspace" && !tagInput && tags.length) {
                  e.preventDefault();
                  setTags((prev) => prev.slice(0, -1));
                }
              }}
              onBlur={commitTagInput}
            />
          </div>
        </section>

        <section className="triage-actions">
          <button className="triage-action" onClick={() => void handleSkip()}>
            <kbd>S</kbd> Skip
          </button>
          <button className="triage-action" onClick={() => void handleFile(null)}>
            Mark triaged
          </button>
          <button
            className="triage-action danger"
            onClick={() => void handleDelete()}
          >
            Delete
          </button>
        </section>

        <p className="triage-shortcuts small muted">
          <kbd>1</kbd>–<kbd>5</kbd> file · <kbd>Enter</kbd> accept AI ·{" "}
          <kbd>S</kbd> skip · <kbd>⌫</kbd> delete · <kbd>⌘Z</kbd> undo
        </p>
      </main>

      {undo && (
        <div className="triage-undo" role="status">
          <span>{undo.message}</span>
          <button className="triage-undo-btn" onClick={() => void handleUndo()}>
            Undo
          </button>
        </div>
      )}

      <TriageStyles />
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

function TriageStyles() {
  return (
    <style jsx global>{`
      .triage-shell {
        max-width: 880px;
        margin: 0 auto;
        padding: 24px 24px 96px;
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        gap: 24px;
        font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
        color: var(--color-text);
      }
      .triage-head {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .triage-back {
        appearance: none;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        width: 32px;
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-muted);
        cursor: pointer;
      }
      .triage-back:hover {
        border-color: var(--color-border-strong);
        color: var(--color-text);
      }
      .triage-progress {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .triage-progress-bar {
        height: 3px;
        background: var(--color-bg-secondary);
        border-radius: 999px;
        overflow: hidden;
      }
      .triage-progress-fill {
        display: block;
        height: 100%;
        background: var(--color-text);
        transition: width 200ms ease;
      }
      .triage-thumb {
        display: block;
        aspect-ratio: 16 / 9;
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        border-radius: 12px;
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
        font-size: 14px;
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
      }
      .triage-favicon {
        width: 14px;
        height: 14px;
        border-radius: 2px;
      }
      .triage-title {
        font-size: 22px;
        font-weight: 600;
        letter-spacing: -0.01em;
        margin: 0;
      }
      .triage-description {
        font-size: 14px;
        line-height: 1.5;
        color: var(--color-text-muted);
        margin: 0;
        max-width: 64ch;
      }
      .triage-choices,
      .triage-tags {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .triage-choices-label {
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-size: 11px;
      }
      .ai-hint {
        text-transform: none;
        letter-spacing: 0;
      }
      .triage-choice-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .triage-choice {
        appearance: none;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border: 1px solid var(--color-border);
        border-radius: 8px;
        background: var(--color-bg-secondary);
        color: var(--color-text);
        font: inherit;
        font-size: 13px;
        cursor: pointer;
      }
      .triage-choice:hover {
        border-color: var(--color-border-strong);
      }
      .triage-choice.primary {
        background: var(--color-text);
        color: var(--color-bg);
        border-color: var(--color-text);
      }
      .triage-choice.primary .triage-choice-key,
      .triage-choice.primary .triage-choice-path {
        color: var(--color-bg-secondary);
      }
      .triage-choice-key {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 16px;
        font-size: 11px;
        font-feature-settings: "tnum" 1;
      }
      .triage-choice-icon {
        display: inline-flex;
        align-items: center;
      }
      .triage-choice-path {
        font-size: 11px;
      }
      .triage-tag-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        padding: 6px 8px;
        border: 1px solid var(--color-border);
        border-radius: 8px;
        background: var(--color-bg);
      }
      .triage-tag-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        background: var(--color-bg-secondary);
        font-size: 12px;
      }
      .triage-tag-remove {
        appearance: none;
        background: transparent;
        border: 0;
        color: var(--color-text-muted);
        cursor: pointer;
        font-size: 13px;
        line-height: 1;
      }
      .triage-tag-input {
        flex: 1 1 120px;
        min-width: 100px;
        background: transparent;
        border: 0;
        color: var(--color-text);
        font: inherit;
        font-size: 13px;
        padding: 4px 6px;
      }
      .triage-tag-input:focus {
        outline: none;
      }
      .triage-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--color-border);
      }
      .triage-action {
        appearance: none;
        padding: 8px 14px;
        border: 1px solid var(--color-border);
        border-radius: 8px;
        background: var(--color-bg);
        color: var(--color-text);
        font: inherit;
        font-size: 13px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .triage-action:hover {
        border-color: var(--color-border-strong);
      }
      .triage-action.danger {
        color: #ff7a7a;
      }
      .triage-action kbd {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px;
        padding: 1px 5px;
        border: 1px solid var(--color-border);
        border-radius: 4px;
        color: var(--color-text-muted);
      }
      .triage-shortcuts {
        margin: 0;
      }
      .triage-shortcuts kbd {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px;
        padding: 1px 4px;
        border: 1px solid var(--color-border);
        border-radius: 4px;
      }
      .triage-error {
        color: #ff7a7a;
      }
      .triage-empty {
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 12px;
        flex: 1;
      }
      .triage-empty-mark {
        font-size: 36px;
        opacity: 0.3;
      }
      .triage-empty-sub {
        color: var(--color-text-muted);
        margin: 0 0 16px;
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
        bottom: 20px;
        transform: translateX(-50%);
        background: var(--color-text);
        color: var(--color-bg);
        padding: 10px 14px;
        border-radius: 999px;
        font-size: 13px;
        display: inline-flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
        z-index: 60;
      }
      .triage-undo-btn {
        appearance: none;
        background: transparent;
        border: 0;
        color: var(--color-bg);
        font: inherit;
        text-decoration: underline;
        cursor: pointer;
      }
    `}</style>
  );
}
