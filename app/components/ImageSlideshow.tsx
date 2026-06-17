"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ImageRow } from "./ImageGrid";

type Props = {
  images: ImageRow[];
  /** Index of the image to open first. Slideshow walks left/right from here. */
  initialIndex: number;
  open: boolean;
  onClose: () => void;
};

/**
 * Full-screen image viewer.
 *
 *   • Left/right arrow keys (and on-screen ‹ › buttons) navigate the
 *     current grid's sort order.
 *   • Esc closes.
 *   • Click outside the image (on the backdrop) closes.
 *   • "Download Original" hits /api/images/[id]/original-url to get a
 *     short-lived signed URL, then opens it in a new tab.
 *   • "Go to source" only appears when the image was imported from a URL
 *     (source_url populated).
 */
export default function ImageSlideshow({
  images,
  initialIndex,
  open,
  onClose,
}: Props) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const current = images[index];

  const next = useCallback(() => {
    setIndex((i) => Math.min(i + 1, images.length - 1));
  }, [images.length]);

  const prev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, next, prev]);

  const downloadOriginal = useCallback(async () => {
    if (!current) return;
    try {
      const res = await fetch(`/api/images/${current.id}/original-url`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) {
        console.error("[slideshow] download failed", body);
        return;
      }
      window.open(body.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("[slideshow] download error", err);
    }
  }, [current]);

  const counter = useMemo(
    () => (images.length > 1 ? `${index + 1} / ${images.length}` : ""),
    [index, images.length],
  );

  if (!open || !current) return null;

  return (
    <div className="ss-backdrop" onClick={onClose}>
      <div className="ss-toolbar" onClick={(e) => e.stopPropagation()}>
        <div className="ss-counter">{counter}</div>
        <div className="ss-actions">
          {current.source_url && (
            <a
              className="ss-btn ghost"
              href={current.source_url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the source URL in a new tab"
            >
              Go to source
            </a>
          )}
          <button
            className="ss-btn ghost"
            onClick={downloadOriginal}
            title="Download the full-resolution original"
          >
            Download Original
          </button>
          <button
            className="ss-btn close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>

      <div className="ss-stage" onClick={onClose}>
        {current.preview_url ? (
          <img
            className="ss-img"
            src={current.preview_url}
            alt={current.title || ""}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
        ) : (
          <div className="ss-placeholder" onClick={(e) => e.stopPropagation()}>
            {current.processing_status === "pending" ? "Preview is still processing…" : "No preview available"}
          </div>
        )}
      </div>

      <div className="ss-caption" onClick={(e) => e.stopPropagation()}>
        <div className="ss-title">{current.title || "Untitled"}</div>
      </div>

      {index > 0 && (
        <button
          className="ss-nav prev"
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          aria-label="Previous"
        >
          ‹
        </button>
      )}
      {index < images.length - 1 && (
        <button
          className="ss-nav next"
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          aria-label="Next"
        >
          ›
        </button>
      )}

      <style jsx>{`
        .ss-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.88);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 200;
          display: flex;
          flex-direction: column;
        }
        .ss-toolbar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          padding: 14px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #fff;
          z-index: 2;
        }
        .ss-counter {
          font-size: 12px;
          letter-spacing: 0.04em;
          color: rgba(255, 255, 255, 0.55);
        }
        .ss-actions {
          display: flex;
          gap: 8px;
        }
        .ss-btn {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          font-family: inherit;
        }
        .ss-btn:hover {
          background: rgba(255, 255, 255, 0.16);
          border-color: rgba(255, 255, 255, 0.3);
        }
        .ss-btn.close {
          width: 32px;
          height: 32px;
          padding: 0;
          font-size: 20px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .ss-stage {
          flex: 1 1 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 72px 96px;
          min-height: 0;
        }
        .ss-img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          display: block;
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.6);
          border-radius: 6px;
        }
        .ss-placeholder {
          color: rgba(255, 255, 255, 0.6);
          font-size: 14px;
          padding: 32px;
          border: 1px dashed rgba(255, 255, 255, 0.2);
          border-radius: 12px;
        }

        .ss-caption {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 18px 24px 22px;
          text-align: center;
          color: rgba(255, 255, 255, 0.85);
          font-size: 14px;
          z-index: 2;
        }
        .ss-title {
          font-weight: 500;
          letter-spacing: 0.01em;
        }

        .ss-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 44px;
          height: 64px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #fff;
          font-size: 32px;
          line-height: 1;
          cursor: pointer;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
        }
        .ss-nav:hover {
          background: rgba(255, 255, 255, 0.16);
        }
        .ss-nav.prev { left: 24px; }
        .ss-nav.next { right: 24px; }

        @media (max-width: 768px) {
          .ss-stage { padding: 80px 24px 100px; }
          .ss-nav { width: 40px; height: 56px; font-size: 26px; }
          .ss-nav.prev { left: 12px; }
          .ss-nav.next { right: 12px; }
        }
      `}</style>
    </div>
  );
}
