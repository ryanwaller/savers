"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onUploaded: (count: number) => void;
  collectionId?: string | null;
};

type QueueStatus = "queued" | "warning" | "uploading" | "done" | "error";

type QueueItem = {
  id: string;
  file: File;
  status: QueueStatus;
  message?: string;
};

const HARD_CAP_MB = 20;
const SOFT_WARN_MB = 3;

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/svg+xml",
  "application/pdf",
  "application/postscript",
  "image/x-eps",
  "application/eps",
];

function nextId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isAcceptableMime(type: string): boolean {
  if (!type) return false;
  return ACCEPTED_TYPES.includes(type) || type.startsWith("image/");
}

export default function AddImageModal({
  open,
  onClose,
  onUploaded,
  collectionId = null,
}: Props) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setQueue([]);
      setError(null);
      setIsDragging(false);
      setUploading(false);
    }
  }, [open]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;

    setQueue((prev) => {
      const next = [...prev];
      for (const file of arr) {
        if (!isAcceptableMime(file.type)) {
          next.push({
            id: nextId(),
            file,
            status: "error",
            message: `Unsupported type: ${file.type || "unknown"}`,
          });
          continue;
        }

        const sizeMb = file.size / 1024 / 1024;
        if (sizeMb > HARD_CAP_MB) {
          next.push({ id: nextId(), file, status: "error", message: "Too large" });
          continue;
        }

        const status: QueueStatus = sizeMb > SOFT_WARN_MB ? "warning" : "queued";
        const message = status === "warning" ? `Large (${sizeMb.toFixed(1)} MB) — will still upload` : undefined;
        next.push({ id: nextId(), file, status, message });
      }
      return next;
    });
  }, []);

  // Drag-and-drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.types?.includes("Files")) setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if we left the dropzone (not just moved into a child).
    if (e.currentTarget === e.target) setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  // Clipboard paste — when the modal is open, ⌘V drops image data into the queue.
  useEffect(() => {
    if (!open) return;
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [open, addFiles]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !uploading) onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, uploading, onClose]);

  const uploadableCount = useMemo(
    () => queue.filter((q) => q.status === "queued" || q.status === "warning").length,
    [queue],
  );

  async function uploadAll() {
    if (uploading || uploadableCount === 0) return;
    setUploading(true);
    setError(null);

    let succeeded = 0;
    const updates = new Map<string, { status: QueueStatus; message?: string }>();

    // Mark uploadable items as uploading
    setQueue((prev) =>
      prev.map((q) =>
        q.status === "queued" || q.status === "warning"
          ? { ...q, status: "uploading", message: undefined }
          : q,
      ),
    );

    // Upload one at a time to keep memory + network sane. We could batch
    // 2-3 in parallel later; one-at-a-time is fine for v1.
    for (const item of queue) {
      if (item.status !== "queued" && item.status !== "warning") continue;
      const fd = new FormData();
      fd.append("files", item.file);
      if (collectionId) fd.append("collection_id", collectionId);
      try {
        const res = await fetch("/api/images/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          updates.set(item.id, {
            status: "error",
            message: body?.error || `Upload failed (${res.status})`,
          });
          continue;
        }
        const body = await res.json();
        if (body.errors?.length) {
          updates.set(item.id, { status: "error", message: body.errors[0].reason });
        } else {
          updates.set(item.id, { status: "done" });
          succeeded++;
        }
      } catch (err) {
        updates.set(item.id, {
          status: "error",
          message: err instanceof Error ? err.message : "Upload failed",
        });
      }
    }

    setQueue((prev) =>
      prev.map((q) => {
        const u = updates.get(q.id);
        return u ? { ...q, ...u } : q;
      }),
    );

    setUploading(false);

    if (succeeded > 0) {
      onUploaded(succeeded);
    }
  }

  function removeItem(id: string) {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }

  if (!open) return null;

  const allDone = queue.length > 0 && queue.every((q) => q.status === "done");

  return (
    <div className="add-image-backdrop" onClick={() => !uploading && onClose()}>
      <div className="add-image-panel" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div className="title">Add images</div>
          <button
            className="close"
            onClick={onClose}
            disabled={uploading}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div
          className={`dropzone ${isDragging ? "dragging" : ""}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <div className="dropzone-title">
            {isDragging ? "Release to add" : "Drop images here"}
          </div>
          <div className="dropzone-sub">
            or click to choose &nbsp;·&nbsp; ⌘V to paste
          </div>
          <div className="dropzone-meta">
            JPG, PNG, WebP, GIF, HEIC, SVG, PDF, EPS &nbsp;·&nbsp; max {HARD_CAP_MB}&nbsp;MB
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES.join(",")}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";  // allow re-choosing the same file
            }}
            style={{ display: "none" }}
          />
        </div>

        {queue.length > 0 && (
          <div className="queue">
            {queue.map((item) => (
              <div key={item.id} className={`q-item q-${item.status}`}>
                <div className="q-info">
                  <div className="q-name" title={item.file.name}>{item.file.name}</div>
                  <div className="q-meta">
                    {formatBytes(item.file.size)}
                    {item.message && <span className="q-msg"> — {item.message}</span>}
                  </div>
                </div>
                <div className="q-status-area">
                  <div className={`q-pill q-pill-${item.status}`}>
                    {item.status === "uploading" ? "Uploading…"
                      : item.status === "done" ? "Done"
                      : item.status === "error" ? "Failed"
                      : item.status === "warning" ? "Large"
                      : "Queued"}
                  </div>
                  {!uploading && item.status !== "done" && (
                    <button className="q-remove" onClick={() => removeItem(item.id)} aria-label="Remove">×</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <div className="error">{error}</div>}

        <div className="foot">
          <button className="btn ghost" onClick={onClose} disabled={uploading}>
            {allDone ? "Close" : "Cancel"}
          </button>
          <button
            className="btn primary"
            onClick={uploadAll}
            disabled={uploading || uploadableCount === 0}
          >
            {uploading ? "Uploading…" : uploadableCount > 0
              ? `Upload ${uploadableCount}${uploadableCount > 1 ? " files" : " file"}`
              : "Upload"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .add-image-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .add-image-panel {
          background: var(--color-surface);
          color: var(--color-text);
          border: 1px solid var(--color-border);
          border-radius: 16px;
          width: 100%;
          max-width: 600px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        }
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 18px;
          border-bottom: 1px solid var(--color-border);
        }
        .title {
          font-size: 16px;
          font-weight: 600;
        }
        .close {
          width: 28px;
          height: 28px;
          border-radius: 14px;
          border: 1px solid var(--color-border);
          background: transparent;
          color: var(--color-text);
          font-size: 18px;
          line-height: 1;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .close:hover { background: var(--color-hover); }
        .close:disabled { opacity: 0.4; cursor: not-allowed; }

        .dropzone {
          margin: 16px 18px;
          padding: 36px 16px;
          border: 1.5px dashed var(--color-border);
          border-radius: 12px;
          text-align: center;
          cursor: pointer;
          transition: background 120ms ease, border-color 120ms ease;
        }
        .dropzone:hover { background: var(--color-hover); }
        .dropzone.dragging {
          border-color: var(--color-text);
          background: var(--color-hover);
        }
        .dropzone-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
        .dropzone-sub { font-size: 13px; color: var(--color-text-muted); margin-bottom: 8px; }
        .dropzone-meta { font-size: 11px; color: var(--color-text-muted); letter-spacing: 0.02em; }

        .queue {
          padding: 4px 18px 8px;
          overflow-y: auto;
          flex: 1 1 auto;
        }
        .q-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          border-top: 1px solid var(--color-border);
        }
        .q-item:first-child { border-top: none; }
        .q-info { flex: 1 1 auto; min-width: 0; }
        .q-name {
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .q-meta { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }
        .q-msg { color: var(--color-text-muted); }
        .q-error .q-msg { color: #d96a6a; }
        .q-warning .q-msg { color: #d3a64a; }

        .q-status-area { display: flex; align-items: center; gap: 6px; }
        .q-pill {
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 99px;
          letter-spacing: 0.02em;
          background: var(--color-hover);
          color: var(--color-text-muted);
        }
        .q-pill-uploading { background: rgba(120, 140, 200, 0.18); color: #b2c2ec; }
        .q-pill-done { background: rgba(80, 160, 100, 0.18); color: #8fcd9b; }
        .q-pill-error { background: rgba(220, 80, 80, 0.18); color: #e0a2a2; }
        .q-pill-warning { background: rgba(200, 160, 80, 0.18); color: #e4c685; }
        .q-remove {
          width: 22px;
          height: 22px;
          border-radius: 11px;
          border: 1px solid var(--color-border);
          background: transparent;
          color: var(--color-text-muted);
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .q-remove:hover { color: var(--color-text); border-color: var(--color-text); }

        .error {
          margin: 0 18px 12px;
          padding: 10px 12px;
          background: rgba(220, 80, 80, 0.12);
          color: #e0a2a2;
          border-radius: 8px;
          font-size: 13px;
        }

        .foot {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 12px 18px;
          border-top: 1px solid var(--color-border);
        }
        .btn {
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid var(--color-border);
        }
        .btn.ghost { background: transparent; color: var(--color-text); }
        .btn.ghost:hover { background: var(--color-hover); }
        .btn.primary { background: var(--color-text); color: var(--color-bg); border-color: var(--color-text); }
        .btn.primary:disabled, .btn.ghost:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
