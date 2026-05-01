import type { Page } from "puppeteer";

/**
 * Extract the primary product image URL from the page.
 * Prioritizes zoom/main image selectors over og:image,
 * and filters out placeholders, logos, and tiny images.
 */
export async function extractPrimaryProductImage(
  page: Page,
): Promise<string | null> {
  const imageUrl = await page.evaluate(() => {
    // Priority 1: Zoom/main product image selectors
    const zoomSelectors = [
      ".product-main-image img",
      ".zoomImg",
      "[data-zoom-image]",
      ".product-image-container img",
      ".pdp-image img",
      ".single-product-gallery img",
    ];

    for (const sel of zoomSelectors) {
      try {
        const img = document.querySelector(sel) as HTMLImageElement | null;
        if (
          img &&
          img.naturalWidth > 400 &&
          img.naturalHeight > 400
        ) {
          return (
            (img as HTMLImageElement & { dataset: DOMStringMap }).dataset
              ?.zoomImage ||
            img.src ||
            img.currentSrc
          );
        }
      } catch {
        // selector parse failure — skip
      }
    }

    // Priority 2: og:image (filter out placeholders and logos)
    const ogImg = document
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content");
    if (
      ogImg &&
      !ogImg.toLowerCase().includes("placeholder") &&
      !ogImg.toLowerCase().includes("logo")
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
