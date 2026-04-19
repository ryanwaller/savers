"use client";

import { useEffect, useState } from "react";
import type { AISuggestion, Bookmark, Collection } from "@/lib/types";
import CollectionPicker from "./CollectionPicker";

type Props = {
  bookmark: Bookmark;
  suggestion: AISuggestion;
  flat: Collection[];
  onCreateCollection: (name: string, parentId: string | null) => Promise<Collection>;
  onCreateAndMove: (name: string, parentId: string | null) => Promise<void>;
  onMove: (collectionId: string) => Promise<void>;
  onDismiss: () => void;
};

export default function AISuggestionToast({
  bookmark,
  suggestion,
  flat,
  onCreateCollection,
  onCreateAndMove,
  onMove,
  onDismiss,
}: Props) {
  const [picking, setPicking] = useState(false);
  const [otherId, setOtherId] = useState<string | null>(suggestion.collection_id);
  const [visible, setVisible] = useState(true);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (picking || hover) return;
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 180);
    }, 10000);
    return () => clearTimeout(timer);
  }, [picking, hover, onDismiss]);

  const title = bookmark.title || bookmark.url;
  const hasExistingSuggestion = Boolean(suggestion.collection_id);
  const hasNewSuggestion = Boolean(suggestion.proposed_collection_name);
  const targetLabel = hasExistingSuggestion
    ? suggestion.collection_path
    : suggestion.proposed_parent_collection_path
      ? `${suggestion.proposed_parent_collection_path} / ${suggestion.proposed_collection_name}`
      : suggestion.proposed_collection_name;

  return (
    <div
      className={`toast ${visible ? "in" : "out"}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="row">
        <div className="ico">AI</div>
        <div className="text">
          <div className="line">
            {hasExistingSuggestion ? "Move" : "Create"} <span className="em">{truncate(title, 40)}</span>{" "}
            {hasExistingSuggestion ? "to" : "under"} <span className="em">{targetLabel}</span>?
          </div>
          <div className="small muted">
            Confidence: {suggestion.confidence}
          </div>
        </div>
        <button className="close" onClick={onDismiss} aria-label="Dismiss">×</button>
      </div>

      {!picking ? (
        <div className="actions">
          {hasExistingSuggestion && suggestion.collection_id ? (
            <button
              className="btn btn-primary"
              onClick={() => onMove(suggestion.collection_id!)}
            >
              Yes, move it
            </button>
          ) : hasNewSuggestion ? (
            <button
              className="btn btn-primary"
              onClick={() =>
                onCreateAndMove(
                  suggestion.proposed_collection_name!,
                  suggestion.proposed_parent_collection_id ?? null
                )
              }
            >
              Create and move
            </button>
          ) : null}
          <button className="btn" onClick={onDismiss}>
            Keep in Unsorted
          </button>
          <button className="btn btn-ghost" onClick={() => setPicking(true)}>
            Other…
          </button>
        </div>
      ) : (
        <div className="other">
          <CollectionPicker
            flat={flat}
            value={otherId}
            onChange={setOtherId}
            onCreateCollection={onCreateCollection}
            allowUnsorted={false}
            openDirection="up"
          />
          <div className="actions">
            <button className="btn" onClick={() => setPicking(false)}>Back</button>
            <button
              className="btn btn-primary"
              onClick={() => otherId && onMove(otherId)}
              disabled={!otherId}
            >
              Move
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .toast {
          position: fixed;
          right: 20px;
          bottom: 20px;
          width: 340px;
          max-width: calc(100vw - 40px);
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius);
          padding: 12px;
          z-index: 60;
          transition: transform 180ms ease, opacity 180ms ease;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .toast.in { transform: translateY(0); opacity: 1; }
        .toast.out { transform: translateY(8px); opacity: 0; }
        .row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .ico {
          width: 22px;
          height: 22px;
          border: 1px solid var(--color-border);
          border-radius: 4px;
          font-size: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-muted);
          flex-shrink: 0;
        }
        .text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .line { font-size: 12px; line-height: 1.4; }
        .em { font-weight: 500; }
        .close {
          color: var(--color-text-muted);
          font-size: 16px;
          line-height: 1;
          padding: 0 4px;
        }
        .close:hover { color: var(--color-text); }
        .actions { display: flex; gap: 6px; flex-wrap: wrap; }
        .other { display: flex; flex-direction: column; gap: 8px; }
      `}</style>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
