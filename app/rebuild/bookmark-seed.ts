import "server-only";
import { gunzipSync } from "node:zlib";
import type { PreviewCard } from "./fixtures";

// The export stays in Railway variables, outside the repository. Each part is
// base64 text of one gzip stream, split to fit the platform variable limit.
export function loadBookmarkSeed(): PreviewCard[] {
  const parts: string[] = [];
  for (let index = 0; index < 32; index += 1) {
    const part = process.env[`SAVERS_REBUILD_CARDS_${index}`];
    if (!part) break;
    parts.push(part);
  }
  if (!parts.length) return [];
  try {
    const parsed: unknown = JSON.parse(
      gunzipSync(Buffer.from(parts.join(""), "base64")).toString("utf8"),
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (card): card is PreviewCard =>
        typeof card === "object" &&
        card !== null &&
        typeof card.id === "string" &&
        typeof card.title === "string" &&
        card.kind === "link",
    );
  } catch {
    return [];
  }
}
