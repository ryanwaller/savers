"use client";

import { useEffect } from "react";
import { resolveSaveSource } from "@/lib/save-url";

export default function SavePage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const sourceUrl = resolveSaveSource(params, document.referrer);

    if (!sourceUrl) {
      window.location.replace("/");
      return;
    }
    const resolvedSourceUrl = sourceUrl;

    async function saveAndRedirect() {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        // Check if this URL is an RSS feed before saving
        try {
          const detectRes = await fetch(
            `/api/bookmarks/detect-feed?url=${encodeURIComponent(resolvedSourceUrl)}`,
            { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: token ? "omit" : "include" },
          );
          if (detectRes.ok) {
            const { isFeed } = await detectRes.json();
            if (isFeed) {
              // Redirect to Add Bookmark modal so the user sees the "Add feed" hint
              const target = new URL("/", window.location.origin);
              target.searchParams.set("add", resolvedSourceUrl);
              if (token) target.searchParams.set("token", token);
              window.location.replace(target.toString());
              return;
            }
          }
        } catch {
          // Detection failed, proceed with normal save
        }

        const res = await fetch("/api/bookmarks", {
          method: "POST",
          headers,
          credentials: token ? "omit" : "include",
          body: JSON.stringify({ url: resolvedSourceUrl }),
        });

        if (res.ok) {
          const { bookmark } = await res.json();
          const target = new URL("/", window.location.origin);
          target.searchParams.set("bookmark", bookmark.id);
          window.location.replace(target.toString());
          return;
        }
      } catch {
        // Fall through to the add flow on network errors.
      }

      // Fallback: redirect to the Add Bookmark modal with URL pre-filled.
      const target = new URL("/", window.location.origin);
      target.searchParams.set("add", resolvedSourceUrl);
      if (token) target.searchParams.set("token", token);
      window.location.replace(target.toString());
    }

    void saveAndRedirect();
  }, []);

  return null;
}
