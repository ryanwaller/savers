import type { Page } from "puppeteer";

/**
 * Aggressive primary product image extraction.
 * Tries 5 strategies in order, returning the first usable result.
 */
export async function extractPrimaryProductImage(
  page: Page,
): Promise<string | null> {
  // Strategy 1: Main product image selectors (most specific)
  let imageUrl = await page.evaluate(() => {
    const selectors = [
      ".product-main-image img",
      ".zoomImg",
      "[data-zoom-image]",
      ".product-image-container img",
      ".pdp-image img",
      ".single-product-gallery img",
      ".ProductItem-gallery-slides-item img",
      ".woocommerce-product-gallery__image img",
      "[data-main-image] img",
      ".image__img img",
      ".product-gallery__image img",
      ".gallery__image img",
      ".main-product-image img",
    ];

    for (const sel of selectors) {
      try {
        const img = document.querySelector(sel) as HTMLImageElement | null;
        if (img) {
          const width = img.naturalWidth || img.width;
          if (width > 300) {
            const src = readImageSrc(img);
            if (src && !isFiltered(src)) return src;
          }
        }
      } catch {
        // selector parse failure — skip
      }
    }
    return null;
  });
  if (imageUrl) return resolveUrl(imageUrl, page.url());

  // Strategy 2: JSON-LD structured data images
  imageUrl = await page.evaluate(() => {
    try {
      const scripts = document.querySelectorAll(
        'script[type="application/ld+json"]',
      );
      for (const s of scripts) {
        try {
          const data = JSON.parse(s.textContent || "");
          const image = extractJsonLdImage(data);
          if (image) return image;
        } catch {
          // parse error — skip
        }
      }
    } catch {
      // DOM error — skip
    }
    return null;
  });
  if (imageUrl) return resolveUrl(imageUrl, page.url());

  // Strategy 3: OG / Twitter / article image meta tags
  imageUrl = await page.evaluate(() => {
    const metaSelectors = [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[property="twitter:image"]',
      'meta[name="twitter:image:src"]',
      'meta[property="article:image"]',
    ];
    for (const sel of metaSelectors) {
      try {
        const el = document.querySelector(sel);
        const content = el?.getAttribute("content");
        if (content && !isFiltered(content)) return content;
      } catch {
        // skip
      }
    }
    return null;
  });
  if (imageUrl) return resolveUrl(imageUrl, page.url());

  // Strategy 4: Largest image inside main/article/content area
  imageUrl = await page.evaluate(() => {
    const allImages = Array.from(document.querySelectorAll("img"));
    const containers = [
      ".product-image", ".product-main", ".pdp-container",
      "[data-product]", "main", "article", ".product",
      ".main-content", ".content",
    ];

    const valid = allImages.filter((img) => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (width < 400 || height < 400) return false;
      const src = img.src || img.currentSrc;
      if (isFiltered(src)) return false;
      return containers.some((c) => img.closest(c) !== null);
    });

    valid.sort(
      (a, b) =>
        (b.naturalWidth || b.width) * (b.naturalHeight || b.height) -
        (a.naturalWidth || a.width) * (a.naturalHeight || a.height),
    );

    const best = valid[0];
    if (best) return readImageSrc(best);
    return null;
  });
  if (imageUrl) return resolveUrl(imageUrl, page.url());

  // Strategy 5: Any image > 500x500 on page (last resort)
  imageUrl = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img"));
    const large = imgs.filter(
      (i) => (i.naturalWidth || i.width) > 500 && (i.naturalHeight || i.height) > 500,
    );
    const best = large[0];
    if (best) return readImageSrc(best);
    return null;
  });
  if (imageUrl) return resolveUrl(imageUrl, page.url());

  return null;
}

/** Read the best available URL from an image element, checking lazy-load attributes. */
function readImageSrc(img: HTMLImageElement): string {
  return (
    (img as HTMLImageElement & { dataset: DOMStringMap }).dataset?.zoomImage ||
    (img as HTMLImageElement & { dataset: DOMStringMap }).dataset?.src ||
    img.getAttribute("data-src") ||
    img.getAttribute("data-lazy-src") ||
    img.getAttribute("data-original") ||
    img.getAttribute("data-srcset")?.split(",")[0]?.trim()?.split(" ")[0] ||
    parseSrcsetLargest(img.getAttribute("srcset")) ||
    img.src ||
    img.currentSrc
  );
}

/** Parse srcset attribute for the largest candidate by descriptor. */
function parseSrcsetLargest(srcset: string | null): string | null {
  if (!srcset) return null;
  let bestUrl: string | null = null;
  let bestSize = 0;
  const candidates = srcset.split(",");
  for (const c of candidates) {
    const parts = c.trim().split(/\s+/);
    const url = parts[0];
    const descriptor = parts[1];
    let size = 0;
    if (descriptor) {
      if (descriptor.endsWith("w")) {
        size = parseInt(descriptor, 10) || 0;
      } else if (descriptor.endsWith("x")) {
        size = parseFloat(descriptor) * 1000;
      }
    }
    if (!bestUrl || size > bestSize) {
      bestUrl = url;
      bestSize = size;
    }
  }
  return bestUrl;
}

/** Recurse into JSON-LD to find an image URL. */
function extractJsonLdImage(
  data: unknown,
  depth: number = 0,
): string | null {
  if (depth > 5 || !data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  // Direct image property
  if (typeof obj.image === "string" && !isFiltered(obj.image)) {
    return obj.image;
  }
  // Array of images or ImageObject
  if (Array.isArray(obj.image)) {
    for (const item of obj.image) {
      if (typeof item === "string" && !isFiltered(item)) return item;
      if (typeof item === "object" && item && typeof (item as Record<string, unknown>).url === "string") {
        const u = (item as Record<string, unknown>).url as string;
        if (!isFiltered(u)) return u;
      }
    }
  }
  // ImageObject pattern: { "@type": "ImageObject", "url": "..." }
  if (typeof obj.url === "string" && obj["@type"] === "ImageObject") {
    if (!isFiltered(obj.url)) return obj.url;
  }
  // Recurse into nested objects/arrays
  for (const value of Object.values(obj)) {
    const found = extractJsonLdImage(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function isFiltered(src: string): boolean {
  const lower = src.toLowerCase();
  return (
    lower.includes("placeholder") ||
    lower.includes("logo") ||
    lower.includes("icon") ||
    lower.includes("spacer") ||
    lower.includes("avatar")
  );
}

function resolveUrl(raw: string, baseUrl: string): string {
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return raw;
  }
}
