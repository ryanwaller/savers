"use client";

import { useEffect } from "react";

export default function SavePage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    // Primary: explicit URL param (from javascript: wrapper). Fallback: referrer (same-tab click).
    const sourceUrl = params.get("u") || document.referrer;

    if (!sourceUrl) {
      // Redirect to home without add param — user will see the empty add dialog or just the app
      window.location.replace("/");
      return;
    }

    // Redirect to the main app with the URL pre-filled in the Add Bookmark modal.
    const target = new URL("/", window.location.origin);
    target.searchParams.set("add", sourceUrl);
    if (token) target.searchParams.set("token", token);
    window.location.replace(target.toString());
  }, []);

  return null;
}
