"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export type ImageRow = {
  id: string;
  title: string | null;
  preview_path: string | null;
  preview_url: string | null;
  original_path: string;
  width: number | null;
  height: number | null;
  file_kind: string;
  processing_status: string;
  source_url: string | null;
  created_at: string;
};

type Props = {
  images: ImageRow[];
  loading?: boolean;
  emptyLabel?: string;
  /**
   * Min column width in pixels. Drives column count via ResizeObserver.
   * The S/M/L/XL knob in the toolbar feeds this number — same convention
   * as BookmarkGrid's cardMinWidth.
   */
  cardMinWidth?: number;
  /** Fixed column count override. If set, ignores cardMinWidth. */
  desktopCols?: number;
  mobileCols?: number;
  onOpen?: (image: ImageRow) => void;
};

const GAP = 16;
const PADDING_X = 20;
const DEFAULT_MIN_WIDTH = 240;
const FALLBACK_ASPECT = 1; // square for images without dimensions yet

type Placement = {
  image: ImageRow;
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Pinterest-style masonry. JS-positioned because (a) CSS column-count flows
 * items column-by-column which breaks chronological order, and (b) CSS
 * grid auto-placement leaves gaps with uneven row heights. The cost is a
 * single pass per layout change — fine for a few hundred items.
 *
 * Hover semantics: card sits up with a subtle drop shadow at rest; on
 * hover the image scales down slightly and the shadow fades out so the
 * card appears to lower toward the surface (inverse of the usual
 * lift-on-hover).
 */
export default function ImageGrid({
  images,
  loading,
  emptyLabel = "No images yet.",
  cardMinWidth = DEFAULT_MIN_WIDTH,
  desktopCols,
  mobileCols,
  onOpen,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check, { passive: true });
    return () => window.removeEventListener("resize", check);
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setContainerWidth(w);
      }
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const { placements, totalHeight } = useMemo(() => {
    if (containerWidth === 0 || images.length === 0) {
      return { placements: [] as Placement[], totalHeight: 0 };
    }

    // Column count: fixed override → mobileCols/desktopCols → derived
    // from cardMinWidth.
    let cols: number;
    if (isMobile && mobileCols) {
      cols = mobileCols;
    } else if (!isMobile && desktopCols) {
      cols = desktopCols;
    } else {
      cols = Math.max(
        1,
        Math.floor((containerWidth + GAP) / (cardMinWidth + GAP)),
      );
    }

    const colWidth = (containerWidth - GAP * (cols - 1)) / cols;
    const colHeights = new Array<number>(cols).fill(0);
    const placed: Placement[] = [];

    for (const img of images) {
      // Title row is consistent height; image height comes from aspect.
      const aspect = img.width && img.height
        ? img.height / img.width
        : FALLBACK_ASPECT;
      const imageH = colWidth * aspect;
      const titleH = 28; // single-line title + margin

      // Choose the column with the smallest running height.
      let targetCol = 0;
      for (let i = 1; i < cols; i++) {
        if (colHeights[i] < colHeights[targetCol]) targetCol = i;
      }

      const left = targetCol * (colWidth + GAP);
      const top = colHeights[targetCol];

      placed.push({
        image: img,
        left,
        top,
        width: colWidth,
        height: imageH + titleH,
      });

      colHeights[targetCol] = top + imageH + titleH + GAP;
    }

    const totalH = Math.max(...colHeights) - GAP;
    return { placements: placed, totalHeight: totalH };
  }, [images, containerWidth, isMobile, cardMinWidth, desktopCols, mobileCols]);

  return (
    <div className="image-grid-wrap" ref={containerRef}>
      {loading && images.length === 0 ? (
        <div className="image-grid-empty">Loading images…</div>
      ) : !loading && images.length === 0 ? (
        <div className="image-grid-empty">{emptyLabel}</div>
      ) : (
        <div
          className="image-grid"
          style={{ height: totalHeight, position: "relative" }}
        >
          {placements.map(({ image, left, top, width, height }) => (
            <button
              key={image.id}
              className="image-card"
              style={{ left, top, width, height }}
              onClick={() => onOpen?.(image)}
              type="button"
            >
              <div className="image-card-frame">
                {image.preview_url ? (
                  <img
                    className="image-card-img"
                    src={image.preview_url}
                    alt={image.title || ""}
                    loading="lazy"
                    draggable={false}
                  />
                ) : (
                  <div className="image-card-placeholder">
                    {image.processing_status === "pending" ? "Processing…"
                      : image.file_kind === "pdf" ? "PDF"
                      : image.file_kind === "eps" ? "EPS"
                      : "—"}
                  </div>
                )}
              </div>
              <div className="image-card-title" title={image.title || undefined}>
                {image.title || "Untitled"}
              </div>
            </button>
          ))}
        </div>
      )}

      <style jsx>{`
        .image-grid-wrap {
          width: 100%;
          padding: 8px ${PADDING_X}px 24px;
          box-sizing: border-box;
        }
        .image-grid-empty {
          padding: 24px;
          text-align: center;
          color: var(--color-text-muted);
          font-size: 13px;
        }
        .image-grid {
          width: 100%;
        }
        .image-card {
          position: absolute;
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          text-align: left;
          display: flex;
          flex-direction: column;
          color: inherit;
        }
        .image-card-frame {
          flex: 1 1 auto;
          width: 100%;
          background: var(--color-bg-secondary);
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
          /* Hover: scale image down + lose the shadow so the card
             appears to lower into the page surface. Inverse of the
             usual lift-on-hover. */
          transition:
            box-shadow 180ms ease,
            transform 180ms ease;
          transform: translateY(0);
          will-change: transform, box-shadow;
        }
        .image-card-img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          transition: transform 180ms ease;
        }
        .image-card:hover .image-card-frame {
          box-shadow: 0 0 0 rgba(0, 0, 0, 0);
          transform: translateY(2px);
        }
        .image-card:hover .image-card-img {
          transform: scale(0.97);
        }
        .image-card-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-muted);
          font-size: 12px;
          letter-spacing: 0.04em;
        }
        .image-card-title {
          margin-top: 8px;
          font-size: 13px;
          color: var(--color-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          opacity: 0.85;
        }
        .image-card:hover .image-card-title {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
