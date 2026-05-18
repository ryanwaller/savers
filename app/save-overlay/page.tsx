"use client";

import { useEffect, useState } from "react";
import type { Bookmark, Collection } from "@/lib/types";
import { api } from "@/lib/api";
import AddBookmarkModal from "@/app/components/AddBookmarkModal";

function dismiss(type: "close" | "saved" = "close") {
  // Popup (opened by script) — window.close() works
  if (window.opener) {
    window.close();
    return;
  }
  // Iframe fallback (Chrome extension, etc.) — notify parent
  try {
    window.parent.postMessage({ type }, window.location.origin);
  } catch {
    window.close();
  }
}

export default function SaveOverlayPage() {
  const url =
    new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : ""
    ).get("url") ?? "";

  const [ready, setReady] = useState(false);
  const [flat, setFlat] = useState<Collection[]>([]);
  const [tree, setTree] = useState<Collection[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      dismiss();
      return;
    }
    api
      .bootstrap()
      .then((data) => {
        setFlat(data.flat);
        setTree(data.collections);
        setBookmarks(data.bookmarks);
        setReady(true);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load");
      });
  }, [url]);

  if (!url) return null;

  return (
    <div className="overlay-shell">
      {error && <div className="overlay-error">{error}</div>}
      {ready && (
        <AddBookmarkModal
          existingBookmarks={bookmarks}
          flat={flat}
          tree={tree}
          defaultCollectionId={null}
          defaultUrl={url}
          onCreateCollection={async (name, parentId) => {
            const { collection } = await api.createCollection(name, parentId);
            setFlat((prev) => [...prev, collection]);
            setTree((prev) => [...prev, collection]);
            return collection;
          }}
          onClose={() => dismiss()}
          onCreated={() => {
            dismiss("saved");
          }}
          onFeedCreated={() => dismiss()}
        />
      )}
      <style jsx global>{`
        html, body {
          background: #0f0f0f !important;
          overflow: hidden;
        }
        .overlay-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0f0f0f;
        }
        .overlay-error {
          color: #ff8f8f;
          font-size: 12px;
          padding: 24px;
        }
      `}</style>
    </div>
  );
}
