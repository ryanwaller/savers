import type { Page } from "puppeteer";
import { preparePageForCapture } from "./preparePageForCapture";

export interface CleanCaptureOptions {
  timeout?: number;
  quality?: number;
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
    // Force instant scroll to top — behavior:"instant" defeats
    // scroll-behavior:smooth on the page, which would otherwise animate
    // the scroll and cause the screenshot to capture mid-transition.
    await page.evaluate(() =>
      window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
    );
    await new Promise((r) => setTimeout(r, 150));

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
