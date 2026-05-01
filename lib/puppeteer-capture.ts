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

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;background:#000;color:#fff;
  font-family:'Liberation Sans',Arial,Helvetica,sans-serif;
  font-size:52px;font-weight:600;line-height:1.25;padding:15px 90px;
  display:flex;align-items:center;
  min-height:100vh;box-sizing:border-box;">
  <div style="max-width:1100px;text-align:left;">${escapeHtml(excerpt)}</div>
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
