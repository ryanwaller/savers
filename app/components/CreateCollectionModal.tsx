"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import CollectionIcon from "./CollectionIcon";
import IconPicker from "./IconPicker";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export default function CreateCollectionModal({
  open,
  onClose,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setIcon(null);
    setShowIconPicker(false);
    setError(null);
  }, [open]);

  if (!open) return null;

  async function save() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { collection } = await api.createCollection(name.trim(), null);
      if (icon) {
        await api.updateCollection(collection.id, { icon });
      }
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create collection");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div className="title">New collection</div>
          <button className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="body">
          <div className="name-row">
            <button
              className="icon-btn"
              onClick={() => setShowIconPicker(!showIconPicker)}
              title="Choose icon"
            >
              <CollectionIcon name={icon} size={16} />
            </button>
            {showIconPicker && (
              <div className="icon-picker-wrap">
                <div className="icon-picker-backdrop" onClick={() => setShowIconPicker(false)} />
                <div className="icon-picker-popup">
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
              className="name-input"
              placeholder="Collection name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              autoFocus
            />
          </div>

          {error && <div className="error small">{error}</div>}
        </div>

        <div className="foot">
          <button className="cancel-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="save-btn" onClick={save} disabled={saving}>
            {saving ? "Creating…" : "Create collection"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.32);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 65;
          padding: 24px;
        }
        .panel {
          width: 560px;
          max-width: 100%;
          max-height: 86vh;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--color-border);
        }
        .title {
          font-weight: 600;
          font-size: 12px;
        }
        .close {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--color-border);
          border-radius: 999px;
          background: var(--color-bg);
          color: var(--color-text-muted);
          cursor: pointer;
          font-size: 12px;
          line-height: 17px;
          padding-bottom: 2px;
        }
        .close:hover {
          border-color: var(--color-border-strong);
          color: var(--color-text);
        }
        .body {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .name-row {
          display: flex;
          align-items: center;
          gap: 8px;
          position: relative;
        }
        .icon-btn {
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg);
          color: var(--color-text-muted);
          cursor: pointer;
          flex-shrink: 0;
        }
        .icon-btn:hover {
          border-color: var(--color-border-strong);
          color: var(--color-text);
        }
        .icon-picker-wrap {
          position: absolute;
          top: 44px;
          left: 0;
          z-index: 70;
        }
        .icon-picker-backdrop {
          position: fixed;
          inset: 0;
          z-index: -1;
        }
        .name-input {
          flex: 1;
          height: 36px;
          padding: 0 10px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg);
          color: var(--color-text);
          font: inherit;
          font-size: 12px;
          outline: none;
        }
        .name-input:focus {
          border-color: var(--color-border-strong);
        }
        .foot {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          padding: 12px 16px;
          border-top: 1px solid var(--color-border);
        }
        .cancel-btn {
          height: 32px;
          padding: 0 12px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg);
          color: var(--color-text);
          font: inherit;
          font-size: 12px;
          cursor: pointer;
        }
        .cancel-btn:hover {
          border-color: var(--color-border-strong);
        }
        .save-btn {
          height: 32px;
          padding: 0 14px;
          border: 1px solid transparent;
          border-radius: 6px;
          background: var(--color-text);
          color: var(--color-bg);
          font: inherit;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
        }
        .save-btn:hover:not(:disabled) {
          opacity: 0.88;
        }
        .save-btn:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .small {
          font-size: 12px;
        }
        .error {
          color: #d13030;
        }
        @media (max-width: 768px) {
          .backdrop {
            padding: 0;
            align-items: stretch;
          }
          .panel {
            border-radius: 0;
            max-height: 100dvh;
            width: 100%;
            border: 0;
          }
        }
      `}</style>
    </div>
  );
}
