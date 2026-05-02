"use client";

import { useRef, useState } from "react";

interface Props {
  bookmarkId: string;
  onSuccess: () => void;
}

export function ShoppingImageUpload({ bookmarkId, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/bookmarks/${bookmarkId}/upload-image`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || "Upload failed");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
      // Reset input so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="shopping-upload">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={loading}
        style={{ display: "none" }}
      />
      <button
        type="button"
        className="btn-secondary btn-sm"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
      >
        {loading ? "Processing..." : "Upload product image"}
      </button>
      {error && <span className="upload-error">{error}</span>}
      <style jsx>{`
        .shopping-upload {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .btn-sm {
          font-size: 11px;
          padding: 4px 10px;
        }
        .upload-error {
          font-size: 11px;
          color: var(--color-danger, #e00);
        }
      `}</style>
    </div>
  );
}
