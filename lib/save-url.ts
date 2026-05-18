import { getPublicSiteUrl } from "@/lib/site-url";

type BuildSaveUrlOptions = {
  baseUrl?: string;
  token?: string | null;
  sourceUrl?: string | null;
};

export function buildSaveUrl({
  baseUrl = getPublicSiteUrl(),
  token,
  sourceUrl,
}: BuildSaveUrlOptions = {}): string {
  const url = new URL("/save", baseUrl);
  if (token?.trim()) {
    url.searchParams.set("token", token.trim());
  }
  if (sourceUrl?.trim()) {
    url.searchParams.set("u", sourceUrl.trim());
  }
  return url.toString();
}

type BuildBookmarkletCodeOptions = {
  baseUrl?: string;
};

export function buildBookmarkletCode(options: BuildBookmarkletCodeOptions = {}): string {
  const base = JSON.stringify((options.baseUrl || getPublicSiteUrl()).replace(/\/$/, ""));
  // Self-contained — window.open() runs synchronously with the click.
  // Avoid a sized popup (features string) which is more likely to be blocked.
  // Fall back to a form submission when window.open is blocked outright.
  return `javascript:(function(){var b=${base},u=b+'/save-overlay?url='+encodeURIComponent(location.href);var p=window.open(u,'savers-save');if(p){p.focus();return}var f=document.createElement('form');f.method='GET';f.action=u;f.target='savers-save';f.style.display='none';document.body.appendChild(f);f.submit();document.body.removeChild(f)})()`;
}

export function resolveSaveSource(
  params: URLSearchParams,
  referrer?: string | null,
): string | null {
  const direct = params.get("u") || params.get("url");
  if (direct?.trim()) return direct.trim();

  const fallback = String(referrer || "").trim();
  return fallback || null;
}
