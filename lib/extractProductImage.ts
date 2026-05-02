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
        if (img && img.naturalWidth > 300) {
          const src =
            (img as HTMLImageElement & { dataset: DOMStringMap }).dataset
              ?.zoomImage ||
            (img as HTMLImageElement & { dataset: DOMStringMap }).dataset
              ?.src ||
            img.src ||
            img.currentSrc;
          if (
            src &&
            !src.includes("placeholder") &&
            !src.includes("logo") &&
            !src.includes("icon")
          ) {
            return src;
          }
        }
      } catch {
        // selector parse failure — skip
      }
    }
    return null;
  });
  if (imageUrl) return resolveUrl(imageUrl, page.url());

  // Strategy 2: Largest image inside main/article content area
  imageUrl = await page.evaluate(() => {
    const allImages = Array.from(document.querySelectorAll("img"));
    const valid = allImages
      .filter(
        (img) =>
          img.naturalWidth > 400 &&
          img.naturalHeight > 400 &&
          !img.src.includes("logo") &&
          !img.src.includes("icon") &&
          !img.src.includes("spacer") &&
          !img.src.includes("avatar") &&
          !img.src.includes("placeholder") &&
          img.closest(
            ".product-image, .product-main, .pdp-container, [data-product], main, article, .product, .main-content, .content",
          ) !== null,
      )
      .sort(
        (a, b) =>
          b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight,
      );

    return valid[0]?.src || valid[0]?.currentSrc || null;
  });
  if (imageUrl) return resolveUrl(imageUrl, page.url());

  // Strategy 3: OG image (filtered)
  try {
    imageUrl = await page.$eval(
      'meta[property="og:image"]',
      (el) => (el as HTMLMetaElement).content,
    );
    if (
      imageUrl &&
      !imageUrl.toLowerCase().includes("logo") &&
      !imageUrl.toLowerCase().includes("icon") &&
      !imageUrl.toLowerCase().includes("placeholder")
    ) {
      return resolveUrl(imageUrl, page.url());
    }
  } catch {
    // meta tag missing — skip
  }

  // Strategy 4: Any image > 500x500 on page (last resort)
  imageUrl = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("img"));
    const large = imgs.filter(
      (i) => i.naturalWidth > 500 && i.naturalHeight > 500,
    );
    return large[0]?.src || large[0]?.currentSrc || null;
  });
  if (imageUrl) return resolveUrl(imageUrl, page.url());

  return null;
}

function resolveUrl(raw: string, baseUrl: string): string {
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return raw;
  }
}
