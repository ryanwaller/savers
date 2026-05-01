/**
 * Content script — runs in an isolated world on every page.
 * Extracts metadata from the DOM for the background service worker.
 */

function extractMetadata() {
  const getMeta = (name) => {
    const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
    return el?.content?.trim() || "";
  };

  const canonical =
    document.querySelector('link[rel="canonical"]')?.href?.trim() || location.href;

  return {
    url: location.href,
    title: document.title || "",
    description:
      getMeta("description") || getMeta("og:description") || "",
    ogImage: getMeta("og:image") || "",
    canonical,
    domain: location.hostname,
    favicon: findFavicon(),
  };
}

function findFavicon() {
  const link = document.querySelector(
    'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
  );
  if (link?.href) {
    try {
      return new URL(link.href, location.origin).href;
    } catch {
      return link.href;
    }
  }
  // Fallback to /favicon.ico
  try {
    return new URL("/favicon.ico", location.origin).href;
  } catch {
    return "";
  }
}

// Listen for metadata requests from the background worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "EXTRACT_METADATA") {
    sendResponse(extractMetadata());
  }
  // Return false — we sent the response synchronously
  return false;
});
