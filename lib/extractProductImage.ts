import type { Page } from "puppeteer";
import sharp from "sharp";

const IMAGE_FETCH_TIMEOUT_MS = 10000;
const MIN_WIDTH = 200;
const MIN_HEIGHT = 200;

const PRODUCT_CONTAINERS = [
  ".product-image-container",
  ".product-gallery",
  '[class*="product-img"]',
  '[class*="product-image"]',
  ".main-image",
  '[class*="gallery"]',
  ".pdp-image",
];

const EXCLUDE_SELECTORS = [
  ".sidebar",
  ".related",
  ".recommended",
  ".cart",
  '[class*="sidebar"]',
  '[class*="related"]',
  '[class*="recommend"]',
  '[class*="thumbnail"]',
  ".thumbnails",
];

/**
 * Layered heuristics to determine if the page is a single product page.
 * All run inside a single page.evaluate() call.
 */
export async function isSingleProductPage(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    // Layer 1: Structured data (strongest signal)
    const ogType = document
      .querySelector('meta[property="og:type"]')
      ?.getAttribute("content");
    if (ogType && ogType.toLowerCase() === "product") return true;

    for (const script of document.querySelectorAll(
      'script[type="application/ld+json"]',
    )) {
      try {
        const data = JSON.parse(script.textContent || "");
        if (data) {
          if (data["@type"] === "Product" || data["@type"] === "ProductGroup")
            return true;
          if (
            Array.isArray(data) &&
            data.some(
              (d: Record<string, unknown>) =>
                d["@type"] === "Product" || d["@type"] === "ProductGroup",
            )
          )
            return true;
        }
      } catch {
        // malformed JSON — skip
      }
    }

    // Layer 2: URL patterns
    const path = window.location.pathname.toLowerCase();
    const productPatterns = [
      "/product/",
      "/item/",
      "/p/",
      "/shop/",
      "/store/item/",
    ];
    const storefrontPatterns = [
      "/category/",
      "/collection/",
      "/search/",
      "/store/",
      "/home/",
      "/landing/",
      "/deals/",
    ];

    for (const p of productPatterns) {
      if (path.includes(p)) return true;
    }
    for (const p of storefrontPatterns) {
      if (path.includes(p)) return false;
    }

    // Layer 3: DOM structure
    const productCards = document.querySelectorAll(
      '.product-card, .item-tile, .grid-item, [class*="product-item"], [class*="product-tile"]',
    );
    if (productCards.length > 5) return false;
    if (productCards.length <= 1) {
      const hasProductMain = document.querySelector(
        ".product-main-image, #product, [class*='product-gallery'], [class*='product-hero']",
      );
      if (hasProductMain) return true;
    }

    return false;
  });
}

/**
 * Extract the best product image URL from the page.
 */
export async function extractProductImageUrl(
  page: Page,
): Promise<string | null> {
  return page.evaluate(
    (containers, exclude, minW, minH) => {
      // 1. og:image — fastest, most reliable on product pages
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

      // 2. Scan images inside product containers
      const candidates: Array<{ src: string; score: number }> = [];

      for (const img of document.querySelectorAll("img")) {
        if (img.naturalWidth < minW || img.naturalHeight < minH) continue;

        // Resolve best src (prefer data-src/srcset over src for lazy-loaded)
        let src =
          img.dataset.src ||
          img.dataset.lazySrc ||
          img.getAttribute("data-src") ||
          img.getAttribute("data-lazy-src") ||
          img.getAttribute("data-original") ||
          img.src;

        if (!src || src.startsWith("data:")) continue;

        // Must be inside a product container
        const inContainer = containers.some((sel: string) => {
          try {
            return img.closest(sel) !== null;
          } catch {
            return false;
          }
        });
        if (!inContainer) continue;

        // Must not be inside an excluded area
        const inExcluded = exclude.some((sel: string) => {
          try {
            return img.closest(sel) !== null;
          } catch {
            return false;
          }
        });
        if (inExcluded) continue;

        // Score by area (larger = more likely the main product image)
        let score = img.naturalWidth * img.naturalHeight;

        // Bonus for being one of few images in a gallery (not a thumbnail strip)
        const parent = img.closest(
          ".product-gallery, [class*='gallery'], .main-image",
        );
        if (parent && parent.querySelectorAll("img").length <= 3) {
          score *= 1.5;
        }

        candidates.push({ src, score });
      }

      candidates.sort((a, b) => b.score - a.score);

      if (candidates[0]) {
        try {
          return new URL(candidates[0].src, document.baseURI).href;
        } catch {
          return candidates[0].src;
        }
      }

      return null;
    },
    PRODUCT_CONTAINERS,
    EXCLUDE_SELECTORS,
    MIN_WIDTH,
    MIN_HEIGHT,
  );
}

/**
 * Fetch a product image URL and composite it centered on a 1280x800
 * light-grey canvas. Preserves aspect ratio, no distortion.
 */
export async function generateProductInsetImage(
  productImageUrl: string,
): Promise<Buffer> {
  const res = await fetch(productImageUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; Savers/1.0; +https://savers-production.up.railway.app)",
    },
    signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
  });

  if (!res.ok)
    throw new Error(`Product image fetch failed: HTTP ${res.status}`);

  const arrayBuffer = await res.arrayBuffer();

  // Resize product image to fit within 1000x600, preserving aspect ratio
  const resized = sharp(Buffer.from(arrayBuffer)).resize(1000, 600, {
    fit: "inside",
    withoutEnlargement: true,
  });
  const metadata = await resized.metadata();
  const inset = await resized.toBuffer();

  const iw = metadata.width!;
  const ih = metadata.height!;
  const left = Math.round((1280 - iw) / 2);
  const top = Math.round((800 - ih) / 2);

  // Composite centered onto light-grey canvas
  const result = await sharp({
    create: {
      width: 1280,
      height: 800,
      channels: 3,
      background: { r: 248, g: 249, b: 250 }, // #F8F9FA
    },
  })
    .composite([{ input: inset, left, top }])
    .jpeg({ quality: 90, progressive: true })
    .toBuffer();

  if (result.length < 1024) throw new Error("Processed product image too small");

  return result;
}
