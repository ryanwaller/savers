"use client";

import { useEffect } from "react";

export default function BookmarkletPage() {
  useEffect(() => {
    window.location.replace("/bookmarklet.html");
  }, []);

  return null;
}
