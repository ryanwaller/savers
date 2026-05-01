import type { Page } from "puppeteer";

export interface DetectionSignals {
  score: number;
  signals: string[];
  confidence: "high" | "medium" | "low";
}

/**
 * Weighted scoring detection for single product pages.
 * Returns score, signals list, and confidence level.
 * Only "high" confidence should trigger product inset generation.
 */
export async function detectProductPage(
  page: Page,
): Promise<DetectionSignals> {
  let score = 0;
  const signals: string[] = [];

  // Tier 1: Structured Data (weight: 4)
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
    score += 4;
    signals.push("json_ld_product");
  }

  // Tier 2: Meta Tags & URL (weight: 3 each)
  try {
    const ogType =
      (await page.$eval(
        'meta[property="og:type"]',
        (el) => (el as HTMLMetaElement).content,
      )) || "";
    if (ogType.toLowerCase().includes("product")) {
      score += 3;
      signals.push("og_type_product");
    }
  } catch {
    // meta tag missing — skip
  }

  const url = page.url();
  const productUrlPattern =
    /\/(product|item|p\/|shop\/item|buy)[\/?]/i;
  if (productUrlPattern.test(url)) {
    score += 3;
    signals.push("url_product_pattern");
  }

  // Tier 3: DOM Structure (weight: 2)
  const hasProductContainer = await page.evaluate(() => {
    const selectors = [
      ".product-main",
      ".product-image",
      ".item-details",
      ".pdp-container",
      "[data-product]",
    ];
    return selectors.some((sel) => document.querySelector(sel) !== null);
  });

  if (hasProductContainer) {
    score += 2;
    signals.push("dom_product_container");
  }

  // Tier 4: Anti-storefront signals (weight: -2 each)
  const cardCount = await page.evaluate(
    () =>
      document.querySelectorAll(
        '.product-card, .item-tile, .grid-item, [class*="product-item"], [class*="product-tile"]',
      ).length,
  );

  if (cardCount > 5) {
    score -= 2;
    signals.push("multi_item_grid");
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
        "[data-shopify], .shopify-payments-button, .product-form__cart-submit",
      ),
      woocommerce: !!document.querySelector(
        ".woocommerce-product-gallery, .single-product.woocommerce",
      ),
      etsy: !!document.querySelector(".etsy-buy-button, .listing-carousel"),
    };
  });

  if (Object.values(hasPlatform).some(Boolean)) {
    score = Math.max(score, 5);
    signals.push("platform_override");
  }

  const confidence: DetectionSignals["confidence"] =
    score >= 5 ? "high" : score >= 3 ? "medium" : "low";

  return { score, signals, confidence };
}
