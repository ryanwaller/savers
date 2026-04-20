import { NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { domainOf, normalizeUrl, screenshotPreviewUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

const USER_AGENT = "Mozilla/5.0 (compatible; Savers/1.0; +https://savers-production.up.railway.app)";
const MICROLINK_QUOTA_BACKOFF_MS = 12 * 60 * 60 * 1000;
const MICROLINK_ERROR_BACKOFF_MS = 5 * 60 * 1000;
const APIFLASH_QUOTA_BACKOFF_MS = 24 * 60 * 60 * 1000;
const APIFLASH_RATE_LIMIT_BACKOFF_MS = 10 * 60 * 1000;
const APIFLASH_ERROR_BACKOFF_MS = 5 * 60 * 1000;
const APIFLASH_ACCESS_KEY = process.env.APIFLASH_ACCESS_KEY?.trim() || null;

let microlinkBackoffUntil = 0;
let apiFlashBackoffUntil = 0;

type ImageCandidate = {
  kind: "microlink" | "apiflash" | "og" | "favicon";
  url: string;
};

function isHttpUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function contentTypeIsImage(value: string | null): boolean {
  return !!value && /^image\/[a-z0-9.+-]+$/i.test(value);
}

function fallbackFaviconFor(url: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domainOf(url))}&sz=64`;
}

function apiFlashScreenshotUrl(url: string) {
  const params = new URLSearchParams({
    access_key: APIFLASH_ACCESS_KEY ?? "",
    url,
    width: "1440",
    height: "900",
    format: "jpeg",
    quality: "80",
    fresh: "true",
    no_cookie_banners: "true",
  });

  return `https://api.apiflash.com/v1/urltoimage?${params.toString()}`;
}

async function fetchImage(candidate: ImageCandidate) {
  const response = await fetch(candidate.url, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": USER_AGENT,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(
      candidate.kind === "microlink" || candidate.kind === "apiflash" ? 15000 : 8000
    ),
    cache: "no-store",
  });

  if (!response.ok) {
    const error = new Error(`${candidate.kind}:${response.status}`);
    (error as Error & { status?: number; kind?: string }).status = response.status;
    (error as Error & { status?: number; kind?: string }).kind = candidate.kind;
    throw error;
  }

  const contentType = response.headers.get("content-type");
  if (!contentTypeIsImage(contentType)) {
    const error = new Error(`${candidate.kind}:invalid-content-type:${contentType ?? "unknown"}`);
    (error as Error & { kind?: string }).kind = candidate.kind;
    throw error;
  }

  return { response, contentType: contentType as string };
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return Response.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeUrl(rawUrl);
    const parsed = new URL(normalizedUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return Response.json({ error: "Invalid protocol" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Invalid url" }, { status: 400 });
  }

  const force = request.nextUrl.searchParams.get("force") === "true";
  const cacheBust = request.nextUrl.searchParams.get("cb");
  const ogImage = request.nextUrl.searchParams.get("og");
  const favicon = request.nextUrl.searchParams.get("favicon");

  const candidates: ImageCandidate[] = [];

  if (force || Date.now() >= microlinkBackoffUntil) {
    candidates.push({
      kind: "microlink",
      url: screenshotPreviewUrl(normalizedUrl, {
        force,
        cacheBust,
      }),
    });
  }

  if (APIFLASH_ACCESS_KEY && (force || Date.now() >= apiFlashBackoffUntil)) {
    candidates.push({
      kind: "apiflash",
      url: apiFlashScreenshotUrl(normalizedUrl),
    });
  }

  if (isHttpUrl(ogImage)) {
    candidates.push({ kind: "og", url: ogImage });
  }

  if (isHttpUrl(favicon)) {
    candidates.push({ kind: "favicon", url: favicon });
  } else {
    candidates.push({ kind: "favicon", url: fallbackFaviconFor(normalizedUrl) });
  }

  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const { response, contentType } = await fetchImage(candidate);
      const body = await response.arrayBuffer();

      return new Response(body, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": force
            ? "no-store"
            : "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
          "X-Savers-Preview-Provider": candidate.kind,
        },
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const status = (lastError as Error & { status?: number }).status;
      if (candidate.kind === "microlink") {
        if (status === 429) {
          microlinkBackoffUntil = Date.now() + MICROLINK_QUOTA_BACKOFF_MS;
        } else if (status && status >= 500) {
          microlinkBackoffUntil = Date.now() + MICROLINK_ERROR_BACKOFF_MS;
        }
      } else if (candidate.kind === "apiflash") {
        if (status === 402) {
          apiFlashBackoffUntil = Date.now() + APIFLASH_QUOTA_BACKOFF_MS;
        } else if (status === 429) {
          apiFlashBackoffUntil = Date.now() + APIFLASH_RATE_LIMIT_BACKOFF_MS;
        } else if (status && status >= 500) {
          apiFlashBackoffUntil = Date.now() + APIFLASH_ERROR_BACKOFF_MS;
        }
      }
    }
  }

  return Response.json(
    { error: lastError?.message ?? "Preview unavailable" },
    {
      status: 502,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
