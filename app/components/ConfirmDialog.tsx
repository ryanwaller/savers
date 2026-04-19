"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel, open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="confirm-backdrop" onClick={() => !busy && onCancel()}>
      <div
        className="confirm-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-body">
          <div id="confirm-title" className="confirm-title">
            {title}
          </div>
          {description && <div className="confirm-description muted">{description}</div>}
        </div>
        <div className="confirm-actions">
          <button className="btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className="btn btn-primary destructive" onClick={() => void onConfirm()} disabled={busy}>
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>

      <style jsx>{`
        .confirm-backdrop {
          position: fixed;
          inset: 0;
          z-index: 120;
          background: rgba(0, 0, 0, 0.34);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .confirm-panel {
          width: min(360px, 100%);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          background: var(--color-bg);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
        }
        .confirm-body {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .confirm-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--color-text);
        }
        .confirm-description {
          font-size: 12px;
          line-height: 1.45;
        }
        .confirm-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 0 16px 16px;
        }
        .destructive {
          background: var(--color-text);
          border-color: var(--color-text);
          color: var(--color-bg);
        }
      `}</style>
    </div>,
    document.body
  );
}
