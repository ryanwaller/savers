"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  shareUrl: string;
  title: string;
  description: string | null;
  onClose: () => void;
};

export default function ShareModal({ open, shareUrl, title, description, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setShareError(null);
    }
  }, [open]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the input
      const input = document.getElementById("share-url-input") as HTMLInputElement;
      if (input) {
        input.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  }

  async function handleNativeShare() {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return;
    try {
      await navigator.share({
        title,
        text: description || "Check out this bookmark from Savers.",
        url: shareUrl,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setShareError("Share sheet unavailable right now.");
    }
  }

  if (!open || typeof document === "undefined") return null;

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return createPortal(
    <div className="share-backdrop" onClick={onClose}>
      <div className="share-panel" onClick={(e) => e.stopPropagation()}>
        <div className="share-head">
          <span className="share-title">Share bookmark</span>
          <button className="icon-btn share-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="share-body">
          <div className="share-url-label">Share link</div>
          <div className="share-url-row">
            <input
              id="share-url-input"
              className="share-url-input"
              value={shareUrl}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <button className="btn btn-primary share-copy-btn" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="share-actions">
            {canNativeShare ? (
              <button className="btn share-secondary-btn" onClick={handleNativeShare}>
                Share…
              </button>
            ) : null}
          </div>
          {shareError ? <div className="share-error">{shareError}</div> : null}
        </div>
      </div>

      <style jsx global>{`
        .share-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.32);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 70;
          padding: 24px;
        }
        .share-panel {
          width: 400px;
          max-width: 100%;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32);
        }
        .share-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid var(--color-border);
        }
        .share-title {
          font-size: 12px;
          font-weight: 600;
        }
        .share-close {
          color: var(--color-text-muted);
        }
        .share-close:hover {
          color: var(--color-text);
        }
        .share-body {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .share-url-label {
          font-size: 12px;
          color: var(--color-text-muted);
        }
        .share-url-row {
          display: flex;
          gap: 8px;
        }
        .share-url-input {
          flex: 1;
          padding: 6px 8px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg-secondary);
          color: var(--color-text);
          font: inherit;
          font-size: 12px;
        }
        .share-copy-btn {
          white-space: nowrap;
          flex-shrink: 0;
        }
        .share-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: flex-end;
        }
        .share-secondary-btn {
          min-width: 0;
        }
        .share-error {
          font-size: 12px;
          line-height: 16px;
          color: #ff8f8f;
        }
        @media (max-width: 640px) {
          .share-backdrop {
            padding: 24px 12px;
            align-items: flex-end;
          }
          .share-panel {
            border-radius: 12px 12px 0 0;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
