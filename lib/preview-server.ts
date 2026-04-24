import "server-only";

import { isPublicUrl, normalizeUrl, screenshotPreviewUrl } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const PREVIEW_BUCKET = "bookmark-previews";

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
const CAPTUREKIT_RATE_LIMIT_BACKOFF_MS = 10 * 60 * 60 * 1000;
const CAPTUREKIT_ERROR_BACKOFF_MS = 5 * 60 * 1000;

const APIFLASH_ACCESS_KEY = process.env.APIFLASH_ACCESS_KEY?.trim() || null;
const SCREENSHOTONE_ACCESS_KEY = process.env.SCREENSHOTONE_ACCESS_KEY?.trim() || null;
const CAPTUREKIT_ACCESS_KEY = process.env.CAPTUREKIT_ACCESS_KEY?.trim() || null;

let microlinkBackoffUntil = 0;
let apiFlashBackoffUntil = 0;
let screenshotOneBackoffUntil = 0;
let captureKitBackoffUntil = 0;
let previewBucketReadyPromise: Promise<void> | null = null;

type ProviderKind = "microlink" | "apiflash" | "screenshotone" | "capturekit";

type ImageCandidate = {
  kind: ProviderKind;
  url: string;
  headers?: HeadersInit;
};

type FetchPreviewOptions = {
  url: string;
  force?: boolean;
  cacheBust?: string | number | null;
  preferCompact?: boolean;
};

type StoreBookmarkPreviewOptions = {
  bookmarkId: string;
  userId: string;
  url: string;
  force?: boolean;
  previewVersion?: number | null;
  currentPreviewPath?: string | null;
};

type StoreCustomPreviewOptions = {
  bookmarkId: string;
  userId: string;
  fileName: string;
  contentType: string;
  body: ArrayBuffer;
  currentCustomPreviewPath?: string | null;
};

export type PreviewAsset = {
  body: ArrayBuffer;
  contentType: string;
  provider: ProviderKind;
};

export function normalizeRemotePreviewUrl(rawUrl: string): string {
  const normalizedUrl = normalizeUrl(rawUrl);
  const parsed = new URL(normalizedUrl);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Invalid protocol");
  }

  if (!isPublicUrl(normalizedUrl)) {
    throw new Error("Non-public URLs are not allowed for preview generation");
  }

  return normalizedUrl;
}

export function previewStoragePublicUrl(
  previewPath: string | null | undefined,
  previewVersion?: string | number | null
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl || !previewPath) return null;

  const encodedPath = previewPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const base = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${PREVIEW_BUCKET}/${encodedPath}`;

  if (previewVersion === undefined || previewVersion === null) {
    return base;
  }

  return `${base}?v=${encodeURIComponent(String(previewVersion))}`;
}

function contentTypeIsImage(value: string | null): boolean {
  return !!value && /^image\/[a-z0-9.+-]+$/i.test(value);
}

function contentTypeToExtension(contentType: string) {
  const lower = contentType.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("avif")) return "avif";
  return "jpg";
}

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function apiFlashScreenshotUrl(url: string, compact = false) {
  const params = new URLSearchParams({
    access_key: APIFLASH_ACCESS_KEY ?? "",
    url,
    width: compact ? "1280" : "1440",
    height: compact ? "800" : "900",
    format: compact ? "webp" : "jpeg",
    quality: compact ? "72" : "80",
    fresh: "true",
    wait_until: "page_loaded",
    no_cookie_banners: "true",
  });

  return `https://api.apiflash.com/v1/urltoimage?${params.toString()}`;
}

function screenshotOneUrl(url: string, compact = false) {
  const params = new URLSearchParams({
    access_key: SCREENSHOTONE_ACCESS_KEY ?? "",
    url,
    viewport_width: compact ? "1280" : "1440",
    viewport_height: compact ? "800" : "900",
    format: compact ? "webp" : "jpg",
    image_quality: compact ? "72" : "80",
    image_width: compact ? "1200" : "1440",
    image_height: compact ? "750" : "900",
    device_scale_factor: "1",
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

function buildCandidates(
  url: string,
  force: boolean,
  cacheBust?: string | number | null,
  preferCompact = false
) {
  const candidates: ImageCandidate[] = [];

  const addApiFlash = () => {
    if (APIFLASH_ACCESS_KEY && (force || Date.now() >= apiFlashBackoffUntil)) {
      candidates.push({
        kind: "apiflash",
        url: apiFlashScreenshotUrl(url, preferCompact),
      });
    }
  };

  const addScreenshotOne = () => {
    if (SCREENSHOTONE_ACCESS_KEY && (force || Date.now() >= screenshotOneBackoffUntil)) {
      candidates.push({
        kind: "screenshotone",
        url: screenshotOneUrl(url, preferCompact),
      });
    }
  };

  const addMicrolink = () => {
    if (force || Date.now() >= microlinkBackoffUntil) {
      candidates.push({
        kind: "microlink",
        url: screenshotPreviewUrl(url, {
          force,
          cacheBust,
        }),
      });
    }
  };

  const addCaptureKit = () => {
    if (CAPTUREKIT_ACCESS_KEY && (force || Date.now() >= captureKitBackoffUntil)) {
      candidates.push({
        kind: "capturekit",
        url: captureKitUrl(url),
        headers: {
          "x-api-key": CAPTUREKIT_ACCESS_KEY,
        },
      });
    }
  };

  if (preferCompact) {
    addApiFlash();
    addScreenshotOne();
    addMicrolink();
    addCaptureKit();
  } else {
    addMicrolink();
    addApiFlash();
    addScreenshotOne();
    addCaptureKit();
  }

  return candidates;
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
      error as Error & { status?: number; kind?: ProviderKind; errorCode?: string }
    ).status = response.status;
    (
      error as Error & { status?: number; kind?: ProviderKind; errorCode?: string }
    ).kind = candidate.kind;
    (
      error as Error & { status?: number; kind?: ProviderKind; errorCode?: string }
    ).errorCode = errorCode;
    throw error;
  }

  const contentType = response.headers.get("content-type");
  if (!contentTypeIsImage(contentType)) {
    const error = new Error(`${candidate.kind}:invalid-content-type:${contentType ?? "unknown"}`);
    (error as Error & { kind?: ProviderKind }).kind = candidate.kind;
    throw error;
  }

  return { response, contentType: contentType as string };
}

function handleProviderError(kind: ProviderKind, error: Error) {
  const status = (error as Error & { status?: number }).status;
  const errorCode = (error as Error & { errorCode?: string }).errorCode;

  if (kind === "microlink") {
    if (status === 429) {
      microlinkBackoffUntil = Date.now() + MICROLINK_QUOTA_BACKOFF_MS;
    } else if (status && status >= 500) {
      microlinkBackoffUntil = Date.now() + MICROLINK_ERROR_BACKOFF_MS;
    }
    return;
  }

  if (kind === "apiflash") {
    if (status === 402) {
      apiFlashBackoffUntil = Date.now() + APIFLASH_QUOTA_BACKOFF_MS;
    } else if (status === 429) {
      apiFlashBackoffUntil = Date.now() + APIFLASH_RATE_LIMIT_BACKOFF_MS;
    } else if (status && status >= 500) {
      apiFlashBackoffUntil = Date.now() + APIFLASH_ERROR_BACKOFF_MS;
    }
    return;
  }

  if (kind === "screenshotone") {
    if (errorCode === "screenshots_limit_reached") {
      screenshotOneBackoffUntil = Date.now() + SCREENSHOTONE_QUOTA_BACKOFF_MS;
    } else if (errorCode === "concurrency_limit_reached" || status === 429) {
      screenshotOneBackoffUntil = Date.now() + SCREENSHOTONE_RATE_LIMIT_BACKOFF_MS;
    } else if (status && status >= 500) {
      screenshotOneBackoffUntil = Date.now() + SCREENSHOTONE_ERROR_BACKOFF_MS;
    }
    return;
  }

  if (status === 402) {
    captureKitBackoffUntil = Date.now() + CAPTUREKIT_QUOTA_BACKOFF_MS;
  } else if (status === 429 || status === 401 || status === 403) {
    captureKitBackoffUntil = Date.now() + CAPTUREKIT_RATE_LIMIT_BACKOFF_MS;
  } else if (status && status >= 500) {
    captureKitBackoffUntil = Date.now() + CAPTUREKIT_ERROR_BACKOFF_MS;
  }
}

async function ensurePreviewBucket() {
  if (!previewBucketReadyPromise) {
    previewBucketReadyPromise = (async () => {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
      if (listError) throw listError;

      const exists = (buckets ?? []).some(
        (bucket) => bucket.id === PREVIEW_BUCKET || bucket.name === PREVIEW_BUCKET
      );

      if (exists) return;

      const { error: createError } = await supabaseAdmin.storage.createBucket(PREVIEW_BUCKET, {
        public: true,
        fileSizeLimit: 5 * 1024 * 1024,
      });

      if (createError && !/already exists/i.test(createError.message)) {
        throw createError;
      }
    })().catch((error) => {
      previewBucketReadyPromise = null;
      throw error;
    });
  }

  await previewBucketReadyPromise;
}

export async function removePreviewObjects(paths: (string | null | undefined)[]) {
  const validPaths = paths.filter((path): path is string => typeof path === "string" && path.length > 0);
  if (validPaths.length === 0) return;

  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin.storage.from(PREVIEW_BUCKET).remove(Array.from(new Set(validPaths)));
}

export async function fetchBestPreviewAsset({
  url,
  force = false,
  cacheBust,
  preferCompact = false,
}: FetchPreviewOptions): Promise<PreviewAsset> {
  const normalizedUrl = normalizeRemotePreviewUrl(url);
  const candidates = buildCandidates(normalizedUrl, force, cacheBust, preferCompact);
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const { response, contentType } = await fetchImage(candidate);
      return {
        body: await response.arrayBuffer(),
        contentType,
        provider: candidate.kind,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      handleProviderError(candidate.kind, lastError);
    }
  }

  throw lastError ?? new Error("No preview provider available");
}

export async function storeBookmarkPreview({
  bookmarkId,
  userId,
  url,
  force = false,
  previewVersion,
  currentPreviewPath,
}: StoreBookmarkPreviewOptions) {
  const version = previewVersion ?? Date.now();
  const asset = await fetchBestPreviewAsset({
    url,
    force,
    cacheBust: version,
    preferCompact: true,
  });

  await ensurePreviewBucket();

  const supabaseAdmin = getSupabaseAdmin();
  const extension = contentTypeToExtension(asset.contentType);
  const previewPath = `${userId}/${bookmarkId}/preview-${version}.${extension}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(PREVIEW_BUCKET)
    .upload(previewPath, asset.body, {
      contentType: asset.contentType,
      upsert: true,
      cacheControl: "31536000",
    });

  if (uploadError) throw uploadError;

  const previewUpdatedAt = new Date().toISOString();
  const { data: bookmark, error: updateError } = await supabaseAdmin
    .from("bookmarks")
    .update({
      preview_path: previewPath,
      preview_provider: asset.provider,
      preview_updated_at: previewUpdatedAt,
      preview_version: version,
    })
    .eq("id", bookmarkId)
    .eq("user_id", userId)
    .select()
    .single();

  if (updateError) throw updateError;

  if (currentPreviewPath && currentPreviewPath !== previewPath) {
    void removePreviewObjects([currentPreviewPath]);
  }

  return {
    bookmark,
    previewPath,
    previewUrl: previewStoragePublicUrl(previewPath, version),
    previewUpdatedAt,
    provider: asset.provider,
  };
}

export async function storeCustomPreview({
  bookmarkId,
  userId,
  fileName,
  contentType,
  body,
  currentCustomPreviewPath,
}: StoreCustomPreviewOptions) {
  if (!contentTypeIsImage(contentType)) {
    throw new Error("Invalid image type");
  }

  if (body.byteLength > 10 * 1024 * 1024) {
    throw new Error("Image must be 10 MB or smaller");
  }

  await ensurePreviewBucket();

  const supabaseAdmin = getSupabaseAdmin();
  const extension = contentTypeToExtension(contentType);
  const safeBaseName = sanitizeSegment(fileName.replace(/\.[^.]+$/, "")) || "upload";
  const previewVersion = Date.now();
  const previewPath = `${userId}/${bookmarkId}/custom-${previewVersion}-${safeBaseName}.${extension}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(PREVIEW_BUCKET)
    .upload(previewPath, body, {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });

  if (uploadError) throw uploadError;

  const previewUpdatedAt = new Date(previewVersion).toISOString();
  const { data: bookmark, error: updateError } = await supabaseAdmin
    .from("bookmarks")
    .update({
      custom_preview_path: previewPath,
      preview_provider: "custom-upload",
      preview_updated_at: previewUpdatedAt,
      preview_version: previewVersion,
    })
    .eq("id", bookmarkId)
    .eq("user_id", userId)
    .select()
    .single();

  if (updateError) {
    await removePreviewObjects([previewPath]);
    throw updateError;
  }

  if (currentCustomPreviewPath && currentCustomPreviewPath !== previewPath) {
    void removePreviewObjects([currentCustomPreviewPath]);
  }

  return {
    bookmark,
    previewPath,
    previewUrl: previewStoragePublicUrl(previewPath, previewVersion),
    previewUpdatedAt,
  };
}
