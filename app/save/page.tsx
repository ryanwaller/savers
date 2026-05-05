"use client";

import { useEffect } from "react";

export default function SavePage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    // Primary: explicit URL param (from javascript: wrapper). Fallback: referrer (same-tab click).
    const sourceUrl = params.get("u") || document.referrer;

    if (!sourceUrl) {
      window.location.replace("/");
      return;
    }

    // Try to save the bookmark directly, then deep-link to its card.
    async function saveAndRedirect() {
      try {
        const res = await fetch("/api/bookmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: sourceUrl }),
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
      target.searchParams.set("add", sourceUrl);
      if (token) target.searchParams.set("token", token);
      window.location.replace(target.toString());
    }

    void saveAndRedirect();
  }, []);

  return null;
}
