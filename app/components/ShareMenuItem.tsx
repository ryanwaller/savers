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

  async function handleShare() {
    if (loading) return;
    setLoading(true);
    try {
      const { token } = await api.generateShareToken(bookmarkId);
      const shareUrlStr = `${resolveSiteUrl()}/s/${token}`;
      setShareUrl(shareUrlStr);

      const shareTitle = title || url;
      const shareText = description
        ? description.length > 200
          ? description.slice(0, 197) + "..."
          : description
        : url;

      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrlStr,
        });
      } else {
        setShowModal(true);
      }
    } catch (err) {
      // User cancelled native share, or share failed — ignore
      if (err instanceof Error && err.name !== "AbortError") {
        console.error("Share failed:", err);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className="menu-item" onClick={handleShare} disabled={loading}>
        {loading ? "Sharing…" : "Share"}
      </button>
      <ShareModal
        open={showModal}
        shareUrl={shareUrl ?? ""}
        title={title || url}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}
