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

export function resolveSaveSource(
  params: URLSearchParams,
  referrer?: string | null,
): string | null {
  const direct = params.get("u") || params.get("url");
  if (direct?.trim()) return direct.trim();

  const fallback = String(referrer || "").trim();
  return fallback || null;
}
