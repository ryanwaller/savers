"use client";

import { useState } from "react";

interface ExcerptCardProps {
  bookmark: {
    id: string;
    excerpt_text?: string | null;
    excerpt_source?: string | null;
  };
  onUpdate?: () => void;
}

export function ExcerptCard({ bookmark, onUpdate }: ExcerptCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(bookmark.excerpt_text || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/bookmarks/${bookmark.id}/excerpt`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onUpdate?.();
    } catch {
      // Keep local state on failure
    } finally {
      setSaving(false);
      setIsEditing(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/bookmarks/${bookmark.id}/excerpt`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onUpdate?.();
    } catch {
      // keep excerpt visible on failure
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setText(bookmark.excerpt_text || "");
      setIsEditing(false);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div
      className="excerpt-card"
      data-experiment="text-cards"
      onDoubleClick={() => setIsEditing(true)}
      style={{
        background: "#000",
        color: "#fff",
        padding: "24px 28px",
        fontSize: "14px",
        lineHeight: "1.45",
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
        position: "relative",
        cursor: isEditing ? "text" : "pointer",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius)",
        height: "100%",
        width: "100%",
        boxSizing: "border-box",
      }}
      title="Double-click to edit"
    >
      {isEditing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoFocus
          style={{
            width: "100%",
            height: "100%",
            background: "transparent",
            color: "#fff",
            border: "none",
            resize: "none",
            fontSize: "inherit",
            lineHeight: "inherit",
            fontWeight: "inherit",
            fontFamily: "inherit",
            outline: "none",
            padding: 0,
          }}
        />
      ) : (
        <div
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 10,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            width: "100%",
          }}
        >
          {text}
        </div>
      )}

      {!isEditing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClear();
          }}
          disabled={saving}
          style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            background: "rgba(255,255,255,0.1)",
            border: "none",
            color: "#fff",
            fontSize: "10px",
            padding: "4px 8px",
            cursor: "pointer",
            borderRadius: "4px",
          }}
        >
          Revert to Image
        </button>
      )}

      {saving && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            color: "rgba(255,255,255,0.5)",
            fontSize: "10px",
          }}
        >
          Saving...
        </div>
      )}
      <style jsx>{`
        .excerpt-card {
          min-height: 340px;
        }
        @media (max-width: 768px) {
          .excerpt-card {
            min-height: 0;
          }
        }
      `}</style>
    </div>
  );
}
