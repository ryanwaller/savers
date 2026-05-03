"use client";

import { useState } from "react";

interface Props {
  bookmarkId: string;
  mode?: "screenshot" | "product_inset";
  label?: string;
  pending?: boolean;
  onSuccess: () => void;
}

export function ForceCoverButton({
  bookmarkId,
  mode = "screenshot",
  label,
  pending = false,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultLabel = mode === "product_inset" ? "Apply product image" : "Apply website cover";
  const loadingLabel = "Applying…";
  const busy = loading || pending;

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookmarks/${bookmarkId}/force-cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
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
        disabled={busy}
        data-testid="force-cover-btn"
      >
        {busy ? loadingLabel : (label ?? defaultLabel)}
      </button>
      {error && <span className="cover-error">{error}</span>}
      <style jsx>{`
        .btn-sm {
          font-size: 12px;
          padding: 4px 10px;
          white-space: nowrap;
        }
        .cover-error {
          font-size: 12px;
          color: var(--color-danger, #e00);
        }
      `}</style>
    </>
  );
}
