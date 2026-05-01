import type { Browser } from "puppeteer";
import { captureCleanScreenshot } from "./captureCleanScreenshot";

const USER_AGENT =
  "Mozilla/5.0 (compatible; Savers/1.0; +https://savers-production.up.railway.app)";

export const PUPPETEER_LAUNCH_OPTIONS = {
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-sync",
    "--disable-translate",
    "--hide-scrollbars",
    "--mute-audio",
    "--no-first-run",
    "--no-zygote",
  ],
  defaultViewport: {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
  },
  timeout: 30000,
};

export interface CaptureResult {
  buffer: Buffer;
  contentType: string;
}

export async function captureScreenshot(
  browser: Browser,
  url: string,
): Promise<CaptureResult> {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(USER_AGENT);

    const buffer = await captureCleanScreenshot(page, url, {
      quality: 92,
      timeout: 25000,
    });

    return {
      buffer,
      contentType: "image/jpeg",
    };
  } finally {
    await page.close().catch(() => {});
  }
}
