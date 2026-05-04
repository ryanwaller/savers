import type { Browser } from "puppeteer";
import { captureCleanScreenshot } from "./captureCleanScreenshot";
import { getSaversUserAgent, normalizeUrl } from "./site-url";

const USER_AGENT = getSaversUserAgent();

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
    height: 800,
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
  } catch (firstError) {
    // If we upgraded HTTP→HTTPS and it failed, retry once with the original
    // HTTP URL before giving up. Some legacy sites don't have HTTPS.
    const upgraded = normalizeUrl(url);
    if (upgraded !== url) {
      console.warn(
        `HTTPS navigation failed for ${upgraded}, retrying with HTTP: ${(firstError as Error)?.message || String(firstError)}`,
      );
      await page.close().catch(() => {});

      const retryPage = await browser.newPage();
      try {
        await retryPage.setUserAgent(USER_AGENT);
        const buffer = await captureCleanScreenshot(retryPage, url, {
          quality: 92,
          timeout: 25000,
        });
        return {
          buffer,
          contentType: "image/jpeg",
        };
      } finally {
        await retryPage.close().catch(() => {});
      }
    }
    throw firstError;
  } finally {
    await page.close().catch(() => {});
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function captureTextExcerptImage(
  browser: Browser,
  excerpt: string,
): Promise<CaptureResult> {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

    // Sizing math: viewport is 1280×800 and the rendered card thumb is
    // ~350px wide, so px-in-template × (350/1280) ≈ px-on-card.
    //   • 66px font  → ~18px on card (comfortably readable serif)
    //   • 88px pad   → ~24px on card
    //   • 1.4 line-height keeps a serif at this size easy to scan
    //   • clamp at 6 lines: 6 × 66 × 1.4 = 555px of content, fits inside
    //     800 − 88×2 = 624px of available height with breathing room.
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;background:#000;color:#fff;
  font-family:"Times New Roman",Times,serif;
  font-size:66px;font-weight:700;line-height:1.4;padding:88px;
  display:flex;align-items:center;justify-content:center;
  min-height:0;box-sizing:border-box;">
  <div style="display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden;max-width:1100px;text-align:left;margin:0;">${escapeHtml(excerpt)}</div>
</body>
</html>`;

    await page.setContent(html, { waitUntil: "networkidle0" });

    const buffer = await page.screenshot({
      type: "jpeg",
      quality: 92,
      fullPage: false,
    });

    return {
      buffer: Buffer.from(buffer),
      contentType: "image/jpeg",
    };
  } finally {
    await page.close().catch(() => {});
  }
}
