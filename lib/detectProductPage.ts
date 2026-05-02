import type { Page } from "puppeteer";

export interface DetectionSignals {
  score: number;
  signals: string[];
  confidence: "high" | "medium" | "low";
}

/**
 * Weighted scoring detection for single product pages.
 * Lowered thresholds (high >= 4, was >= 5) with more signals
 * for broader coverage of boutique/product brand sites.
 */
export async function detectProductPage(
  page: Page,
): Promise<DetectionSignals> {
  let score = 0;
  const signals: string[] = [];

  // Tier 1: Structured Data (weight: 3)
  const hasJsonLdProduct = await page.evaluate(() => {
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    for (const s of scripts) {
      try {
        const data = JSON.parse(s.textContent || "");
        if (!data) continue;
        const check = (d: Record<string, unknown>) =>
          typeof d["@type"] === "string" && d["@type"].includes("Product");
        if (Array.isArray(data) && data.some(check)) return true;
        if (check(data)) return true;
      } catch {
        // malformed JSON — skip
      }
    }
    return false;
  });

  if (hasJsonLdProduct) {
    score += 3;
    signals.push("json_ld_product");
  }

  // Tier 2: Meta Tags (weight: 2 each)
  try {
    const ogType =
      (await page.$eval(
        'meta[property="og:type"]',
        (el) => (el as HTMLMetaElement).content,
      )) || "";
    if (ogType.toLowerCase().includes("product")) {
      score += 2;
      signals.push("og_type_product");
    }
  } catch {
    // meta tag missing — skip
  }

  // og:title with price pattern — weak product signal
  try {
    const ogTitle =
      (await page.$eval(
        'meta[property="og:title"]',
        (el) => (el as HTMLMetaElement).content,
      )) || "";
    if (/^\$|\d+\s*(usd|eur|gbp|aud)|\d+(\.\d{2})\s*(usd|eur|gbp)/i.test(ogTitle)) {
      score += 1;
      signals.push("og_title_has_price");
    }
  } catch {
    // meta tag missing — skip
  }

  // Tier 3: URL Patterns (weight: 2)
  const url = page.url();
  const productUrlPattern =
    /\/(product|item|p\/|shop\/|store\/product|collections\/[\w-]+\/products|products\/)[\w-]/i;
  if (productUrlPattern.test(url)) {
    score += 2;
    signals.push("url_product_pattern");
  }

  // Tier 4: DOM Structure (weight: 2) — expanded selectors
  const hasProductContainer = await page.evaluate(() => {
    const selectors = [
      ".product-main",
      ".product-image",
      ".item-details",
      ".pdp-container",
      "[data-product]",
      ".product-single",
      ".ProductItem",
      ".product-form",
      ".add-to-cart",
      ".add-to-bag",
      ".buy-button",
      ".product-details",
      '[class*="product-detail"]',
      '[class*="product-single"]',
    ];
    return selectors.some((sel) => {
      try {
        return document.querySelector(sel) !== null;
      } catch {
        return false;
      }
    });
  });

  if (hasProductContainer) {
    score += 2;
    signals.push("dom_product_container");
  }

  // Tier 5: Price Detection (weight: 2)
  const hasPrice = await page.evaluate(() => {
    const pricePattern = /\$[\d,]+(\.\d{2})?|\d+\s*(usd|eur|gbp|aud)/i;
    const priceSelectors = [
      ".price",
      ".product-price",
      "[data-price]",
      ".money",
      ".price__sale",
      ".product__price",
      '[class*="price"]',
    ];
    for (const sel of priceSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el && pricePattern.test(el.textContent || "")) return true;
      } catch {
        // skip
      }
    }
    return false;
  });

  if (hasPrice) {
    score += 2;
    signals.push("price_detected");
  }

  // Tier 6: Anti-storefront signals (weight: -2 each, lowered card threshold)
  const cardCount = await page.evaluate(
    () =>
      document.querySelectorAll(
        '.product-card, .item-tile, .grid-item, [class*="product-item"], [class*="product-tile"], .product-grid-item',
      ).length,
  );

  if (cardCount > 3) {
    score -= 2;
    signals.push(`multi_item_grid_${cardCount}`);
  }

  const storefrontUrlPattern =
    /\/(category|collection|search|deals|landing|home)[\/?]/i;
  if (storefrontUrlPattern.test(url)) {
    score -= 2;
    signals.push("storefront_url");
  }

  // Platform shortcuts: override to at least 5 (high confidence)
  const hasPlatform = await page.evaluate(() => {
    return {
      shopify: !!document.querySelector(
        "[data-shopify], .shopify-payments-button, .product-form__cart-submit, .shopify-payment-button",
      ),
      woocommerce: !!document.querySelector(
        ".woocommerce-product-gallery, .single-product.woocommerce, .product_meta",
      ),
      squarespace: !!document.querySelector(
        ".sqs-add-to-cart-button, .ProductItem-details",
      ),
      bigcommerce: !!document.querySelector(
        "[data-product-id], .productView-info",
      ),
      etsy: !!document.querySelector(".etsy-buy-button, .listing-carousel"),
    };
  });

  if (Object.values(hasPlatform).some(Boolean)) {
    score = Math.max(score, 5);
    signals.push("platform_override");
  }

  // Lowered thresholds: high >= 4 (was 5), medium >= 3
  const confidence: DetectionSignals["confidence"] =
    score >= 4 ? "high" : score >= 3 ? "medium" : "low";

  return { score, signals, confidence };
}
