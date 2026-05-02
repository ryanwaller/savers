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
  let score = 0;
  const signals: string[] = [];

  const productSignals = await page.evaluate(() => {
    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    const jsonLdProduct = Array.from(scripts).some((s) => {
      try {
        const data = JSON.parse(s.textContent || "");
        if (!data) return false;
        const check = (d: Record<string, unknown>) =>
          typeof d["@type"] === "string" && d["@type"].includes("Product");
        if (Array.isArray(data) && data.some(check)) return true;
        return check(data);
      } catch {
        return false;
      }
    });

    const ogTypeProduct =
      document
        .querySelector('meta[property="og:type"]')
        ?.getAttribute("content")
        ?.toLowerCase()
        .includes("product") || false;

    const urlProductPattern =
      /\/(product|item|p\/|shop\/|store\/product|collections\/[\w-]+\/products|products\/)[\w-]/i.test(
        location.href,
      ) || /[?&]variant=/i.test(location.href);

    const pricePattern = /\$[\d,]+(\.\d{2})?|\d+\s*(usd|eur|gbp|aud|jpy|cad)/i;
    const hasPriceInPage = pricePattern.test(document.body.textContent || "");

    const hasPriceElement = [
      ".price",
      ".product-price",
      "[data-price]",
      ".money",
      ".price__sale",
      ".product__price",
      '[class*="price"]',
    ].some((sel) => {
      try {
        const el = document.querySelector(sel);
        return !!el && pricePattern.test(el.textContent || "");
      } catch {
        return false;
      }
    });

    const hasCartButton = !!document.querySelector(
      ".add-to-cart, .add-to-bag, .buy-button, .product-form__cart-submit, .atc-button, [data-add-to-cart], .shopify-payment-button, .sqs-add-to-cart-button, button[name='add'], [data-testid*='add-to-cart']",
    );

    const hasProductImageContainer = [
      ".product-image",
      ".product-main-image",
      ".pdp-image",
      ".ProductItem-gallery",
      ".woocommerce-product-gallery",
      ".product-gallery",
      ".single-product-gallery",
      ".product-main",
      ".product-form",
      ".product-details",
      '[class*="product-detail"]',
      '[class*="product-single"]',
      '[data-product]',
    ].some((sel) => {
      try {
        return document.querySelector(sel) !== null;
      } catch {
        return false;
      }
    });

    const singleLargeImage = (() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      const large = imgs.filter(
        (i) => i.naturalWidth > 400 && i.naturalHeight > 400,
      );
      return large.length >= 1 && large.length <= 3;
    })();

    const cardCount = document.querySelectorAll(
      ".product-card, .item-tile, .grid-item, .product-grid-item, .product-teaser, [class*='product-item'], [class*='product-tile']",
    ).length;

    const storefrontUrl =
      /\/(category|categories|collection|collections|search|deals|landing|home)[/?#]/i.test(
        location.href,
      ) && !/\/collections\/[\w-]+\/products\//i.test(location.href);

    const platformSignals = {
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

    return {
      jsonLdProduct,
      ogTypeProduct,
      urlProductPattern,
      hasPriceInPage,
      hasPriceElement,
      hasCartButton,
      hasProductImageContainer,
      singleLargeImage,
      cardCount,
      storefrontUrl,
      platformSignals,
    };
  });

  if (productSignals.jsonLdProduct) {
    score += 3;
    signals.push("json_ld_product");
  }
  if (productSignals.ogTypeProduct) {
    score += 2;
    signals.push("og_type_product");
  }
  if (productSignals.urlProductPattern) {
    score += 2;
    signals.push("url_product_pattern");
  }
  if (productSignals.hasProductImageContainer) {
    score += 2;
    signals.push("dom_product_container");
  }
  if (productSignals.hasCartButton) {
    score += 2;
    signals.push("cart_button");
  }
  if (productSignals.hasPriceElement) {
    score += 2;
    signals.push("price_element");
  } else if (productSignals.hasPriceInPage) {
    score += 1;
    signals.push("price_text");
  }
  if (productSignals.singleLargeImage) {
    score += 1;
    signals.push("single_large_image");
  }

  if (productSignals.cardCount > 15) {
    score -= 3;
    signals.push(`heavy_multi_item_grid_${productSignals.cardCount}`);
  } else if (productSignals.cardCount > 8) {
    score -= 2;
    signals.push(`multi_item_grid_${productSignals.cardCount}`);
  }

  if (productSignals.storefrontUrl) {
    score -= 2;
    signals.push("storefront_url");
  }

  if (Object.values(productSignals.platformSignals).some(Boolean)) {
    score = Math.max(score, 5);
    signals.push("platform_override");
  }

  const confidence: DetectionSignals["confidence"] =
    score >= 5 ? "high" : score >= 3 ? "medium" : "low";
  const strongSignals =
    Number(productSignals.jsonLdProduct) +
    Number(productSignals.ogTypeProduct) +
    Number(productSignals.urlProductPattern) +
    Number(productSignals.hasCartButton) +
    Number(productSignals.hasProductImageContainer);

  const isStorefront =
    productSignals.storefrontUrl &&
    strongSignals === 0 &&
    productSignals.cardCount >= 4;

  const forceInset = score >= 3 || strongSignals >= 2;

  return { forceInset, isStorefront, confidence, signals };
}
