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
  // Self-contained so the popup opens synchronously with the click —
  // browsers block window.open() from async callbacks (like <script onload>).
  return `javascript:(function(){var b=${base},w=Math.min(540,screen.width-48),h=Math.min(680,screen.height-48);var p=window.open(b+'/save-overlay?url='+encodeURIComponent(location.href),'savers-save','width='+w+',height='+h+',left='+Math.round((screen.width-w)/2)+',top='+Math.round((screen.height-h)/2)+',popup=yes');if(!p)window.open(b+'/save?url='+encodeURIComponent(location.href),'_blank');else p.focus()})()`;
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
