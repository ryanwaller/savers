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
