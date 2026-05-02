"use client";

import { useState } from "react";

interface Props {
  bookmarkId: string;
  onSuccess: () => void;
}

export function ForceCoverButton({ bookmarkId, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookmarks/${bookmarkId}/force-cover`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error || "Failed to apply cover",
        );
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn-secondary btn-sm"
        onClick={handleClick}
        disabled={loading}
        data-testid="force-cover-btn"
      >
        {loading ? "Applying…" : "Apply website cover"}
      </button>
      {error && <span className="cover-error">{error}</span>}
      <style jsx>{`
        .btn-sm {
          font-size: 11px;
          padding: 4px 10px;
          white-space: nowrap;
        }
        .cover-error {
          font-size: 11px;
          color: var(--color-danger, #e00);
        }
      `}</style>
    </>
  );
}
