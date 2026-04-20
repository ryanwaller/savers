import type { Bookmark, Collection, OGData, AISuggestion } from "./types";

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

const TRACKING_QUERY_PARAMS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref_src",
  "si",
]);

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
  const params = new URLSearchParams({
    url: normalized,
    meta: "false",
    screenshot: "true",
    embed: "screenshot.url",
    device: "macbook pro 13",
  });

  if (options?.force) params.set("force", "true");
  if (options?.cacheBust !== undefined && options?.cacheBust !== null) {
    params.set("cb", String(options.cacheBust));
  }

  return `https://api.microlink.io/?${params.toString()}`;
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
