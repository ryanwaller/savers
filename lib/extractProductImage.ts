import type { Page } from "puppeteer";

/**
 * Extract the primary product image URL from the page.
 * Uses three strategies in order: main selectors → largest image in
 * product container → og:image (with placeholder/logo/icon filtering).
 * Lowered minimum dimensions from 400 to 300 for broader coverage.
 */
export async function extractPrimaryProductImage(
  page: Page,
): Promise<string | null> {
  const imageUrl = await page.evaluate(() => {
    // Strategy 1: Main product image selectors
    const mainSelectors = [
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
    ];

    for (const sel of mainSelectors) {
      try {
        const img = document.querySelector(sel) as HTMLImageElement | null;
        if (
          img &&
          img.naturalWidth > 300 &&
          img.naturalHeight > 300
        ) {
          const src =
            (img as HTMLImageElement & { dataset: DOMStringMap }).dataset
              ?.zoomImage ||
            (img as HTMLImageElement & { dataset: DOMStringMap }).dataset
              ?.mainImage ||
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

    // Strategy 2: Find largest image inside a product container
    const allImages = Array.from(document.querySelectorAll("img"));
    const productImages = allImages
      .filter((img) => {
        if (img.naturalWidth < 300 || img.naturalHeight < 300) return false;
        const src = img.src || img.currentSrc;
        if (!src) return false;
        if (
          src.includes("logo") ||
          src.includes("icon") ||
          src.includes("spacer") ||
          src.includes("placeholder")
        )
          return false;
        return (
          img.closest(
            ".product-image, .product-main, .pdp-container, [data-product], .product-single, .ProductItem, .product-form, .product-details",
          ) !== null
        );
      })
      .sort(
        (a, b) =>
          b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight,
      );

    if (productImages.length > 0) {
      return productImages[0].src || productImages[0].currentSrc;
    }

    // Strategy 3: og:image (filter out logos, icons, placeholders)
    const ogImg = document
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content");
    if (
      ogImg &&
      !ogImg.toLowerCase().includes("placeholder") &&
      !ogImg.toLowerCase().includes("logo") &&
      !ogImg.toLowerCase().includes("icon")
    ) {
      return ogImg;
    }

    return null;
  });

  if (!imageUrl) return null;

  try {
    return new URL(imageUrl, page.url()).href;
  } catch {
    return imageUrl;
  }
}
