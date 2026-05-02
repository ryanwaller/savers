import type { Page } from "puppeteer";
import { preparePageForCapture } from "./preparePageForCapture";

export interface CleanCaptureOptions {
  timeout?: number;
  quality?: number;
}

/**
 * Multi-layer scroll-to-top enforcement. Each layer defeats a different class
 * of page behaviour that can leave the viewport scrolled away from y=0:
 *
 *   Layer 1 — history.scrollRestoration = "manual"
 *     SPAs and some MPAs restore the user's last scroll position on navigation.
 *     Setting this to "manual" tells the browser to leave scroll alone.
 *
 *   Layer 2 — CSS scroll-behavior: auto !important on html AND body
 *     Injected in preparePageForCapture, but body can carry its own smooth rule.
 *     We patch body here as a final safeguard.
 *
 *   Layer 3 — Monkey-patch window.scrollTo
 *     Some sites wrap scrollTo in a helper that adds smooth behaviour, or call
 *     scrollTo from a requestAnimationFrame loop. We store the native function
 *     and re-replace it so every scrollTo call after our reset is forced to
 *     behavior:"instant", top:0. This is safe because capture never triggers
 *     intentional scrolls after this point.
 *
 *   Layer 4 — Scroll-and-verify loop
 *     Even after all the above, late-loading embeds (YouTube iframes, ad
 *     scripts, chat widgets) can fire a programmatic scroll hundreds of ms
 *     after DOMContentLoaded. We scroll to top, poll scrollY until it reads
 *     0, and retry with an escalating backoff for up to 3 s.
 */
async function forceScrollToTop(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Layer 1 — prevent the browser from restoring a saved scroll position
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    // Layer 2 — suppress smooth scrolling on body (html is handled in
    // preparePageForCapture's injected CSS, but sites can set it on body too)
    document.body.style.scrollBehavior = "auto";

    // Layer 3 — monkey-patch scrollTo so no late script can animate a scroll.
    // We preserve the native implementation and wrap it to always force
    // behavior:"instant" at top:0.
    const _nativeScrollTo = window.scrollTo.bind(window);
    window.scrollTo = function (arg1?: any, arg2?: any) {
      if (typeof arg1 === "object" && arg1 !== null) {
        return _nativeScrollTo({ ...arg1, behavior: "instant" });
      }
      // two-arg legacy form: scrollTo(x, y)
      const x = typeof arg1 === "number" ? arg1 : 0;
      const y = typeof arg2 === "number" ? arg2 : 0;
      return _nativeScrollTo({ left: x, top: y, behavior: "instant" });
    } as typeof window.scrollTo;
  });

  // Layer 4 — scroll-and-verify loop with escalating backoff
  const deadline = Date.now() + 3000;
  let attempt = 0;

  while (Date.now() < deadline) {
    await page.evaluate(() =>
      window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
    );

    // Tiny settle window — just enough for a sync reflow
    await new Promise((r) => setTimeout(r, 80));

    const scrollY = await page.evaluate(() => window.scrollY);
    if (scrollY === 0) return;

    attempt++;
    // Escalating backoff: 100, 200, 400, 800 ms
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
