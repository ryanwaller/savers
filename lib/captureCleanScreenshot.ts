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
    // Ensure page is at top before capturing — scripts may have scrolled
    // after preparePageForCapture finished (late-loading embeds, etc.).
    await page.evaluate(() => window.scrollTo(0, 0));
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
