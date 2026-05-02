import type { Page } from "puppeteer";
import sharp from "sharp";
import { getSaversUserAgent } from "./site-url";

const HERO_IMAGE_FETCH_TIMEOUT_MS = 10000;
const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;

// Selectors for content containers where hero images live
const CONTENT_SELECTORS = [
  ".recipe-content",
  ".entry-content",
  ".post-body",
  ".article-body",
  ".main-content",
  '[class*="recipe" i]',
  "main",
  "article",
];

// Selectors for areas to EXCLUDE (sidebar, related, ads, etc.)
const EXCLUDE_SELECTORS = [
  ".sidebar",
  ".related",
  ".recommended",
  ".ads",
  ".advertisement",
  ".footer",
  ".nav",
  ".navigation",
  ".comments",
  ".comment-section",
  '[class*="sidebar" i]',
  '[class*="related" i]',
  '[class*="recommend" i]',
];

// Image alt text keywords that indicate a finished-dish photo
const DISH_ALT_PATTERN = /\bdish\b|\bplate\b|\brecipe\b|\bfood\b|\bmeal\b|\bfinished\b|\bcooked\b|\bserved\b/i;

/**
 * Find the best hero image URL from the recipe page using DOM heuristics.
 */
export async function findRecipeHeroImageUrl(
  page: Page,
  pageUrl: string,
): Promise<string | null> {
  return page.evaluate(
    (contentSel, excludeSel, minW, minH) => {
      const images: Array<{ img: HTMLImageElement; score: number; src: string }> = [];

      for (const img of document.querySelectorAll("img")) {
        // Skip tiny/icons
        if (img.naturalWidth < minW || img.naturalHeight < minH) continue;

        // Resolve the best src
        let src =
          img.dataset.src ||
          img.dataset.lazySrc ||
          img.dataset.original ||
          img.getAttribute("data-src") ||
          img.getAttribute("data-lazy-src") ||
          img.src;

        // Skip placeholder-looking srcs (data: URIs, tiny base64)
        if (src.startsWith("data:") && src.length < 200) continue;

        if (!src || src.startsWith("data:")) continue;

        // Check if inside a content container
        const inContent = contentSel.some((sel: string) => {
          try {
            return img.closest(sel) !== null;
          } catch {
            return false;
          }
        });

        if (!inContent) continue;

        // Check if inside an excluded area
        const inExcluded = excludeSel.some((sel: string) => {
          try {
            return img.closest(sel) !== null;
          } catch {
            return false;
          }
        });

        if (inExcluded) continue;

        // Score: prefer larger images, alt text matching dish keywords
        let score = img.naturalWidth * img.naturalHeight;
        const alt = (img.alt || "").toLowerCase();
        if (/\bdish\b|\bplate\b|\brecipe\b|\bfood\b|\bmeal\b/i.test(alt)) {
          score *= 1.5;
        }

        images.push({ img, score, src });
      }

      // Sort by score descending
      images.sort((a, b) => b.score - a.score);

      // Return the best one
      if (images.length > 0) {
        try {
          return new URL(images[0].src, document.baseURI).href;
        } catch {
          return images[0].src;
        }
      }

      // Fallback: og:image
      const ogImage = document.querySelector<HTMLMetaElement>(
        'meta[property="og:image"]',
      );
      if (ogImage?.content) {
        try {
          return new URL(ogImage.content, document.baseURI).href;
        } catch {
          return ogImage.content;
        }
      }

      return null;
    },
    CONTENT_SELECTORS,
    EXCLUDE_SELECTORS,
    MIN_WIDTH,
    MIN_HEIGHT,
  );
}

/**
 * Fetch a hero image URL and process it through sharp to a 1280x800 cover-crop JPEG.
 */
export async function fetchAndProcessRecipeHero(imageUrl: string): Promise<Buffer> {
  const res = await fetch(imageUrl, {
    headers: {
      "User-Agent": getSaversUserAgent(),
    },
    signal: AbortSignal.timeout(HERO_IMAGE_FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Image fetch failed: HTTP ${res.status}`);

  const arrayBuffer = await res.arrayBuffer();

  const buffer = await sharp(Buffer.from(arrayBuffer))
    .resize(1280, 800, { fit: "cover", position: "centre", withoutEnlargement: true })
    .jpeg({ quality: 85, progressive: true, mozjpeg: true })
    .toBuffer();

  if (buffer.length < 1024) throw new Error("Processed image too small");

  return buffer;
}
