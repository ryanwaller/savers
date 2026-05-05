import { readFileSync } from "fs";
import { resolve } from "path";
import type { Browser } from "puppeteer";
import { captureCleanScreenshot } from "./captureCleanScreenshot";
import { getSaversUserAgent, normalizeUrl } from "./site-url";

const USER_AGENT = getSaversUserAgent();

// Cache the embedded font as base64 so we only read it once.
let _fontBase64: string | null = null;
function getFontBase64(): string {
  if (_fontBase64) return _fontBase64;
  const fontPath = resolve(process.cwd(), "font", "TimesNRSevenMTStd-Bold.otf");
  _fontBase64 = readFileSync(fontPath).toString("base64");
  return _fontBase64;
}

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

    // Sizing math: viewport is 1280×800, card thumb is ~350px wide, so
    // px-in-template × (350/1280) ≈ px-on-card.
    //   • 52px font   → ~14px on card
    //   • 90px pad    → ~25px on card
    //   • 1.2 line-height (tightened leading per design)
    //   • Letter + word spacing pushed up to make the bold serif feel
    //     more editorial — the airier tracking gives it room to breathe.
    //   • max-width narrowed to 800px so the same text wraps deeper —
    //     ~9 lines for a 250-word excerpt instead of ~7.
    //   • Clamp at 9 lines: 9 × 52 × 1.2 = 562px of content, fits inside
    //     800 − 90×2 = 620px of available height with comfortable slack.
    //
    // CRITICAL: html and body must explicitly fill the viewport. Without
    // explicit `height: 100%` on both, the body collapses to its content
    // height, the flex centering happens in that tiny box at the top-left,
    // and the rest of the viewport is blank — text appears as a thumbnail
    // crammed into the corner of an otherwise empty 1280×800 screenshot.
    const fontBase64 = getFontBase64();
    const html = `<!DOCTYPE html>
<html style="margin:0;height:100%;">
<head><meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Times New Roman Bold';
    src: url(data:font/opentype;base64,${fontBase64}) format('opentype');
    font-weight: 700;
    font-style: normal;
  }
</style></head>
<body style="margin:0;width:100%;height:100%;background:#000;color:#fff;
  font-family:'Times New Roman Bold','Times New Roman',Times,serif;
  font-size:52px;font-weight:700;line-height:1.2;padding:80px;
  letter-spacing:0.03em;word-spacing:0.08em;
  display:flex;align-items:flex-start;
  box-sizing:border-box;">
  <div style="display:-webkit-box;-webkit-line-clamp:10;-webkit-box-orient:vertical;overflow:hidden;text-align:left;margin:0;">${escapeHtml(excerpt)}</div>
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
