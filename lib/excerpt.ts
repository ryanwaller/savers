import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

const EXCERPT_MAX_CHARS = 380;
const FETCH_TIMEOUT_MS = 8000;

const USER_AGENT =
  "Mozilla/5.0 (compatible; Savers/1.0; +https://savers-production.up.railway.app)";

// Patterns that indicate promotional/footer content rather than article body
const PROMO_PATTERNS = [
  /subscribe/i,
  /support us/i,
  /donate/i,
  /follow us on/i,
  /like us on/i,
  /share this/i,
  /sign up/i,
  /newsletter/i,
];

function isPromotional(text: string): boolean {
  return PROMO_PATTERNS.some((p) => p.test(text));
}

function hasUrls(text: string): boolean {
  return /https?:\/\/|www\./i.test(text);
}

function scoreQuality(text: string): number {
  let score = 100;

  // Penalize URLs
  const urlCount = (text.match(/https?:\/\/|www\./gi) || []).length;
  score -= urlCount * 30;

  // Penalize promotional keywords
  if (isPromotional(text)) score -= 50;

  // Penalize all-caps (headings, CTAs)
  if (
    text === text.toUpperCase() &&
    text.length > 30 &&
    !/[a-z]/.test(text)
  ) {
    score -= 40;
  }

  // Penalize very short text
  if (text.length < 100) score -= 20;
  if (text.length < 50) score -= 40;

  // Reward proper sentence structure (multiple sentences)
  if (text.includes(".") && text.split(".").length > 2) score += 10;

  // Reward normal mixed-case capitalization
  if (/[a-z]/.test(text) && /[A-Z]/.test(text)) score += 10;

  return Math.max(0, score);
}

function trimToWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.5 ? cut.slice(0, lastSpace) : cut) + "…";
}

/**
 * Extract clean <p> text from HTML, filtering out promotional paragraphs.
 * Used as a fallback when Readability produces low-quality output.
 */
function extractCleanParagraphs(html: string): string | null {
  try {
    const { document } = parseHTML(html);
    const paragraphs = Array.from(document.querySelectorAll("p"))
      .map((p) => p.textContent?.replace(/\s+/g, " ").trim() || "")
      .filter((text) => {
        if (text.length < 50) return false;
        if (hasUrls(text)) return false;
        if (isPromotional(text)) return false;
        if (text === text.toUpperCase() && text.length > 20) return false;
        return true;
      })
      .slice(0, 5);

    if (paragraphs.length === 0) return null;

    // Join paragraphs with spaces until we have enough content
    let result = "";
    for (const p of paragraphs) {
      const next = result ? result + " " + p : p;
      if (next.length > EXCERPT_MAX_CHARS + 100) break;
      result = next;
    }
    return result;
  } catch {
    return null;
  }
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
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch {
    const fallback = trimToWord(
      fallbackDescription || fallbackTitle || "Content unavailable",
      EXCERPT_MAX_CHARS,
    );
    return fallback;
  }

  let bestText: string | null = null;
  let bestSource = "none";
  let bestScore = -1;

  // 1. Try Readability article extraction
  try {
    const { document } = parseHTML(html);
    const article = new Readability(document).parse();
    if (article?.textContent?.trim()) {
      const text = article.textContent.replace(/\s+/g, " ").trim();
      const score = scoreQuality(text);
      if (score > bestScore) {
        bestText = text;
        bestScore = score;
        bestSource = "readability";
      }
    }
  } catch {
    // readability parse failure — fall through
  }

  // 2. If Readability score is low, try clean paragraph extraction
  if (bestScore < 50) {
    const paragraphText = extractCleanParagraphs(html);
    if (paragraphText) {
      const score = scoreQuality(paragraphText);
      if (score > bestScore) {
        bestText = paragraphText;
        bestScore = score;
        bestSource = "paragraphs";
      }
    }
  }

  // 3. Meta description fallback
  if (bestScore < 50) {
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
        const text = metaDesc.trim();
        const score = scoreQuality(text);
        if (score > bestScore) {
          bestText = text;
          bestScore = score;
          bestSource = "meta_description";
        }
      }
    } catch {
      // parse failure — fall through
    }
  }

  // 4. Page title fallback
  if (bestScore < 50) {
    try {
      const { document } = parseHTML(html);
      const pageTitle = document
        .querySelector("title")
        ?.textContent?.trim();
      if (pageTitle) {
        const score = scoreQuality(pageTitle);
        if (score > bestScore) {
          bestText = pageTitle;
          bestScore = score;
          bestSource = "page_title";
        }
      }
    } catch {
      // parse failure — fall through
    }
  }

  // 5. DB fallbacks
  if (bestScore < 50) {
    bestText =
      fallbackDescription || fallbackTitle || "Content unavailable";
    bestSource = "db_fallback";
  }

  console.log(
    JSON.stringify({
      event: "excerpt_extraction",
      source: bestSource,
      score: bestScore,
      length: bestText?.length ?? 0,
      url,
    }),
  );

  return trimToWord(bestText!, EXCERPT_MAX_CHARS);
}
