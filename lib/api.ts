import type { Bookmark, Collection, OGData, AISuggestion, SmartCollection, FilterGroup } from "./types";

export type CustomPreviewSource =
  | File
  | {
      remoteUrl: string;
    };

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async listCollections(): Promise<{ collections: Collection[]; flat: Collection[] }> {
    return j(await fetch("/api/collections", { cache: "no-store" }));
  },
  async createCollection(name: string, parent_id: string | null = null): Promise<{ collection: Collection }> {
    return j(
      await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parent_id }),
      })
    );
  },
  async updateCollection(id: string, updates: Partial<Collection>): Promise<{ collection: Collection }> {
    return j(
      await fetch("/api/collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      })
    );
  },
  async deleteCollection(id: string): Promise<{ ok: true }> {
    return j(await fetch(`/api/collections?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
  },
  async reorderCollections(ids: string[]): Promise<{ ok: true }> {
    return j(
      await fetch("/api/collections/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
    );
  },

  async listBookmarks(params: { collection_id?: string | null; q?: string } = {}): Promise<{ bookmarks: Bookmark[] }> {
    const sp = new URLSearchParams();
    if (params.collection_id) sp.set("collection_id", params.collection_id);
    if (params.q) sp.set("q", params.q);
    const qs = sp.toString();
    return j(await fetch(`/api/bookmarks${qs ? `?${qs}` : ""}`, { cache: "no-store" }));
  },
  async createBookmark(data: Partial<Bookmark> & { url: string }): Promise<{ bookmark: Bookmark }> {
    return j(
      await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
    );
  },
  async updateBookmark(id: string, updates: Partial<Bookmark>): Promise<{ bookmark: Bookmark }> {
    return j(
      await fetch("/api/bookmarks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      })
    );
  },
  async deleteBookmark(id: string): Promise<{ ok: true }> {
    return j(await fetch(`/api/bookmarks?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
  },
  async deleteDuplicateBookmarks(): Promise<{
    ok: true;
    deleted_ids: string[];
    deleted_count: number;
    duplicate_group_count: number;
  }> {
    return j(await fetch("/api/bookmarks?duplicates=true", { method: "DELETE" }));
  },
  async uploadCustomPreview(bookmarkId: string, source: CustomPreviewSource): Promise<{ bookmark: Bookmark }> {
    if (source instanceof File) {
      const formData = new FormData();
      formData.set("bookmark_id", bookmarkId);
      formData.set("file", source);

      return j(
        await fetch("/api/bookmarks/custom-preview", {
          method: "POST",
          body: formData,
        })
      );
    }

    return j(
      await fetch("/api/bookmarks/custom-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookmark_id: bookmarkId,
          image_url: source.remoteUrl,
        }),
      })
    );
  },
  async clearCustomPreview(bookmarkId: string): Promise<{ bookmark: Bookmark }> {
    return j(
      await fetch(
        `/api/bookmarks/custom-preview?bookmark_id=${encodeURIComponent(bookmarkId)}`,
        { method: "DELETE" }
      )
    );
  },

  async refreshMetadata(bookmarkId: string): Promise<{ title: string | null; description: string | null }> {
    return j(
      await fetch(`/api/bookmarks/${encodeURIComponent(bookmarkId)}/refresh-metadata`, {
        method: "POST",
      })
    );
  },

  async deleteBookmarks(ids: string[]): Promise<{ deleted: number }> {
    return j(
      await fetch("/api/bookmarks/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
    );
  },

  async moveBookmarks(ids: string[], collectionId: string | null): Promise<{ moved: number }> {
    return j(
      await fetch("/api/bookmarks/bulk-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, collectionId }),
      })
    );
  },

  async bulkTagBookmarks(
    ids: string[],
    action: "add_tags" | "remove_tags",
    tags: string[],
  ): Promise<{ updated: number }> {
    return j(
      await fetch("/api/bookmarks/bulk-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action, tags }),
      }),
    );
  },

  async updateUrl(bookmarkId: string, url: string): Promise<{ bookmark: Bookmark }> {
    return j(
      await fetch(`/api/bookmarks/${encodeURIComponent(bookmarkId)}/update-url`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
    );
  },

  async fetchMetadata(url: string): Promise<OGData> {
    return j(await fetch(`/api/metadata?url=${encodeURIComponent(normalizeUrl(url))}`));
  },

  async categorize(payload: {
    url: string;
    title: string | null;
    description: string | null;
    collections: Collection[];
  }): Promise<{ suggestion: AISuggestion | null }> {
    return j(
      await fetch("/api/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
  },

  async listTokens(): Promise<{
    tokens: Array<{
      id: string;
      name: string;
      prefix: string;
      last_used_at: string | null;
      created_at: string;
    }>;
  }> {
    return j(await fetch("/api/tokens", { cache: "no-store" }));
  },
  async createToken(name: string): Promise<{
    token: string;
    record: { id: string; name: string; prefix: string; created_at: string };
  }> {
    return j(
      await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
    );
  },
  async deleteToken(id: string): Promise<{ ok: true }> {
    return j(
      await fetch(`/api/tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    );
  },

  async suggestTags(payload: {
    url: string;
    title?: string | null;
    description?: string | null;
    existing_tags?: string[];
    collection_path?: string | null;
  }): Promise<{ tags: string[] }> {
    return j(
      await fetch("/api/suggest-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
  },

  async listBookmarkTags(
    id: string,
  ): Promise<{ tags: { tag: string; source: "user" | "auto" }[] }> {
    return j(await fetch(`/api/bookmarks/${encodeURIComponent(id)}/tags`));
  },
  async acceptAutoTag(id: string, tag: string): Promise<{ bookmark: Bookmark }> {
    return j(
      await fetch(`/api/bookmarks/${encodeURIComponent(id)}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept", tag }),
      }),
    );
  },
  async rejectAutoTag(id: string, tag: string): Promise<{ bookmark: Bookmark }> {
    return j(
      await fetch(`/api/bookmarks/${encodeURIComponent(id)}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", tag }),
      }),
    );
  },

  async listSmartCollections(): Promise<{ smart_collections: SmartCollection[] }> {
    return j(await fetch("/api/smart-collections", { cache: "no-store" }));
  },
  async createSmartCollection(payload: {
    name: string;
    icon?: string | null;
    query_json: FilterGroup;
  }): Promise<{ smart_collection: SmartCollection }> {
    return j(
      await fetch("/api/smart-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
  },
  async updateSmartCollection(
    id: string,
    updates: Partial<Pick<SmartCollection, "name" | "icon" | "query_json" | "position">>
  ): Promise<{ smart_collection: SmartCollection }> {
    return j(
      await fetch("/api/smart-collections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      })
    );
  },
  async deleteSmartCollection(id: string): Promise<{ ok: true }> {
    return j(
      await fetch(`/api/smart-collections?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
    );
  },
  async previewSmartCollection(query_json: FilterGroup): Promise<{
    count: number;
    sample: { id: string; title: string | null; url: string; tags: string[] }[];
  }> {
    return j(
      await fetch("/api/smart-collections/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query_json }),
      })
    );
  },

  // --- Link Health Checks ---

  /** Get counts of broken/redirect/unknown link statuses. */
  async getLinkHealthCounts(): Promise<{ counts: Record<string, number> }> {
    return j(await fetch("/api/bookmarks/check-health", { cache: "no-store" }));
  },

  /** Enqueue link health checks for a scope. */
  async enqueueLinkChecks(params: {
    bookmark_id?: string;
    collection_id?: string;
    all?: boolean;
  }): Promise<{ queued: number }> {
    return j(
      await fetch("/api/bookmarks/check-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })
    );
  },
};

// Stable domain -> placeholder tint (neutral warm/cool grays, no vivid color)
const TINTS = [
  "#efece8", // warm paper
  "#ecebe7", // linen
  "#e9e9e6", // stone
  "#e6e8e7", // mist
  "#eceae5", // bone
  "#e8e6e3", // sand
];
const TINTS_DARK = [
  "#26241f",
  "#23221e",
  "#222322",
  "#1f2222",
  "#252320",
  "#21201d",
];

export function domainOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value) return value;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) return value;
  return `https://${value}`;
}

export function isPublicUrl(url: string): boolean {
  try {
    const parsed = new URL(normalizeUrl(url));
    const host = parsed.hostname.toLowerCase();

    // Block localhost and standard internal ranges
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "0.0.0.0"
    ) {
      return false;
    }

    // RFC1918 Private ranges
    if (
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }

    // Other reserved / internal patterns
    if (
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.endsWith(".test") ||
      host.endsWith(".invalid") ||
      host.endsWith(".example") ||
      host === "metadata.google.internal" || // GCP
      host === "169.254.169.254" // AWS/Azure/GCP metadata
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

const TRACKING_QUERY_PARAMS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref_src",
  "si",
]);

const CLEAN_URL_STRIP_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "_ga", "_gl", "fbclid", "gclid",
  "ref", "source", "medium", "campaign",
  "igshid", "mc_cid", "mc_eid", "ref_src", "si",
]);

export function cleanUrl(input: string): string {
  try {
    const url = new URL(normalizeUrl(input));
    const params = new URLSearchParams(url.search);
    const cleaned = new URLSearchParams();

    for (const [key, value] of params.entries()) {
      if (CLEAN_URL_STRIP_PARAMS.has(key) || key.startsWith("utm_")) continue;
      cleaned.append(key, value);
    }

    url.search = cleaned.toString();
    return url.toString();
  } catch {
    return input;
  }
}

export function canonicalBookmarkUrl(input: string): string {
  try {
    const url = new URL(normalizeUrl(input));
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const pathname =
      url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") || "/" : url.pathname || "/";
    const params = new URLSearchParams(url.search);
    const filtered = new URLSearchParams();

    for (const [key, value] of params.entries()) {
      if (key.startsWith("utm_") || TRACKING_QUERY_PARAMS.has(key)) continue;
      filtered.append(key, value);
    }

    const sortedEntries = Array.from(filtered.entries()).sort(([a], [b]) => a.localeCompare(b));
    const query = sortedEntries.length
      ? `?${new URLSearchParams(sortedEntries).toString()}`
      : "";

    return `${host}${pathname}${query}`;
  } catch {
    return normalizeUrl(input).trim().toLowerCase();
  }
}

export function screenshotPreviewUrl(
  url: string,
  options?: { force?: boolean; cacheBust?: string | number | null }
): string {
  const normalized = normalizeUrl(url);
  // Proxy through our server-side /api/preview so the browser sees an
  // actual image content-type (Chrome's ORB blocks cross-origin responses
  // from api.microlink.io because their fallback responses are JSON, which
  // doesn't match the <img> request expectation).
  const params = new URLSearchParams({ url: normalized });
  if (options?.force) params.set("force", "true");
  if (options?.cacheBust !== undefined && options?.cacheBust !== null) {
    params.set("cb", String(options.cacheBust));
  }
  return `/api/preview?${params.toString()}`;
}

export function previewImageUrl(
  url: string,
  options?: {
    ogImage?: string | null;
    favicon?: string | null;
    force?: boolean;
    cacheBust?: string | number | null;
    previewVersion?: string | number | null;
  }
): string {
  const params = new URLSearchParams({
    url: normalizeUrl(url),
  });

  if (options?.ogImage) params.set("og", options.ogImage);
  if (options?.favicon) params.set("favicon", options.favicon);
  if (options?.force) params.set("force", "true");
  if (options?.cacheBust !== undefined && options?.cacheBust !== null) {
    params.set("cb", String(options.cacheBust));
  }
  if (options?.previewVersion !== undefined && options?.previewVersion !== null) {
    params.set("pv", String(options.previewVersion));
  }

  return `/api/preview?${params.toString()}`;
}

export function storedPreviewUrl(
  previewPath: string | null | undefined,
  options?: { previewVersion?: string | number | null }
): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl || !previewPath) return null;

  const encodedPath = previewPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const base = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/bookmark-previews/${encodedPath}`;

  if (options?.previewVersion === undefined || options.previewVersion === null) {
    return base;
  }

  return `${base}?v=${encodeURIComponent(String(options.previewVersion))}`;
}

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function tintForDomain(url: string, dark = false): string {
  const palette = dark ? TINTS_DARK : TINTS;
  return palette[hash(domainOf(url)) % palette.length];
}
