import type { Page } from "puppeteer";

/**
 * Aggressive primary product image extraction.
 * Runs entirely inside one page.evaluate block so browser-context helper
 * functions are always available during worker execution.
 */
export async function extractPrimaryProductImage(
  page: Page,
): Promise<string | null> {
  const extractorSource = String.raw`
    (() => {
      const isFiltered = function (src) {
        const lower = String(src || "").toLowerCase();
        return (
          lower.includes("placeholder") ||
          lower.includes("icon") ||
          lower.includes("spacer") ||
          lower.includes("avatar")
        );
      };

      const parseSrcsetLargest = function (srcset) {
        if (!srcset) return null;
        let bestUrl = null;
        let bestSize = 0;
        const candidates = String(srcset).split(",");
        for (const candidate of candidates) {
          const parts = candidate.trim().split(/\s+/);
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
      };

      const readImageSrc = function (img) {
        return (
          (img.dataset && img.dataset.zoomImage) ||
          (img.dataset && img.dataset.src) ||
          img.getAttribute("data-src") ||
          img.getAttribute("data-lazy-src") ||
          img.getAttribute("data-original") ||
          (img.getAttribute("data-srcset") || "").split(",")[0]?.trim()?.split(" ")[0] ||
          parseSrcsetLargest(img.getAttribute("srcset")) ||
          img.src ||
          img.currentSrc
        );
      };

      const extractJsonLdImage = function (data, depth = 0) {
        if (depth > 5 || !data || typeof data !== "object") return null;
        const obj = data;

        if (typeof obj.image === "string" && !isFiltered(obj.image)) {
          return obj.image;
        }

        if (Array.isArray(obj.image)) {
          for (const item of obj.image) {
            if (typeof item === "string" && !isFiltered(item)) return item;
            if (item && typeof item === "object" && typeof item.url === "string") {
              if (!isFiltered(item.url)) return item.url;
            }
          }
        }

        if (typeof obj.url === "string" && obj["@type"] === "ImageObject") {
          if (!isFiltered(obj.url)) return obj.url;
        }

        for (const value of Object.values(obj)) {
          const found = extractJsonLdImage(value, depth + 1);
          if (found) return found;
        }

        return null;
      };

      const mainSelectors = [
        ".product-media__image",
        ".product-media img",
        ".product__media img",
        "[data-media-id] img",
        "[class*='product-media'] img",
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
        "[data-testid*='product-gallery'] img",
        "[data-testid*='product-image'] img",
      ];

      const explicitProductMedia = Array.from(
        document.querySelectorAll("img.product-media__image"),
      ).sort(
        (a, b) =>
          ((b.naturalWidth || b.width) * (b.naturalHeight || b.height)) -
          ((a.naturalWidth || a.width) * (a.naturalHeight || a.height)),
      );

      if (explicitProductMedia[0]) {
        const src = readImageSrc(explicitProductMedia[0]);
        if (src && !isFiltered(src)) return src;
      }

      for (const selector of mainSelectors) {
        try {
          const matches = Array.from(document.querySelectorAll(selector));
          const sorted = matches
            .filter((img) => img instanceof HTMLImageElement)
            .sort(
              (a, b) =>
                (((b && b.naturalWidth) || b.width) *
                  ((b && b.naturalHeight) || b.height)) -
                (((a && a.naturalWidth) || a.width) *
                  ((a && a.naturalHeight) || a.height)),
            );

          for (const match of sorted) {
            const img = match;
            const width = img.naturalWidth || img.width;
            if (width <= 300) continue;
            const src = readImageSrc(img);
            if (src && !isFiltered(src)) return src;
          }
        } catch {}
      }

      try {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
          try {
            const data = JSON.parse(script.textContent || "");
            const image = extractJsonLdImage(data);
            if (image) return image;
          } catch {}
        }
      } catch {}

      const metaSelectors = [
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
        'meta[property="twitter:image"]',
        'meta[name="twitter:image:src"]',
        'meta[property="article:image"]',
      ];
      for (const selector of metaSelectors) {
        try {
          const el = document.querySelector(selector);
          const content = el && el.getAttribute("content");
          if (content && !isFiltered(content)) return content;
        } catch {}
      }

      const allImages = Array.from(document.querySelectorAll("img"));
      const candidateContainers = [
        ".product-image",
        ".product-main",
        ".pdp-container",
        "[data-product]",
        "main",
        "article",
        ".product",
        ".main-content",
        ".content",
      ];

      const valid = allImages.filter((img) => {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        if (width < 400 || height < 400) return false;
        const src = img.src || img.currentSrc;
        if (!src || isFiltered(src)) return false;
        return candidateContainers.some((selector) => {
          try {
            return img.closest(selector) !== null;
          } catch {
            return false;
          }
        });
      });

      valid.sort(
        (a, b) =>
          (b.naturalWidth || b.width) * (b.naturalHeight || b.height) -
          (a.naturalWidth || a.width) * (a.naturalHeight || a.height),
      );

      if (valid[0]) {
        const src = readImageSrc(valid[0]);
        if (src && !isFiltered(src)) return src;
      }

      const large = allImages.filter((img) => {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        const src = img.src || img.currentSrc;
        return width > 500 && height > 500 && !!src && !isFiltered(src);
      });

      if (large[0]) {
        const src = readImageSrc(large[0]);
        if (src && !isFiltered(src)) return src;
      }

      return null;
    })()
  `;

  const imageUrl = await page.evaluate(extractorSource => {
    return window.eval(extractorSource);
  }, extractorSource);

  if (!imageUrl) return null;

  try {
    return new URL(imageUrl, page.url()).href;
  } catch {
    return imageUrl;
  }
}
