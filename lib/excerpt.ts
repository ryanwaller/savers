import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

const EXCERPT_MAX_CHARS = 160;
const FETCH_TIMEOUT_MS = 8000;

const USER_AGENT =
  "Mozilla/5.0 (compatible; Savers/1.0; +https://savers-production.up.railway.app)";

function trimToWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.5 ? cut.slice(0, lastSpace) : cut) + "…";
}

export async function extractExcerpt(
  url: string,
  fallbackTitle?: string | null,
  fallbackDescription?: string | null,
): Promise<string> {
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch {
    return trimToWord(
      fallbackDescription || fallbackTitle || "Content unavailable",
      EXCERPT_MAX_CHARS,
    );
  }

  let text: string | null = null;

  // 1. Try Readability article extraction
  try {
    const { document } = parseHTML(html);
    const article = new Readability(document).parse();
    if (article?.textContent?.trim()) {
      text = article.textContent.replace(/\s+/g, " ").trim();
    }
  } catch {
    // readability parse failure — fall through
  }

  // 2. Meta description fallback
  if (!text) {
    try {
      const { document } = parseHTML(html);
      const metaDesc =
        document
          .querySelector('meta[property="og:description"]')
          ?.getAttribute("content") ||
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content");
      if (metaDesc?.trim()) {
        text = metaDesc.trim();
      }
    } catch {
      // parse failure — fall through
    }
  }

  // 3. Page title fallback
  if (!text) {
    try {
      const { document } = parseHTML(html);
      const pageTitle = document.querySelector("title")?.textContent?.trim();
      if (pageTitle) text = pageTitle;
    } catch {
      // parse failure — fall through
    }
  }

  // 4. DB fallbacks
  if (!text) {
    text = fallbackDescription || fallbackTitle || "Content unavailable";
  }

  return trimToWord(text, EXCERPT_MAX_CHARS);
}
