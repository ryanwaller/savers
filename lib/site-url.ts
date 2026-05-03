const DEFAULT_PUBLIC_SITE_URL = "https://savers-production.up.railway.app";

export function getPublicSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return configured && /^https?:\/\//i.test(configured)
    ? configured.replace(/\/$/, "")
    : DEFAULT_PUBLIC_SITE_URL;
}

export function getSaversUserAgent(): string {
  return `Mozilla/5.0 (compatible; Savers/1.0; +${getPublicSiteUrl()})`;
}

/** Upgrade HTTP to HTTPS. Sites running on HTTP are increasingly blocked by browsers. */
export function normalizeUrl(url: string): string {
  if (url.startsWith("http://")) {
    return url.replace("http://", "https://");
  }
  return url;
}

/** Realistic browser headers to avoid bot detection and ERR_BLOCKED_BY_CLIENT. */
export const BROWSER_HEADERS: Record<string, string> = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};
