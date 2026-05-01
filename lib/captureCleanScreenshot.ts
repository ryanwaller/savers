import type { Page } from "puppeteer";

// Domains known to serve cookie consent / GDPR / newsletter popup scripts.
// Only script and stylesheet requests to these are blocked.
const CMP_DOMAINS = [
  "cookielaw.org",
  "cookiebot.com",
  "privacymanager.io",
  "usercentrics.eu",
  "quantcast.com",
  "consentmanager.net",
  "trustarc.com",
  "onetrust.com",
  "cookie-cdn.com",
  "cookiepro.com",
  "fundingchoicesmessages.google.com",
  "app-sjqe.marketo.com",
  "js.hs-scripts.com", // HubSpot tracking (chat widgets)
  "js.hsforms.net",
];

// Selectors for common accept/close/dismiss buttons on overlays.
const DISMISS_SELECTORS = [
  "#onetrust-accept-btn-handler",
  "#onetrust-reject-all-handler",
  "[aria-label*='Accept all']",
  "[aria-label*='Accept All']",
  "[aria-label*='Accept cookies']",
  "[aria-label*='Allow all']",
  "[aria-label*='Allow All']",
  "[aria-label*='Close']",
  "[aria-label*='close']",
  "[aria-label*='Dismiss']",
  "button:has-text('Accept')",
  "button:has-text('Accept all')",
  "button:has-text('Accept All')",
  "button:has-text('Accept & Close')",
  "button:has-text('Allow all')",
  "button:has-text('Allow All')",
  "button:has-text('OK')",
  "button:has-text('Got it')",
  "button:has-text('I agree')",
  "button:has-text('Agree')",
  "button:has-text('Close')",
  ".cookie-accept",
  ".cookie-close",
  ".cc-btn",
  ".cc-dismiss",
  ".popup-close",
  ".modal-close",
  ".close-btn",
  "[data-testid='cookie-policy-dialog-accept-button']",
  "[data-testid='Close']",
];

// Selectors for elements to REMOVE from the DOM before capture.
// These match the same patterns as HIDE_CSS but remove entirely.
const REMOVAL_SELECTORS = [
  // Cookie / GDPR
  "#onetrust-banner-sdk",
  "#onetrust-consent-sdk",
  "#onetrust-pc-sdk",
  ".cookie-consent",
  ".cookie-banner",
  ".cookie-notice",
  ".cookie-popup",
  ".gdpr-banner",
  ".gdpr-consent",
  ".cc-banner",
  ".cc-window",
  ".consent-banner",
  // Newsletter / email capture
  ".newsletter-popup",
  ".newsletter-modal",
  ".signup-modal",
  ".email-capture",
  ".email-modal",
  ".subscribe-popup",
  ".subscribe-modal",
  ".mc-modal",
  ".mailchimp-popup",
  // Chat widgets
  "#intercom-container",
  "#intercom-frame",
  ".intercom-lightweight-app",
  ".chat-widget",
  ".livechat-widget",
  ".drift-frame-controller",
  // Paywall
  ".paywall-overlay",
  ".reg-wall",
  ".registration-wall",
];

// Fallback CSS for any remaining overlays the removal selectors miss.
const HIDE_CSS = `
  #onetrust-banner-sdk, #onetrust-consent-sdk, #onetrust-pc-sdk,
  #cookie-consent-banner,
  .cookie-consent, .cookie-banner, .cookie-notice, .cookie-popup,
  .gdpr-banner, .gdpr-consent, .cc-banner, .cc-window, .consent-banner,
  [class*="cookie-banner"], [class*="cookie-consent"], [class*="cookie-notice"],
  [class*="gdpr-"], [id*="cookie-consent"], [id*="cookie-banner"],
  [aria-label*="cookie" i], [aria-label*="Cookie"],

  .newsletter-popup, .newsletter-modal, .signup-modal,
  .email-capture, .email-modal, .subscribe-popup, .subscribe-modal,
  .mc-modal, .mailchimp-popup,
  [class*="newsletter-popup"], [class*="newsletter-modal"], [class*="email-popup"],

  #intercom-container, #intercom-frame, .intercom-lightweight-app,
  .chat-widget, .livechat-widget, .drift-frame-controller, .zopim,
  [id*="chat-widget"], [class*="chat-widget"], [class*="live-chat"],

  [data-testid="sheetDialog"], [data-testid="bottomSheet"],
  [role="dialog"][aria-label*="cookie" i],
  [role="dialog"][aria-label*="newsletter" i],
  [role="dialog"][aria-label*="subscribe" i],

  .paywall-overlay, .reg-wall, .registration-wall, [class*="paywall-overlay"]
  { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }

  body { overflow: auto !important; position: static !important; height: auto !important; }
  html { overflow: auto !important; }
`;

function isCmpDomain(hostname: string): boolean {
  return CMP_DOMAINS.some(
    (d) => hostname === d || hostname.endsWith("." + d),
  );
}

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
  let blockedCmp = 0;

  // --- Step 1: Request interception (block CMP scripts + fonts/media) ---
  await page.setRequestInterception(true);

  const requestHandler = (req: any) => {
    const type = req.resourceType();
    if (["font", "media", "websocket"].includes(type)) {
      void req.abort();
      return;
    }
    if (type === "script" || type === "stylesheet") {
      try {
        const hostname = new URL(req.url()).hostname;
        if (isCmpDomain(hostname)) {
          blockedCmp++;
          void req.abort();
          return;
        }
      } catch {
        // malformed URL — let it through
      }
    }
    void req.continue();
  };

  page.on("request", requestHandler);

  try {
    // --- Step 2: Navigate ---
    // Use domcontentloaded + a fixed settle wait instead of networkidle2.
    // networkidle2 can hang for minutes on sites with persistent ad/tracking
    // connections (long-poll, WebSocket, etc.).
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: options.timeout ?? 30000,
    });

    // Wait for async content: images, lazy-loaded sections, and popup rendering
    await new Promise((r) => setTimeout(r, 2500));

    // --- Step 3: Auto-dismiss ---
    try {
      await page.evaluate((selectors: string[]) => {
        for (const sel of selectors) {
          try {
            const el = document.querySelector(sel) as HTMLElement | null;
            if (el) {
              el.click();
            }
          } catch {
            // individual selector failure — skip
          }
        }
      }, DISMISS_SELECTORS);
    } catch {
      // page.evaluate failure — non-fatal
    }

    // Wait for dismissed overlays to disappear (poll up to 1.5s)
    try {
      const deadline = Date.now() + 1500;
      while (Date.now() < deadline) {
        const gone = await page.evaluate(() => {
          const overlay = document.querySelector(
            "#onetrust-banner-sdk, #onetrust-consent-sdk, .cookie-consent, .cookie-banner, .cookie-notice, .newsletter-popup, .newsletter-modal, .signup-modal",
          );
          return overlay === null || (overlay as HTMLElement).offsetParent === null;
        }).catch(() => true);
        if (gone) break;
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch {
      // overlay still present — CSS will handle it next
    }

    // --- Step 4: Aggressive DOM removal ---
    let removed = 0;
    try {
      removed = await page.evaluate((selectors: string[]) => {
        let count = 0;
        for (const sel of selectors) {
          try {
            for (const el of document.querySelectorAll(sel)) {
              el.remove();
              count++;
            }
          } catch {
            // individual selector failure — skip
          }
        }
        // Also nuke high-z-index fixed elements that look like popups
        const suspects = document.querySelectorAll(
          '[class*="popup"], [class*="modal"], [class*="overlay"], [class*="banner"], [class*="lightbox"]',
        );
        for (const el of suspects) {
          const style = getComputedStyle(el);
          if (
            (style.position === "fixed" || style.position === "absolute") &&
            parseInt(style.zIndex) > 1000
          ) {
            el.remove();
            count++;
          }
        }
        // Force unlock scroll
        document.body.style.overflow = "auto";
        document.body.style.position = "static";
        document.documentElement.style.overflow = "auto";
        return count;
      }, REMOVAL_SELECTORS);
    } catch {
      // DOM removal failure — continue
    }
    if (removed > 0) {
      console.log(`[captureCleanScreenshot] Removed ${removed} overlay element(s) from ${url}`);
    }

    // --- Step 5: CSS overlay suppression (fallback) ---
    try {
      await page.addStyleTag({ content: HIDE_CSS });
    } catch {
      // CSS injection failure — continue with capture anyway
    }

    // --- Step 6: Stabilize ---
    await new Promise((r) => setTimeout(r, 300));

    // --- Step 6: Capture ---
    const buffer = await page.screenshot({
      type: "jpeg",
      quality,
      fullPage: false,
      captureBeyondViewport: false,
    });

    if (blockedCmp > 0) {
      console.log(`[captureCleanScreenshot] Blocked ${blockedCmp} CMP request(s) for ${url}`);
    }

    return Buffer.from(buffer);
  } finally {
    // Clean up interception handler
    page.off("request", requestHandler);
    try {
      await page.setRequestInterception(false);
    } catch {
      // best-effort
    }
  }
}
