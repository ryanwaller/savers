"use client";

import { useEffect, useState } from "react";
import type { Bookmark, Collection } from "@/lib/types";
import { api } from "@/lib/api";
import AddBookmarkModal from "@/app/components/AddBookmarkModal";

function notifyParent(msg: Record<string, unknown>) {
  try {
    window.parent.postMessage(msg, window.location.origin);
  } catch {
    // cross-origin parent — ignore
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
      notifyParent({ type: "close" });
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
          onClose={() => notifyParent({ type: "close" })}
          onCreated={() => {
            notifyParent({ type: "saved" });
          }}
          onFeedCreated={() => notifyParent({ type: "close" })}
        />
      )}
      <style jsx global>{`
        html, body {
          background: transparent !important;
          overflow: hidden;
        }
        .overlay-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.52);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
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
