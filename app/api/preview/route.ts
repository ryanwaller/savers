import { NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { normalizeUrl, screenshotPreviewUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

const USER_AGENT = "Mozilla/5.0 (compatible; Savers/1.0; +https://savers-production.up.railway.app)";

const MICROLINK_QUOTA_BACKOFF_MS = 12 * 60 * 60 * 1000;
const MICROLINK_ERROR_BACKOFF_MS = 5 * 60 * 1000;

const APIFLASH_QUOTA_BACKOFF_MS = 24 * 60 * 60 * 1000;
const APIFLASH_RATE_LIMIT_BACKOFF_MS = 10 * 60 * 1000;
const APIFLASH_ERROR_BACKOFF_MS = 5 * 60 * 1000;

const SCREENSHOTONE_QUOTA_BACKOFF_MS = 24 * 60 * 60 * 1000;
const SCREENSHOTONE_RATE_LIMIT_BACKOFF_MS = 10 * 60 * 1000;
const SCREENSHOTONE_ERROR_BACKOFF_MS = 5 * 60 * 1000;

const CAPTUREKIT_QUOTA_BACKOFF_MS = 24 * 60 * 60 * 1000;
const CAPTUREKIT_RATE_LIMIT_BACKOFF_MS = 10 * 60 * 1000;
const CAPTUREKIT_ERROR_BACKOFF_MS = 5 * 60 * 1000;

const APIFLASH_ACCESS_KEY = process.env.APIFLASH_ACCESS_KEY?.trim() || null;
const SCREENSHOTONE_ACCESS_KEY = process.env.SCREENSHOTONE_ACCESS_KEY?.trim() || null;
const CAPTUREKIT_ACCESS_KEY = process.env.CAPTUREKIT_ACCESS_KEY?.trim() || null;

let microlinkBackoffUntil = 0;
let apiFlashBackoffUntil = 0;
let screenshotOneBackoffUntil = 0;
let captureKitBackoffUntil = 0;

type ImageCandidate = {
  kind: "microlink" | "apiflash" | "screenshotone" | "capturekit";
  url: string;
  headers?: HeadersInit;
};

function contentTypeIsImage(value: string | null): boolean {
  return !!value && /^image\/[a-z0-9.+-]+$/i.test(value);
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
    wait_until: "page_loaded",
    no_cookie_banners: "true",
  });

  return `https://api.apiflash.com/v1/urltoimage?${params.toString()}`;
}

function screenshotOneUrl(url: string) {
  const params = new URLSearchParams({
    access_key: SCREENSHOTONE_ACCESS_KEY ?? "",
    url,
    viewport_width: "1440",
    viewport_height: "900",
    format: "jpg",
    image_quality: "80",
    block_ads: "true",
    block_cookie_banners: "true",
    cache: "true",
    cache_ttl: "86400",
  });

  return `https://api.screenshotone.com/take?${params.toString()}`;
}

function captureKitUrl(url: string) {
  const params = new URLSearchParams({
    url,
    format: "jpeg",
    viewport_width: "1440",
    viewport_height: "900",
    image_quality: "80",
    cache: "true",
    cache_ttl: "86400",
    wait_until: "networkidle2",
    remove_cookie_banners: "true",
    remove_ads: "true",
  });

  return `https://api.capturekit.dev/v1/capture?${params.toString()}`;
}

async function fetchImage(candidate: ImageCandidate) {
  const response = await fetch(candidate.url, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": USER_AGENT,
      ...(candidate.headers ?? {}),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(candidate.kind === "microlink" ? 15000 : 12000),
    cache: "no-store",
  });

  if (!response.ok) {
    let errorCode: string | undefined;
    const responseContentType = response.headers.get("content-type");

    try {
      if (responseContentType?.includes("application/json")) {
        const body = await response.json();
        errorCode =
          typeof body?.error_code === "string"
            ? body.error_code
            : typeof body?.error === "string"
              ? body.error
              : undefined;
      }
    } catch {}

    const error = new Error(`${candidate.kind}:${response.status}${errorCode ? `:${errorCode}` : ""}`);
    (
      error as Error & { status?: number; kind?: string; errorCode?: string }
    ).status = response.status;
    (
      error as Error & { status?: number; kind?: string; errorCode?: string }
    ).kind = candidate.kind;
    (
      error as Error & { status?: number; kind?: string; errorCode?: string }
    ).errorCode = errorCode;
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
  const previewVersion = request.nextUrl.searchParams.get("pv");
  const candidates: ImageCandidate[] = [];

  if (force || Date.now() >= microlinkBackoffUntil) {
    candidates.push({
      kind: "microlink",
      url: screenshotPreviewUrl(normalizedUrl, {
        force,
        cacheBust: cacheBust ?? previewVersion,
      }),
    });
  }

  if (APIFLASH_ACCESS_KEY && (force || Date.now() >= apiFlashBackoffUntil)) {
    candidates.push({
      kind: "apiflash",
      url: apiFlashScreenshotUrl(normalizedUrl),
    });
  }

  if (SCREENSHOTONE_ACCESS_KEY && (force || Date.now() >= screenshotOneBackoffUntil)) {
    candidates.push({
      kind: "screenshotone",
      url: screenshotOneUrl(normalizedUrl),
    });
  }

  if (CAPTUREKIT_ACCESS_KEY && (force || Date.now() >= captureKitBackoffUntil)) {
    candidates.push({
      kind: "capturekit",
      url: captureKitUrl(normalizedUrl),
      headers: {
        "x-api-key": CAPTUREKIT_ACCESS_KEY,
      },
    });
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
      const errorCode = (lastError as Error & { errorCode?: string }).errorCode;

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
      } else if (candidate.kind === "screenshotone") {
        if (errorCode === "screenshots_limit_reached") {
          screenshotOneBackoffUntil = Date.now() + SCREENSHOTONE_QUOTA_BACKOFF_MS;
        } else if (errorCode === "concurrency_limit_reached" || status === 429) {
          screenshotOneBackoffUntil = Date.now() + SCREENSHOTONE_RATE_LIMIT_BACKOFF_MS;
        } else if (status && status >= 500) {
          screenshotOneBackoffUntil = Date.now() + SCREENSHOTONE_ERROR_BACKOFF_MS;
        }
      } else if (candidate.kind === "capturekit") {
        if (status === 402) {
          captureKitBackoffUntil = Date.now() + CAPTUREKIT_QUOTA_BACKOFF_MS;
        } else if (status === 429 || status === 401) {
          captureKitBackoffUntil = Date.now() + CAPTUREKIT_RATE_LIMIT_BACKOFF_MS;
        } else if (status && status >= 500) {
          captureKitBackoffUntil = Date.now() + CAPTUREKIT_ERROR_BACKOFF_MS;
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
