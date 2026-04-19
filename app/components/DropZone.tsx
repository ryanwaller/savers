"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractUrlsFromDataTransfer, hasDroppableContent } from "@/lib/webloc";

type Props = {
  onUrls: (urls: string[]) => void;
  children: React.ReactNode;
};

// Full-viewport drop zone. Shows an overlay while an external file/URL
// is being dragged over the window.
export default function DropZone({ onUrls, children }: Props) {
  const [active, setActive] = useState(false);
  const depthRef = useRef(0);
  const internalDragRef = useRef(false);

  const onEnter = useCallback((e: DragEvent) => {
    if (internalDragRef.current) return;
    if (!hasDroppableContent(e.dataTransfer)) return;
    e.preventDefault();
    depthRef.current += 1;
    setActive(true);
  }, []);

  const onOver = useCallback((e: DragEvent) => {
    if (internalDragRef.current) return;
    if (!hasDroppableContent(e.dataTransfer)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }, []);

  const onLeave = useCallback((e: DragEvent) => {
    if (internalDragRef.current) return;
    if (!hasDroppableContent(e.dataTransfer)) return;
    e.preventDefault();
    depthRef.current -= 1;
    if (depthRef.current <= 0) {
      depthRef.current = 0;
      setActive(false);
    }
  }, []);

  const onDrop = useCallback(
    async (e: DragEvent) => {
      if (internalDragRef.current) {
        internalDragRef.current = false;
        depthRef.current = 0;
        setActive(false);
        return;
      }
      if (!e.dataTransfer) return;
      if (!hasDroppableContent(e.dataTransfer)) return;
      e.preventDefault();
      depthRef.current = 0;
      setActive(false);
      const urls = await extractUrlsFromDataTransfer(e.dataTransfer);
      if (urls.length) onUrls(urls);
    },
    [onUrls]
  );

  useEffect(() => {
    const handleDragStart = (e: DragEvent) => {
      const target = e.target;
      internalDragRef.current =
        target instanceof Element && !!target.closest("[data-savers-app]");
      if (internalDragRef.current) {
        depthRef.current = 0;
        setActive(false);
      }
    };

    const clearInternalDrag = () => {
      internalDragRef.current = false;
    };

    document.addEventListener("dragstart", handleDragStart, true);
    document.addEventListener("dragend", clearInternalDrag, true);
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragstart", handleDragStart, true);
      document.removeEventListener("dragend", clearInternalDrag, true);
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [onEnter, onOver, onLeave, onDrop]);

  return (
    <>
      {children}
      {active && (
        <div className="drop-overlay" aria-hidden>
          <div className="drop-card">
            <div className="drop-mark">⤓</div>
            <div className="drop-title">Drop to save</div>
            <div className="drop-sub small muted">
              .webloc files or URLs from the address bar
            </div>
          </div>
          <style jsx>{`
            .drop-overlay {
              position: fixed;
              inset: 0;
              background: rgba(0, 0, 0, 0.22);
              z-index: 80;
              display: flex;
              align-items: center;
              justify-content: center;
              pointer-events: none;
              animation: fade 120ms ease;
            }
            @keyframes fade {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            .drop-card {
              background: var(--color-bg);
              border: 1px dashed var(--color-border-strong);
              border-radius: var(--radius-lg);
              padding: 24px 28px;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 6px;
              min-width: 240px;
            }
            .drop-mark {
              font-size: 24px;
              color: var(--color-text-muted);
              margin-bottom: 4px;
            }
            .drop-title { font-size: 12px; font-weight: 500; }
            .drop-sub { text-align: center; }
          `}</style>
        </div>
      )}
    </>
  );
}
