"use client";

import { useEffect, useRef, useState } from "react";
import CollectionIcon from "./CollectionIcon";
import IconPicker from "./IconPicker";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
  parentId?: string | null;
};

export default function CreateImageCollectionModal({
  open,
  onClose,
  onCreated,
  parentId = null,
}: Props) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setIcon(null);
    setShowIconPicker(false);
    setError(null);
    setSaving(false);
    // Focus the name input on open
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  async function save() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/image-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), parent_id: parentId, icon }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || "Failed to create folder");
        setSaving(false);
        return;
      }
      onCreated?.(body.collection.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create folder");
      setSaving(false);
    }
  }

  return (
    <div className="ic-backdrop" onClick={() => !saving && onClose()}>
      <div className="ic-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ic-head">
          <div className="ic-title">New image folder</div>
          <button
            className="ic-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="ic-body">
          <div className="ic-name-row">
            <button
              className="ic-icon-btn"
              onClick={() => setShowIconPicker((v) => !v)}
              title="Choose icon"
              type="button"
            >
              <CollectionIcon name={icon} size={16} />
            </button>
            {showIconPicker && (
              <div className="ic-icon-picker-wrap">
                <div className="ic-icon-picker-backdrop" onClick={() => setShowIconPicker(false)} />
                <div className="ic-icon-picker-popup">
                  <IconPicker
                    value={icon}
                    onPick={(name) => {
                      setIcon(name);
                      setShowIconPicker(false);
                    }}
                    onClose={() => setShowIconPicker(false)}
                  />
                </div>
              </div>
            )}
            <input
              ref={inputRef}
              className="ic-input"
              placeholder="Folder name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
              }}
              disabled={saving}
            />
          </div>
          {error && <div className="ic-error">{error}</div>}
        </div>

        <div className="ic-foot">
          <button className="ic-btn ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="ic-btn primary"
            onClick={save}
            disabled={saving || !name.trim()}
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .ic-backdrop {
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
        .ic-panel {
          background: var(--color-bg);
          color: var(--color-text);
          border: 1px solid var(--color-border);
          border-radius: 16px;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        }
        .ic-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid var(--color-border);
        }
        .ic-title { font-size: 15px; font-weight: 600; }
        .ic-close {
          width: 26px;
          height: 26px;
          border-radius: 13px;
          border: 1px solid var(--color-border);
          background: transparent;
          color: var(--color-text);
          font-size: 16px;
          cursor: pointer;
        }
        .ic-close:hover { background: var(--color-bg-hover); }
        .ic-close:disabled { opacity: 0.4; cursor: not-allowed; }

        .ic-body { padding: 16px 18px; }
        .ic-name-row {
          display: flex;
          align-items: stretch;
          gap: 8px;
          position: relative;
        }
        .ic-icon-btn {
          width: 38px;
          flex-shrink: 0;
          background: transparent;
          color: var(--color-text);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .ic-icon-btn:hover { background: var(--color-bg-hover); }
        .ic-icon-picker-wrap {
          position: absolute;
          top: 100%;
          left: 0;
          z-index: 30;
          margin-top: 6px;
        }
        .ic-icon-picker-backdrop {
          position: fixed;
          inset: 0;
        }
        .ic-icon-picker-popup {
          position: relative;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
        }
        .ic-input {
          width: 100%;
          flex: 1 1 auto;
          padding: 10px 12px;
          font-size: 14px;
          border: 1px solid var(--color-border);
          border-radius: 8px;
          background: var(--color-bg);
          color: var(--color-text);
          box-sizing: border-box;
        }
        .ic-input:focus {
          outline: none;
          border-color: var(--color-border-strong);
        }
        .ic-error {
          margin-top: 10px;
          padding: 8px 10px;
          background: rgba(220, 80, 80, 0.12);
          color: #d96a6a;
          border-radius: 6px;
          font-size: 12px;
        }

        .ic-foot {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 12px 18px;
          border-top: 1px solid var(--color-border);
        }
        .ic-btn {
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid var(--color-border);
        }
        .ic-btn.ghost { background: transparent; color: var(--color-text); }
        .ic-btn.ghost:hover { background: var(--color-bg-hover); }
        .ic-btn.primary {
          background: var(--color-text);
          color: var(--color-bg);
          border-color: var(--color-text);
        }
        .ic-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
