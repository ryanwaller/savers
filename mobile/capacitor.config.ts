import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "us.othermeans.savers",
  appName: "Savers",
  webDir: "www",
  server: {
    // We host the real app on Railway and the iOS shell just loads it in a
    // WKWebView. UI updates ship via Railway, no native rebuild needed.
    url: "https://savers-production.up.railway.app",
    cleartext: false,
  },
  ios: {
    // "never" prevents the WKWebView from inserting its own top inset.
    // We already render safe-area padding via env(safe-area-inset-top) in
    // CSS; "always" was double-counting and the inset wasn't fully reset
    // after the keyboard dismissed (which is the "page stays lowered" bug).
    contentInset: "never",
    allowsLinkPreview: false,
    backgroundColor: "#0f0f0f",
  },
  plugins: {
    Keyboard: {
      // Resize body only, not the whole webview, so iOS doesn't shrink the
      // viewport when the keyboard opens — keeps layout stable when the
      // Add Bookmark modal opens.
      resize: "body" as const,
      style: "DEFAULT",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
