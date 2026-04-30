"use client";

import { useEffect, useState } from "react";
import type { Collection } from "@/lib/types";

type Props = {
  collection: Collection | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (next: Collection) => void;
};

type VisibilityResponse = {
  collection: {
    id: string;
    is_public: boolean;
    public_id: string | null;
    public_slug: string | null;
    public_description: string | null;
  };
  error?: string;
};

export default function SharingModal({
  collection,
  open,
  onClose,
  onUpdate,
}: Props) {
  const [isPublic, setIsPublic] = useState(false);
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [slugDirty, setSlugDirty] = useState(false);
  const [descDirty, setDescDirty] = useState(false);

  useEffect(() => {
    if (!open || !collection) return;
    setIsPublic(Boolean(collection.is_public));
    setSlug(collection.public_slug ?? "");
    setDescription(collection.public_description ?? "");
    setError(null);
    setCopied(false);
    setSlugDirty(false);
    setDescDirty(false);
  }, [open, collection]);

  if (!open || !collection) return null;

  const baseOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const handle = collection.public_slug || collection.public_id;
  const shareUrl =
    collection.is_public && handle ? `${baseOrigin}/c/${handle}` : null;

  async function save(nextPublic: boolean): Promise<void> {
    if (!collection) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        id: collection.id,
        is_public: nextPublic,
      };
      if (nextPublic) {
        body.public_slug = slug.trim() || null;
        body.public_description = description.trim() || null;
      }
      const res = await fetch("/api/collections/visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json: VisibilityResponse = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `Failed (${res.status})`);
      }
      const updated: Collection = {
        ...collection,
        is_public: json.collection.is_public,
        public_id: json.collection.public_id,
        public_slug: json.collection.public_slug,
        public_description: json.collection.public_description,
      };
      onUpdate(updated);
      setIsPublic(json.collection.is_public);
      setSlugDirty(false);
      setDescDirty(false);
      if (json.collection.public_slug !== null) {
        setSlug(json.collection.public_slug);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update sharing.");
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div className="title">Share &ldquo;{collection.name}&rdquo;</div>
          <button className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="body">
          <div className="row">
            <div className="row-text">
              <div className="row-title">Public</div>
              <div className="row-sub small muted">
                Anyone with the link can view. No sign-in required.
              </div>
            </div>
            <button
              role="switch"
              aria-checked={isPublic}
              className={`switch ${isPublic ? "on" : ""}`}
              onClick={() => {
                const next = !isPublic;
                setIsPublic(next);
                void save(next);
              }}
              disabled={saving}
            >
              <span className="knob" />
            </button>
          </div>

          {isPublic && (
            <>
              {shareUrl && (
                <div className="link-row">
                  <code className="link">{shareUrl}</code>
                  <button className="btn" onClick={copyLink}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              )}

              <label className="field">
                <span className="label">Vanity slug (optional)</span>
                <div className="slug-row">
                  <span className="slug-prefix muted small">c/</span>
                  <input
                    placeholder="typographers"
                    value={slug}
                    onChange={(e) => {
                      setSlugDirty(true);
                      setSlug(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void save(true);
                      }
                    }}
                    disabled={saving}
                  />
                  {slugDirty && (
                    <button
                      className="slug-save"
                      onClick={() => void save(true)}
                      disabled={saving}
                    >
                      {saving ? "…" : "Save"}
                    </button>
                  )}
                </div>
                <span className="hint small muted">
                  Lowercase letters, digits, and hyphens. Leave blank for the
                  random ID.
                </span>
              </label>

              <label className="field">
                <span className="label">Description (optional)</span>
                <textarea
                  rows={2}
                  placeholder="What this collection is for. Shows on the public page."
                  value={description}
                  maxLength={280}
                  onChange={(e) => {
                    setDescDirty(true);
                    setDescription(e.target.value);
                  }}
                  disabled={saving}
                />
                {descDirty && (
                  <button
                    className="desc-save"
                    onClick={() => void save(true)}
                    disabled={saving}
                  >
                    {saving ? "…" : "Save"}
                  </button>
                )}
              </label>
            </>
          )}

          {error && <div className="error small">{error}</div>}
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
          width: 480px;
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
          font-size: 13px;
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
          font-size: 18px;
          line-height: 1;
          padding-bottom: 2px;
        }
        .close:hover {
          border-color: var(--color-border-strong);
          color: var(--color-text);
        }
        .body {
          padding: 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .row-title {
          font-weight: 500;
        }
        .row-sub {
          margin-top: 2px;
        }
        .switch {
          width: 36px;
          height: 22px;
          border-radius: 999px;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          padding: 1px;
          position: relative;
          cursor: pointer;
          transition: background 120ms ease, border-color 120ms ease;
        }
        .switch.on {
          background: var(--color-text);
          border-color: var(--color-text);
        }
        .knob {
          position: absolute;
          top: 1px;
          left: 1px;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: var(--color-bg);
          transition: transform 140ms ease;
        }
        .switch.on .knob {
          transform: translateX(14px);
        }
        .link-row {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .link {
          flex: 1 1 auto;
          min-width: 0;
          padding: 8px 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: 6px;
          word-break: break-all;
          user-select: all;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .label {
          font-size: 12px;
          color: var(--color-text-muted);
        }
        .slug-row {
          display: flex;
          align-items: stretch;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg);
        }
        .slug-prefix {
          display: inline-flex;
          align-items: center;
          padding: 0 0 0 10px;
          color: var(--color-text-muted);
          flex-shrink: 0;
          white-space: nowrap;
        }
        .slug-row input {
          flex: 1 1 auto;
          padding: 8px 10px;
          border: 0;
          background: transparent;
          color: var(--color-text);
          font: inherit;
          outline: none;
        }
        .slug-save {
          appearance: none;
          flex-shrink: 0;
          padding: 0 10px;
          border: 0;
          border-left: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
          color: var(--color-text);
          font: inherit;
          font-size: 12px;
          cursor: pointer;
          white-space: nowrap;
        }
        .slug-save:hover {
          background: var(--color-bg-hover);
        }
        .slug-save:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .desc-save {
          appearance: none;
          align-self: flex-end;
          padding: 4px 10px;
          border: 1px solid var(--color-border);
          border-radius: 4px;
          background: var(--color-bg-secondary);
          color: var(--color-text);
          font: inherit;
          font-size: 12px;
          cursor: pointer;
          margin-top: 4px;
        }
        .desc-save:hover {
          background: var(--color-bg-hover);
        }
        .desc-save:disabled {
          opacity: 0.5;
          cursor: default;
        }
        textarea {
          padding: 8px 10px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-bg);
          color: var(--color-text);
          font: inherit;
          resize: vertical;
          min-height: 56px;
        }
        .hint {
          margin-top: 2px;
        }
        .small {
          font-size: 12px;
        }
        .muted {
          color: var(--color-text-muted);
        }
        .error {
          color: #ff7a7a;
        }
        .btn {
          appearance: none;
          font: inherit;
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid var(--color-border);
          background: var(--color-text);
          color: var(--color-bg);
          cursor: pointer;
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
