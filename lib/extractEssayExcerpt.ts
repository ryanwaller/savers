import { extractExcerpt } from "@/lib/excerpt";

/**
 * Extracts a high-quality text excerpt for essay-tagged bookmarks.
 * Wraps the hardened structural paragraph analysis from lib/excerpt.ts.
 * Returns null if the extracted text is likely a fallback rather than real content.
 */
export async function extractEssayExcerpt(
  url: string,
  title?: string | null,
  description?: string | null,
): Promise<string | null> {
  const text = await extractExcerpt(url, title, description);

  if (!text) return null;

  // Reject obvious fallbacks
  if (text === "Content unavailable") return null;
  if (text === (description || title) && (description || title || "").length < 100) return null;

  // Require a minimum length for a usable excerpt
  if (text.length < 80) return null;

  return text;
}
