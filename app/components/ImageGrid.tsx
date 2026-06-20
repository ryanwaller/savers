"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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
  ai_processed_at?: string | null;
  ai_failed_at?: string | null;
  source_url: string | null;
  collection_id?: string | null;
  tags?: string[];
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
  cardSize?: "s" | "m" | "l" | "xl";
  /** Fixed column count override. If set, ignores cardMinWidth. */
  desktopCols?: number;
  mobileCols?: number;
  /** "grid" → masonry. "list" → dense single-column rows. */
  viewMode?: "grid" | "list";
  /** Bulk-select mode: shows checkboxes and lets the parent track the set. */
  isEditMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, shiftKey: boolean) => void;
  /** Single click on the card. Opens the slideshow viewer. */
  onOpen?: (image: ImageRow) => void;
  /** Opens the right-side edit panel from the kebab menu. */
  onEdit?: (image: ImageRow) => void;
  /** Deletes the image (with confirm). Triggered from the kebab menu. */
  onDelete?: (image: ImageRow) => void | Promise<void>;
};

// Match BookmarkGrid's DESKTOP_GAP_PX / DESKTOP_PADDING_X_PX so the
// image grid spacing reads identically to the link grid.
const GAP = 20;
const PADDING_X = 20;
const DEFAULT_MIN_WIDTH = 240;
const FALLBACK_ASPECT = 1; // square for images without dimensions yet

type Placement = {
  image: ImageRow;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Just the image portion of the card; the title sits below this. */
  frameHeight: number;
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
  cardSize = "m",
  desktopCols,
  mobileCols,
  viewMode = "grid",
  isEditMode = false,
  selectedIds,
  onToggleSelect,
  onOpen,
  onEdit,
  onDelete,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const shellRadius =
    cardSize === "s" ? 12 : cardSize === "m" ? 16 : cardSize === "l" ? 22 : 28;
  const innerRadius = Math.max(8, shellRadius - 6);

  // Close the open menu on outside click or Escape.
  useEffect(() => {
    if (!openMenuId) return;
    function onClickAway(e: MouseEvent) {
      // Only close if the click landed outside the menu's own DOM.
      // Otherwise the mousedown would unmount the menu before the actual
      // click on a menu item gets a chance to fire — meaning Edit/Delete
      // would never trigger.
      const target = e.target as HTMLElement | null;
      if (target?.closest(".image-card-actions")) return;
      setOpenMenuId(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenuId(null);
    }
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuId]);

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
        frameHeight: imageH,
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
      ) : viewMode === "list" ? (
        <div
          className="image-list"
          style={
            {
              ["--image-card-radius" as string]: `${shellRadius}px`,
              ["--image-inner-radius" as string]: `${innerRadius}px`,
            } as CSSProperties
          }
        >
          {images.map((image) => {
            const selected = selectedIds?.has(image.id) ?? false;
            return (
              <button
                key={image.id}
                type="button"
                className={`image-list-row ${selected ? "selected" : ""}`}
                onClick={(e) => {
                  if (isEditMode) {
                    onToggleSelect?.(image.id, e.shiftKey);
                  } else {
                    onOpen?.(image);
                  }
                }}
              >
                {isEditMode && (
                  <span
                    className={`image-list-check ${selected ? "on" : ""}`}
                    aria-hidden
                  >
                    {selected && (
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M3 8l3.5 3.5L13 5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                )}
                <span className="image-list-thumb">
                  {image.preview_url ? (
                    <img src={image.preview_url} alt="" loading="lazy" draggable={false} />
                  ) : (
                    <span className="image-list-thumb-fallback">
                      {image.file_kind?.toUpperCase() || "—"}
                    </span>
                  )}
                </span>
                <span className="image-list-meta">
                  <span className="image-list-title">{image.title || "Untitled"}</span>
                  <span className="image-list-sub">
                    {image.file_kind?.toUpperCase()} ·{" "}
                    {image.width && image.height
                      ? `${image.width} × ${image.height}`
                      : "—"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div
          className="image-grid"
          style={
            {
              height: totalHeight,
              position: "relative",
              ["--image-card-radius" as string]: `${shellRadius}px`,
              ["--image-inner-radius" as string]: `${innerRadius}px`,
            } as CSSProperties
          }
        >
          {placements.map(({ image, left, top, width, height, frameHeight }) => {
            const menuOpen = openMenuId === image.id;
            const selected = selectedIds?.has(image.id) ?? false;
            return (
              <div
                key={image.id}
                className={`image-card-wrap ${selected ? "selected" : ""}`}
                style={{ left, top, width, height, position: "absolute" }}
              >
                <button
                  className="image-card"
                  onClick={(e) => {
                    if (isEditMode) {
                      onToggleSelect?.(image.id, e.shiftKey);
                    } else {
                      onOpen?.(image);
                    }
                  }}
                  type="button"
                >
                  {isEditMode && (
                    <span
                      className={`image-card-check ${selected ? "on" : ""}`}
                      aria-hidden
                    >
                      {selected && (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <path
                            d="M3 8l3.5 3.5L13 5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                  )}
                  <div
                    className="image-card-frame"
                    style={{ height: frameHeight }}
                  >
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

                {(onEdit || onDelete) && (
                  <div className={`image-card-actions ${menuOpen ? "menu-open" : ""}`}>
                    <button
                      type="button"
                      className="image-card-menu-trigger"
                      aria-label="Image options"
                      aria-expanded={menuOpen}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(menuOpen ? null : image.id);
                      }}
                    >
                      ⋮
                    </button>
                    {menuOpen && (
                      <div
                        className="image-card-menu"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {onEdit && (
                          <button
                            className="image-card-menu-item"
                            onClick={() => {
                              setOpenMenuId(null);
                              onEdit(image);
                            }}
                          >
                            Edit
                          </button>
                        )}
                        {onDelete && (
                          <button
                            className="image-card-menu-item danger"
                            onClick={() => {
                              setOpenMenuId(null);
                              if (
                                confirm(
                                  `Delete "${image.title || "this image"}"? This cannot be undone.`,
                                )
                              ) {
                                void onDelete(image);
                              }
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .image-grid-wrap {
          width: 100%;
          /* Match BookmarkGrid's .grid: 20px on all sides, with a
             80px bottom for breathing room below the last row. */
          padding: ${PADDING_X}px;
          padding-bottom: 80px;
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
        .image-card-wrap {
          /* positioned by inline style. */
        }
        .image-card {
          width: 100%;
          height: 100%;
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          text-align: left;
          /* Block instead of flex so the .image-card-frame's explicit
             inline height (= colWidth × imageAspect) is honored exactly
             and the title flows naturally below. flex-grow on the frame
             previously absorbed leftover space, which caused the
             letterbox bands. */
          display: block;
          color: inherit;
        }
        .image-card-frame {
          /* No flex — height set inline from the masonry placement so the
             frame matches the image's natural aspect exactly. */
          width: 100%;
          /* Transparent so the image scale-down on hover doesn't reveal
             a gray edge around the photo. The placeholder div below
             keeps its own background for PDF/EPS/processing states. */
          background: transparent;
          border-radius: var(--image-inner-radius, 8px);
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
          /* object-fit contain so the natural aspect ratio is always
             preserved — never crop. The masonry layout sizes each card
             based on the image dimensions, so contain usually fills
             cleanly, and letterboxes a few px when the stored dims are
             slightly off (e.g. older EXIF-rotated uploads). */
          object-fit: contain;
          object-position: center;
          transition: transform 180ms ease;
        }
        .image-card:hover .image-card-frame {
          box-shadow: 0 0 0 rgba(0, 0, 0, 0);
          /* Subtler press — was 2px and felt heavy. */
          transform: translateY(1px);
        }
        .image-card:hover .image-card-img {
          /* Was 0.97; smaller scale-down so the press is just a hint. */
          transform: scale(0.99);
        }
        .image-card-placeholder {
          width: 100%;
          height: 100%;
          /* Only the placeholder gets the gray fill — the frame is
             transparent so real images don't show a halo on hover. */
          background: var(--color-bg-secondary);
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

        /* List view — dense single-column rows, no masonry math. */
        .image-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .image-list-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 10px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--image-card-radius, 8px);
          cursor: pointer;
          text-align: left;
          color: inherit;
          width: 100%;
        }
        .image-list-row:hover {
          background: var(--color-bg-hover);
        }
        .image-list-row.selected {
          background: var(--color-bg-active);
          border-color: var(--color-border-strong);
        }
        /* Matches .select-btn on the link side: 26px circle, light glass
           background when off, filled with --color-text when on. */
        .image-list-check {
          width: 26px;
          height: 26px;
          flex-shrink: 0;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: color-mix(in srgb, var(--color-bg) 94%, transparent);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          color: var(--color-text-muted);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .image-list-check.on {
          background: var(--color-text);
          border-color: var(--color-text);
          color: var(--color-bg);
        }
        .image-list-thumb {
          width: 56px;
          height: 56px;
          flex-shrink: 0;
          border-radius: var(--image-inner-radius, 6px);
          overflow: hidden;
          background: var(--color-bg-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .image-list-thumb img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
        }
        .image-list-thumb-fallback {
          font-size: 11px;
          color: var(--color-text-muted);
          letter-spacing: 0.04em;
        }
        .image-list-meta {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1 1 auto;
        }
        .image-list-title {
          font-size: 13px;
          color: var(--color-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .image-list-sub {
          font-size: 11px;
          color: var(--color-text-muted);
        }

        /* Edit mode — selection ring + corner checkbox on the masonry card. */
        .image-card-wrap.selected .image-card-frame {
          box-shadow: 0 0 0 3px var(--color-text);
        }
        /* Match .select-btn on the link card — 32px circle, top-left
           corner, light glass when off, filled with --color-text when on,
           same opaque pill style. */
        .image-card-check {
          position: absolute;
          top: 8px;
          left: 8px;
          z-index: 3;
          width: 32px;
          height: 32px;
          border-radius: 999px;
          border: 1px solid var(--color-border);
          background: color-mix(in srgb, var(--color-bg) 94%, transparent);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          color: var(--color-text-muted);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .image-card-check.on {
          background: var(--color-text);
          border-color: var(--color-text);
          color: var(--color-bg);
        }

        /* Hover-revealed circle kebab menu — matches the link card
           pattern. */
        .image-card-actions {
          position: absolute;
          /* Pushed down + in slightly from the corner so the kebab feels
             centered against the artwork rather than nailed to the edge. */
          top: 14px;
          right: 14px;
          z-index: 2;
        }
        .image-card-menu-trigger {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: color-mix(in srgb, var(--color-bg) 94%, transparent);
          font-size: 14px;
          line-height: 1;
          color: var(--color-text-muted);
          cursor: pointer;
          opacity: 0;
          transform: translateY(6px) scale(0.92);
          pointer-events: none;
          transition:
            opacity 160ms ease,
            transform 180ms cubic-bezier(0.2, 0.8, 0.25, 1),
            color 120ms ease,
            background 120ms ease,
            border-color 120ms ease;
        }
        .image-card-wrap:hover .image-card-menu-trigger,
        .image-card-actions.menu-open .image-card-menu-trigger {
          opacity: 1;
          transform: translateY(0) scale(1);
          pointer-events: auto;
        }
        .image-card-menu-trigger:hover {
          color: var(--color-text);
          border-color: var(--color-border-strong);
          background: var(--color-bg);
        }
        @media (hover: none) {
          .image-card-menu-trigger {
            opacity: 1;
            transform: none;
            pointer-events: auto;
          }
        }
        .image-card-menu {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          min-width: 112px;
          border: 1px solid var(--color-border);
          border-radius: 10px;
          background: var(--color-bg);
          overflow: hidden;
          z-index: 4;
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
        }
        .image-card-menu-item {
          width: 100%;
          text-align: left;
          padding: 8px 10px;
          font-size: 12px;
          color: var(--color-text);
          background: transparent;
          border: none;
          cursor: pointer;
        }
        .image-card-menu-item:hover {
          background: var(--color-bg-hover);
        }
        .image-card-menu-item.danger {
          color: #d96a6a;
        }
      `}</style>
    </div>
  );
}
