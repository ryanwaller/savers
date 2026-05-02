import type { Page } from "puppeteer";

export interface DetectionSignals {
  forceInset: boolean;
  isStorefront: boolean;
  confidence: "high" | "medium" | "low";
  signals: string[];
}

/**
 * Aggressive product page detection for shopping bookmarks.
 * Inverts the logic: assume product page, force inset unless clearly a storefront.
 * ANY single product signal triggers an inset attempt.
 */
export async function detectProductPage(
  page: Page,
): Promise<DetectionSignals> {
  const signals: string[] = [];

  // STEP 1: Check for obvious multi-item storefront (block inset)
  const cardCount = await page.evaluate(() => {
    return document.querySelectorAll(
      ".product-card, .item-tile, .grid-item, .product-grid-item, .product-teaser, [class*='product-item'], [class*='product-tile']",
    ).length;
  });

  if (cardCount >= 4) {
    return {
      forceInset: false,
      isStorefront: true,
      confidence: "high",
      signals: [`storefront_${cardCount}_items`],
    };
  }

  // STEP 2: Check for product signals (any one triggers inset)
  const productSignals = await page.evaluate(() => {
    const checks: Record<string, boolean> = {
      jsonLdProduct: (() => {
        const scripts = document.querySelectorAll(
          'script[type="application/ld+json"]',
        );
        return Array.from(scripts).some((s) => {
          try {
            const data = JSON.parse(s.textContent || "");
            if (!data) return false;
            const check = (d: Record<string, unknown>) =>
              typeof d["@type"] === "string" &&
              d["@type"].includes("Product");
            if (Array.isArray(data) && data.some(check)) return true;
            return check(data);
          } catch {
            return false;
          }
        });
      })(),

      ogTypeProduct:
        document
          .querySelector('meta[property="og:type"]')
          ?.getAttribute("content")
          ?.toLowerCase()
          .includes("product") || false,

      urlProductPattern:
        /\/(product|item|p\/|shop\/|collections\/[\w-]+\/products|products\/)[\w-]+/i.test(
          location.href,
        ),

      hasPrice: /\$[\d,]+(\.\d{2})?|\d+\s*(usd|eur|gbp|aud)/i.test(
        document.body.textContent || "",
      ),

      hasCartButton: !!document.querySelector(
        ".add-to-cart, .add-to-bag, .buy-button, .product-form__cart-submit, .atc-button, [data-add-to-cart], .shopify-payment-button, .sqs-add-to-cart-button",
      ),

      hasProductImageContainer: !!document.querySelector(
        ".product-image, .product-main-image, .pdp-image, .ProductItem-gallery, .woocommerce-product-gallery, .product-gallery, .single-product-gallery",
      ),

      singleLargeImage: (() => {
        const imgs = Array.from(document.querySelectorAll("img"));
        const large = imgs.filter(
          (i) => i.naturalWidth > 400 && i.naturalHeight > 400,
        );
        return large.length >= 1 && large.length <= 2;
      })(),
    };

    return checks;
  });

  const positiveSignals = Object.entries(productSignals)
    .filter(([, v]) => v)
    .map(([k]) => k);

  signals.push(...positiveSignals);

  // FORCE inset if ANY signal present
  const forceInset = positiveSignals.length >= 1;
  const confidence =
    positiveSignals.length >= 3
      ? "high"
      : positiveSignals.length >= 1
        ? "medium"
        : "low";

  return { forceInset, isStorefront: false, confidence, signals };
}
