"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  urls: string[];
  onClose: () => void;
  onAddAnyway?: (urls: string[]) => Promise<void> | void;
};

// Shown after a drop/import that contained one or more URLs that
// were already saved. Lists the skipped URLs so the user can decide
// whether to clean up the duplicates on the originating side — or
// force-add them anyway if they know what they're doing.
export default function DuplicateImportModal({ open, urls, onClose, onAddAnyway }: Props) {
  const [mounted, setMounted] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const count = urls.length;
  const title =
    count === 1
      ? "1 duplicate skipped"
      : `${count} duplicates skipped`;

  return createPortal(
    <div className="dup-backdrop" onClick={onClose}>
      <div
        className="dup-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dup-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dup-body">
          <div id="dup-title" className="dup-title">
            {title}
          </div>
          <div className="dup-copy">
            {count === 1
              ? "This URL was already saved, so it wasn't imported again."
              : `These URLs were already saved, so they weren't imported again.`}
          </div>
          <ul className="dup-list">
            {urls.slice(0, 10).map((url) => (
              <li key={url} className="dup-item" title={url}>
                {url}
              </li>
            ))}
            {urls.length > 10 && (
              <li className="dup-item dup-more">
                + {urls.length - 10} more
              </li>
            )}
          </ul>
        </div>
        <div className="dup-actions">
          <button className="btn" onClick={onClose} disabled={adding}>
            {onAddAnyway ? "Skip" : "Got it"}
          </button>
          {onAddAnyway && (
            <button
              className="btn btn-primary"
              disabled={adding}
              onClick={async () => {
                setAdding(true);
                try {
                  await onAddAnyway(urls);
                } finally {
                  setAdding(false);
                  onClose();
                }
              }}
            >
              {adding
                ? "Adding…"
                : count === 1
                  ? "Add anyway"
                  : "Add them anyway"}
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        .dup-backdrop {
          position: fixed;
          inset: 0;
          z-index: 120;
          background: rgba(0, 0, 0, 0.34);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          animation: fade 120ms ease;
        }
        @keyframes fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .dup-panel {
          width: min(440px, 100%);
          border: 1px solid #ff8f8f;
          border-radius: var(--radius-lg);
          background: var(--color-bg);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
          overflow: hidden;
        }
        .dup-body {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .dup-title {
          font-size: 13px;
          font-weight: 700;
          color: #ff8f8f;
        }
        .dup-copy {
          font-size: 12px;
          color: #ff8f8f;
          line-height: 1.45;
        }
        .dup-list {
          list-style: none;
          padding: 8px 10px;
          margin: 0;
          border: 1px solid rgba(255, 143, 143, 0.35);
          border-radius: var(--radius);
          background: rgba(255, 90, 90, 0.08);
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 200px;
          overflow: auto;
        }
        .dup-item {
          font-size: 12px;
          color: #ffb4b4;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dup-more {
          color: rgba(255, 180, 180, 0.7);
          font-style: italic;
        }
        .dup-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 0 16px 16px;
        }
      `}</style>
    </div>,
    document.body
  );
}
