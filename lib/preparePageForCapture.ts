import type { Page } from "puppeteer";

// Domains known to serve cookie consent / GDPR / newsletter popup scripts.
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
  "js.hs-scripts.com",
  "js.hsforms.net",
];

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

const REMOVAL_SELECTORS = [
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
  ".newsletter-popup",
  ".newsletter-modal",
  ".signup-modal",
  ".email-capture",
  ".email-modal",
  ".subscribe-popup",
  ".subscribe-modal",
  ".mc-modal",
  ".mailchimp-popup",
  "#intercom-container",
  "#intercom-frame",
  ".intercom-lightweight-app",
  ".chat-widget",
  ".livechat-widget",
  ".drift-frame-controller",
  ".paywall-overlay",
  ".reg-wall",
  ".registration-wall",
];

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
  [class*="predictive-search"], [class*="search-suggestions"], [class*="search-suggestion"],
  [class*="search-drawer"], [class*="search-overlay"], [class*="search-panel"],
  [class*="drawer"][class*="search"], [class*="flyout"][class*="search"],
  [data-testid*="search"][role="dialog"],

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

export interface PreparePageOptions {
  timeout?: number;
  /** Milliseconds to wait after navigation for async content to settle. Default 2500. */
  settleMs?: number;
  /** Whether to set up request interception. Set false if already configured on this page. */
  setupInterception?: boolean;
  /** Whether to scroll to trigger lazy loading. Default true. */
  scrollForLazy?: boolean;
  /** Skip navigation — only run dismiss/DOM removal/CSS/scroll. Use after page.reload(). */
  skipNavigation?: boolean;
}

let interceptionSetup = new WeakMap<Page, boolean>();

/**
 * Shared page preparation: CMP blocking, navigation, popup dismissal,
 * DOM cleanup, and lazy-load triggering. Used by both the screenshot
 * capture path and the shopping product-image extraction path.
 *
 * Returns a cleanup function that removes request interception.
 * Safe to call multiple times on the same page (e.g. after reload for retries).
 */
export async function preparePageForCapture(
  page: Page,
  url: string,
  options: PreparePageOptions = {},
): Promise<{ cleanup: () => Promise<void> }> {
  const timeout = options.timeout ?? 30000;
  const settleMs = options.settleMs ?? 2500;
  const setupInterception = options.setupInterception ?? true;
  const scrollForLazy = options.scrollForLazy ?? true;
  const skipNavigation = options.skipNavigation ?? false;

  let blockedCmp = 0;

  // --- Step 1: Request interception ---
  if (setupInterception && !interceptionSetup.get(page)) {
    await page.setRequestInterception(true);
    interceptionSetup.set(page, true);

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

    // Store the handler reference for cleanup
    (page as any).__saversRequestHandler = requestHandler;
  }

  // --- Step 2: Navigate (skip if page already loaded, e.g. after reload for retry) ---
  if (!skipNavigation) {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout,
    });
  }

  await new Promise((r) => setTimeout(r, settleMs));

  try {
    await page.keyboard.press("Escape");
  } catch {
    // Some sites ignore Escape; continue.
  }

  // --- Step 3: Auto-dismiss popups ---
  try {
    await page.evaluate((selectors: string[]) => {
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (el) el.click();
        } catch {
          // individual selector failure — skip
        }
      }
    }, DISMISS_SELECTORS);
  } catch {
    // page.evaluate failure — non-fatal
  }

  // Wait for dismissed overlays to disappear
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
    // overlay still present — CSS will handle it
  }

  // --- Step 4: DOM removal ---
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
      // Nuke high-z-index fixed elements that look like popups
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
      document.body.style.overflow = "auto";
      document.body.style.position = "static";
      document.documentElement.style.overflow = "auto";

      // Some storefronts server-render search drawers / auth sheets directly
      // into the DOM. Remove containers that clearly match those states so
      // collection screenshots don't capture them as if they were page content.
      const textBlocks = Array.from(
        document.querySelectorAll("section, aside, dialog, div"),
      );
      for (const el of textBlocks) {
        const text = (el.textContent || "").trim().toLowerCase().replace(/\s+/g, " ");
        if (!text) continue;

        const isSearchSuggestionsPanel =
          text.includes("search suggestions") &&
          text.includes("recommended for you");
        const isWelcomeBackPanel =
          text.includes("welcome back") &&
          text.includes("sign up") &&
          text.includes("log in");

        if (isSearchSuggestionsPanel || isWelcomeBackPanel) {
          const target =
            el.closest("[role='dialog'], dialog, aside, section") ?? el;
          target.remove();
          count++;
        }
      }
      return count;
    }, REMOVAL_SELECTORS);
  } catch {
    // DOM removal failure — continue
  }
  if (removed > 0) {
    console.log(`[preparePage] Removed ${removed} overlay element(s) from ${url}`);
  }

  // --- Step 5: CSS overlay suppression ---
  try {
    await page.addStyleTag({ content: HIDE_CSS });
  } catch {
    // CSS injection failure — continue
  }

  try {
    await page.keyboard.press("Escape");
  } catch {
    // best-effort
  }

  // --- Step 6: Scroll for lazy loading ---
  if (scrollForLazy) {
    try {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise((r) => setTimeout(r, 500));
      try {
        await page.evaluate(() => {
          window.scrollTo(0, 0);
        });
      } catch {
        // scroll-back failure — non-fatal
      }
    } catch {
      // initial scroll failure — non-fatal
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  if (blockedCmp > 0) {
    console.log(`[preparePage] Blocked ${blockedCmp} CMP request(s) for ${url}`);
  }

  // --- Cleanup ---
  const cleanup = async () => {
    const handler = (page as any).__saversRequestHandler;
    if (handler) {
      page.off("request", handler);
      delete (page as any).__saversRequestHandler;
    }
    try {
      if (interceptionSetup.get(page)) {
        await page.setRequestInterception(false);
        interceptionSetup.delete(page);
      }
    } catch {
      // best-effort
    }
  };

  return { cleanup };
}
