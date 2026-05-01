/**
 * Smoke test: captureCleanScreenshot against popup-heavy sites.
 * Run: npx tsx scripts/smoke-test-capture.ts
 */
import puppeteer from "puppeteer";
import { captureCleanScreenshot } from "@/lib/captureCleanScreenshot";
import { PUPPETEER_LAUNCH_OPTIONS } from "@/lib/puppeteer-capture";

const USER_AGENT =
  "Mozilla/5.0 (compatible; Savers/1.0; +https://savers-production.up.railway.app)";

const TEST_URLS = [
  { name: "nytimes.com (OneTrust CMP)", url: "https://www.nytimes.com" },
  { name: "theguardian.com (cookie wall)", url: "https://www.theguardian.com" },
  { name: "techcrunch.com (GDPR popup)", url: "https://techcrunch.com" },
];

async function main() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch(PUPPETEER_LAUNCH_OPTIONS);

  let passed = 0;
  let failed = 0;

  for (const { name, url } of TEST_URLS) {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    console.log(`\nTesting: ${name} → ${url}`);
    const start = Date.now();

    try {
      const buffer = await captureCleanScreenshot(page, url, {
        quality: 80,
        timeout: 30000,
      });

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const kb = (buffer.length / 1024).toFixed(0);

      // Basic sanity checks
      const checks: string[] = [];
      if (buffer.length < 1024) checks.push("buffer too small (likely blank page)");
      if (buffer.length > 10 * 1024 * 1024) checks.push("buffer too large (>10MB)");
      if (Number.parseFloat(elapsed) > 15) checks.push(`slow capture (${elapsed}s > 15s)`);

      if (checks.length === 0) {
        console.log(`  ✓ ${kb}KB in ${elapsed}s`);
        passed++;
      } else {
        console.log(`  ⚠ ${kb}KB in ${elapsed}s — ${checks.join(", ")}`);
        failed++;
      }
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  ✗ Failed after ${elapsed}s: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    } finally {
      await page.close().catch(() => {});
    }
  }

  await browser.close();

  console.log(`\n${passed} passed, ${failed} failed of ${TEST_URLS.length}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
