import type { Page } from "puppeteer";
import { preparePageForCapture } from "./preparePageForCapture";

export interface CleanCaptureOptions {
  timeout?: number;
  quality?: number;
}

/**
 * Injected into the page BEFORE navigation so our scroll-blocking patches
 * are in place before any site scripts (Shopify themes, React SPAs, etc.)
 * get a chance to install their own smooth-scroll helpers or scroll-on-load
 * behaviour.
 */
const PRE_NAV_SCROLL_BLOCK = `
  (function () {
    var _scrollTo = window.scrollTo.bind(window);
    var _scroll = window.scroll.bind(window);

    function normalize(arg1, arg2) {
      if (typeof arg1 === "object" && arg1 !== null) {
        return { left: arg1.left || 0, top: arg1.top || 0, behavior: "instant" };
      }
      return { left: typeof arg1 === "number" ? arg1 : 0, top: typeof arg2 === "number" ? arg2 : 0, behavior: "instant" };
    }

    window.scrollTo = function (arg1, arg2) {
      return _scrollTo(normalize(arg1, arg2));
    };
    window.scroll = function (arg1, arg2) {
      return _scroll(normalize(arg1, arg2));
    };

    // Also patch scrollIntoView — Shopify themes and other frameworks
    // call this on elements to reveal them (e.g. variant pickers).
    var _scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (arg) {
      var opts = typeof arg === "object" ? arg : {};
      return _scrollIntoView.call(this, Object.assign({}, opts, { behavior: "instant" }));
    };

    // Disable scroll restoration so the browser never replays a saved
    // scroll position on back/forward navigation.
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  })();
`;

/**
 * Post-navigation verify loop. Despite the pre-nav patches, some sites
 * can still end up scrolled (late-loading embeds, iframes that bypass
 * our patches, direct scrollTop assignment on an element, etc.). We
 * scroll to top and poll scrollY until it reads 0, retrying up to 3 s.
 */
async function forceScrollToTop(page: Page): Promise<void> {
  const deadline = Date.now() + 3000;
  let attempt = 0;

  while (Date.now() < deadline) {
    await page.evaluate(() => {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    });

    await new Promise((r) => setTimeout(r, 80));

    const scrollY = await page.evaluate(() => window.scrollY);
    if (scrollY === 0) return;

    attempt++;
    const backoff = Math.min(100 * Math.pow(2, attempt - 1), 1000);
    await new Promise((r) => setTimeout(r, backoff));
  }
}

export async function captureCleanScreenshot(
  page: Page,
  url: string,
  options: CleanCaptureOptions = {},
): Promise<Buffer> {
  const quality = options.quality ?? 75;
  const timeout = options.timeout ?? 30000;

  // Inject scroll-blocking patches BEFORE any page script executes.
  await page.evaluateOnNewDocument(PRE_NAV_SCROLL_BLOCK);

  const { cleanup } = await preparePageForCapture(page, url, {
    timeout,
    settleMs: 2500,
  });

  try {
    await forceScrollToTop(page);

    const buffer = await page.screenshot({
      type: "jpeg",
      quality,
      fullPage: false,
      captureBeyondViewport: false,
    });

    return Buffer.from(buffer);
  } finally {
    await cleanup();
  }
}
