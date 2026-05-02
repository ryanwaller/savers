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
