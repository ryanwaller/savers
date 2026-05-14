"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import ShareModal from "./ShareModal";

function resolveSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin.replace(/\/$/, "");
  return "https://savers-production.up.railway.app";
}

type Props = {
  bookmarkId: string;
  title: string | null;
  description: string | null;
  url: string;
};

export default function ShareMenuItem({ bookmarkId, title, description, url }: Props) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleShare() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const { token } = await api.generateShareToken(bookmarkId);
      const shareUrlStr = `${resolveSiteUrl()}/s/${token}`;
      setShareUrl(shareUrlStr);
      setShowModal(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't create a share link.";
      setError(message);
      console.error("Share failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className="menu-item" onClick={handleShare} disabled={loading}>
        {loading ? "Sharing…" : "Share"}
      </button>
      {error && <div className="menu-share-error">{error}</div>}
      <ShareModal
        open={showModal}
        shareUrl={shareUrl ?? ""}
        title={title || url}
        description={description}
        onClose={() => setShowModal(false)}
      />
      <style jsx>{`
        .menu-share-error {
          padding: 6px 10px 2px;
          color: #ff8f8f;
          font-size: 12px;
          line-height: 16px;
        }
      `}</style>
    </>
  );
}
