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
    contentInset: "always",
    // Allow swipe-back-to-go-back at the WKWebView level — the web app's
    // own swipe gestures still work above this for sidebar/add bookmark.
    allowsLinkPreview: false,
    backgroundColor: "#0f0f0f",
  },
};

export default config;
