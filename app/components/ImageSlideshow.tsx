"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import type { ImageRow } from "./ImageGrid";

type Props = {
  images: ImageRow[];
  /** Index of the image to open first. Slideshow walks left/right from here. */
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  onEdit?: (image: ImageRow) => void;
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
  onEdit,
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
      <div className="ss-topbar" onClick={(e) => e.stopPropagation()}>
        <div className="ss-counter">{counter}</div>
        <div className="ss-topbar-actions">
          <button
            className="ss-circle"
            onClick={downloadOriginal}
            aria-label="Download original"
            title="Download the full-resolution original"
          >
            <Download size={20} strokeWidth={2} />
          </button>
          <button
            className="ss-circle"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <X size={22} strokeWidth={2} />
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

      <div className="ss-footer" onClick={(e) => e.stopPropagation()}>
        <div className="ss-title">{current.title || "Untitled"}</div>
        <div className="ss-actions">
          <button
            className="ss-btn"
            onClick={() => onEdit?.(current)}
            title="Edit image details"
          >
            Edit details
          </button>
          {current.source_url && (
            <a
              className="ss-btn"
              href={current.source_url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the source URL in a new tab"
            >
              Go to source
            </a>
          )}
        </div>
      </div>

      {index > 0 && (
        <button
          className="ss-circle ss-nav prev"
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          aria-label="Previous"
          title="Previous"
        >
          <ChevronLeft size={22} strokeWidth={2} />
        </button>
      )}
      {index < images.length - 1 && (
        <button
          className="ss-circle ss-nav next"
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          aria-label="Next"
          title="Next"
        >
          <ChevronRight size={22} strokeWidth={2} />
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
        .ss-topbar {
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
        .ss-btn {
          background: #fff;
          color: #111;
          border: 1px solid #fff;
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          font-family: inherit;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }
        .ss-btn:hover {
          background: #f0f0f0;
          border-color: #f0f0f0;
        }

        /* One shared style for every icon-only slideshow button — close,
           download, prev, next. Same size, same glass-on-dark color.
           lucide-react's SVGs are square + balanced around their viewBox
           center, so flex centering puts them exactly mid-circle (the old
           Unicode ‹ › / × glyphs were vertically biased per-font, which is
           what made them look low). */
        .ss-topbar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ss-circle {
          width: 44px;
          height: 44px;
          padding: 0;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.22);
          cursor: pointer;
          font-family: inherit;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          transition: background 140ms ease, border-color 140ms ease;
        }
        .ss-circle:hover {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.4);
        }

        .ss-stage {
          flex: 1 1 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 72px 96px 132px;
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

        .ss-footer {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 18px 24px 24px;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .ss-title {
          font-weight: 500;
          letter-spacing: 0.01em;
          color: rgba(255, 255, 255, 0.92);
          font-size: 14px;
          text-align: center;
        }
        .ss-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        /* Position-only — visual treatment lives on .ss-circle so all four
           icon buttons match. */
        .ss-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 2;
        }
        .ss-nav.prev { left: 24px; }
        .ss-nav.next { right: 24px; }

        @media (max-width: 768px) {
          .ss-stage { padding: 80px 24px 100px; }
          .ss-circle { width: 40px; height: 40px; }
          .ss-nav.prev { left: 12px; }
          .ss-nav.next { right: 12px; }
        }
      `}</style>
    </div>
  );
}
