import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

const EXCERPT_MAX_CHARS = 380;
const FETCH_TIMEOUT_MS = 8000;

const USER_AGENT =
  "Mozilla/5.0 (compatible; Savers/1.0; +https://savers-production.up.railway.app)";

// Promotional keywords — each match adds 3 to promo score
const PROMO_KEYWORDS = [
  "subscribe",
  "support us",
  "donate",
  "become a member",
  "follow us",
  "like us",
  "share this",
  "sign up",
  "newsletter",
  "patreon",
  "paypal",
  "buy me a coffee",
];

interface ParagraphAnalysis {
  text: string;
  length: number;
  sentenceCount: number;
  avgWordLength: number;
  hasProperCapitalization: boolean;
  endsWithPeriod: boolean;
  urlCount: number;
  promoScore: number; // 0 = clean, 10+ = very promotional
}

function calculatePromoScore(text: string): number {
  let score = 0;
  const lower = text.toLowerCase();

  for (const keyword of PROMO_KEYWORDS) {
    if (lower.includes(keyword)) score += 3;
  }

  const urlCount = (text.match(/https?:\/\/|www\./gi) || []).length;
  score += urlCount * 2;

  if (text === text.toUpperCase() && text.length > 20) score += 2;
  if (text.length < 50) score += 1;

  return score;
}

function countSentences(text: string): number {
  return text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
}

function isContentParagraph(p: ParagraphAnalysis): boolean {
  if (p.length < 80) return false;
  if (p.urlCount > 0) return false;
  if (p.promoScore > 3) return false;
  if (p.sentenceCount < 2 && !p.endsWithPeriod) return false;
  if (!p.hasProperCapitalization) return false;
  if (p.avgWordLength > 12) return false;
  return true;
}

function analyzeParagraph(text: string): ParagraphAnalysis {
  const words = text.split(/\s+/);
  const avgWordLength =
    words.length > 0
      ? words.reduce((sum, w) => sum + w.length, 0) / words.length
      : 0;

  return {
    text,
    length: text.length,
    sentenceCount: countSentences(text),
    avgWordLength,
    hasProperCapitalization: /^[A-Z]/.test(text),
    endsWithPeriod: /[.]$/.test(text.trim()),
    urlCount: (text.match(/https?:\/\/|www\./gi) || []).length,
    promoScore: calculatePromoScore(text),
  };
}

/**
 * Truncate to ~10 lines at ~80 chars per line, breaking at word boundary.
 * Roughly 800 chars max for 52px font at current margins.
 */
function truncateToLines(text: string, maxLines: number): string {
  const maxChars = maxLines * 80;
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.5 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

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

  let doc: Document;
  try {
    doc = parseHTML(html).document;
  } catch {
    return trimToWord(
      fallbackDescription || fallbackTitle || "Content unavailable",
      EXCERPT_MAX_CHARS,
    );
  }

  const allParagraphs = Array.from(doc.querySelectorAll("p"))
    .map((p) => p.textContent?.replace(/\s+/g, " ").trim() || "")
    .filter((text) => text.length > 0)
    .map(analyzeParagraph);

  const contentParagraphs = allParagraphs.filter(isContentParagraph);

  const totalParagraphs = allParagraphs.length;
  const contentCount = contentParagraphs.length;

  // Strategy 1: 3+ content paragraphs → use 3rd one (skip intro/hook/promo)
  if (contentParagraphs.length >= 3) {
    const excerpt = contentParagraphs[2].text;
    console.log(
      JSON.stringify({
        event: "excerpt_extraction",
        source: "structural_3rd",
        url,
        total_paragraphs: totalParagraphs,
        content_paragraphs: contentCount,
        selected_index: 2,
        excerpt_length: excerpt.length,
      }),
    );
    return truncateToLines(excerpt, 10);
  }

  // Strategy 2: 1-2 content paragraphs → use 1st one
  if (contentParagraphs.length >= 1) {
    const excerpt = contentParagraphs[0].text;
    console.log(
      JSON.stringify({
        event: "excerpt_extraction",
        source: "structural_1st",
        url,
        total_paragraphs: totalParagraphs,
        content_paragraphs: contentCount,
        selected_index: 0,
        excerpt_length: excerpt.length,
      }),
    );
    return truncateToLines(excerpt, 10);
  }

  // Strategy 3: Try Readability inside article/main container
  try {
    const container = doc.querySelector(
      "article, .article-content, .post-content, .entry-content, main",
    );
    if (container) {
      const paragraphs = Array.from(container.querySelectorAll("p"))
        .map((p) => p.textContent?.replace(/\s+/g, " ").trim() || "")
        .filter((text) => {
          if (text.length < 100) return false;
          if (/(subscribe|support|donate|follow us)/i.test(text)) return false;
          if (/https?:\/\/|www\./i.test(text)) return false;
          return true;
        });

      if (paragraphs.length > 0) {
        const excerpt = paragraphs[0];
        console.log(
          JSON.stringify({
            event: "excerpt_extraction",
            source: "article_container",
            url,
            total_paragraphs: totalParagraphs,
            content_paragraphs: contentCount,
            selected_index: -1,
            excerpt_length: excerpt.length,
          }),
        );
        return truncateToLines(excerpt, 10);
      }
    }
  } catch {
    // parse failure — fall through
  }

  // Strategy 4: Meta description
  try {
    const metaDesc =
      doc
        .querySelector('meta[property="og:description"]')
        ?.getAttribute("content") ||
      doc.querySelector('meta[name="description"]')?.getAttribute("content");
    if (metaDesc?.trim()) {
      const excerpt = metaDesc.trim();
      if (
        excerpt.length >= 80 &&
        !/(subscribe|support|donate|follow us)/i.test(excerpt) &&
        !/https?:\/\/|www\./i.test(excerpt)
      ) {
        console.log(
          JSON.stringify({
            event: "excerpt_extraction",
            source: "meta_description",
            url,
            total_paragraphs: totalParagraphs,
            content_paragraphs: contentCount,
            selected_index: -1,
            excerpt_length: excerpt.length,
          }),
        );
        return truncateToLines(excerpt, 10);
      }
    }
  } catch {
    // parse failure — fall through
  }

  // Strategy 5: Page title
  try {
    const pageTitle = doc.querySelector("title")?.textContent?.trim();
    if (pageTitle) {
      console.log(
        JSON.stringify({
          event: "excerpt_extraction",
          source: "page_title",
          url,
          total_paragraphs: totalParagraphs,
          content_paragraphs: contentCount,
          selected_index: -1,
          excerpt_length: pageTitle.length,
        }),
      );
      return trimToWord(pageTitle, EXCERPT_MAX_CHARS);
    }
  } catch {
    // parse failure — fall through
  }

  // Strategy 6: DB fallbacks
  const fallback = fallbackDescription || fallbackTitle || "Content unavailable";
  console.log(
    JSON.stringify({
      event: "excerpt_extraction",
      source: "db_fallback",
      url,
      total_paragraphs: totalParagraphs,
      content_paragraphs: contentCount,
      selected_index: -1,
      excerpt_length: fallback.length,
    }),
  );
  return trimToWord(fallback, EXCERPT_MAX_CHARS);
}
