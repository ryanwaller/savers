// Shared helper for fetching a public URL and extracting both OG metadata
// and a usable chunk of visible body text. Used by /api/metadata (which
// returns just metadata) and /api/suggest-tags (which feeds body_text into
// Claude so the model can pick up things that don't show up in OG tags —
// designer location, client list, content tone, etc).

import * as cheerio from "cheerio";

export type PageContent = {
  title: string | null;
  description: string | null;
  og_image: string | null;
  favicon: string;
  body_text: string;
};

const FETCH_TIMEOUT_MS = 8000;
const BODY_TEXT_MAX_CHARS = 4000;

// Note: we deliberately do NOT strip <header> or <footer> here. Designer
// portfolios overwhelmingly put location ("Based in Lagos", "📍 Brooklyn")
// and contact info in the footer or header — exactly the specific facts we
// want the tag suggester to surface.
const STRIP_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "svg",
  "form",
];

// Some sections of a portfolio/site tend to carry more signal than the rest
// of the page (about/bio/footer-with-location/contact). When we have access
// to them we hoist their text up so it's not the first thing dropped when
// we cap body_text length.
const PRIORITY_SELECTORS = [
  // Explicit about/bio/contact regions are the highest-signal source for
  // location, discipline, and named studios on portfolio sites.
  '[id*="about" i]',
  '[class*="about" i]',
  '[id*="bio" i]',
  '[class*="bio" i]',
  '[id*="contact" i]',
  '[class*="contact" i]',
  '[id*="info" i]',
  '[class*="info" i]',
  // Footers/headers commonly carry "Based in <city>" and contact lines.
  "footer",
  "header",
  "address",
  '[class*="hero" i]',
  "main",
  "article",
];

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// Instagram blocks unauthenticated scrapers on the main URL, but its
// public `/embed/` endpoint returns og:title/og:description for public
// posts. Rewrite the fetch URL transparently when it looks like one of
// the post-style Instagram URLs.
function rewriteFetchUrl(originalUrl: string): string {
  try {
    const u = new URL(originalUrl);
    if (
      (u.hostname === "instagram.com" || u.hostname === "www.instagram.com") &&
      /^\/(p|reel|tv)\/[^\/]+\/?$/.test(u.pathname) &&
      !u.pathname.endsWith("/embed/") &&
      !u.pathname.endsWith("/embed")
    ) {
      const trailing = u.pathname.endsWith("/") ? "" : "/";
      return `${u.origin}${u.pathname}${trailing}embed/`;
    }
  } catch {
    // ignore
  }
  return originalUrl;
}

export async function fetchPageContent(url: string): Promise<PageContent | null> {
  const fetchUrl = rewriteFetchUrl(url);

  let res: Response;
  try {
    res = await fetch(fetchUrl, {
      headers: {
        // Use a browser-ish UA so social sites that gate scrapers don't
        // immediately bounce us. Instagram /embed/ in particular returns
        // a thin "you must enable JS" page when the UA looks like a bot.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  let html: string;
  try {
    html = await res.text();
  } catch {
    return null;
  }

  const $ = cheerio.load(html);

  const get = (selectors: string[]) => {
    for (const s of selectors) {
      const val = $(s).attr("content") || $(s).text();
      if (val?.trim()) return val.trim();
    }
    return null;
  };

  const title = get([
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
    "title",
  ]);

  const description = get([
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]',
  ]);

  const og_image = get([
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
  ]);

  const resolvedImage = og_image
    ? og_image.startsWith("http")
      ? og_image
      : new URL(og_image, url).href
    : null;

  const origin = new URL(url).origin;
  const favicon = `https://www.google.com/s2/favicons?domain=${origin}&sz=32`;

  // Strip noisy nodes before we read body text.
  for (const sel of STRIP_SELECTORS) {
    $(sel).remove();
  }

  const seen = new Set<string>();
  const chunks: string[] = [];

  const collect = (text: string) => {
    const cleaned = collapseWhitespace(text);
    if (!cleaned || cleaned.length < 4) return;
    if (seen.has(cleaned)) return;
    seen.add(cleaned);
    chunks.push(cleaned);
  };

  // Priority-section text first, then everything else from the body.
  for (const sel of PRIORITY_SELECTORS) {
    $(sel)
      .slice(0, 3)
      .each((_, el) => collect($(el).text()));
  }
  collect($("body").text());

  const body_text = chunks.join("\n").slice(0, BODY_TEXT_MAX_CHARS);

  return {
    title: title?.slice(0, 200) ?? null,
    description: description?.slice(0, 500) ?? null,
    og_image: resolvedImage,
    favicon,
    body_text,
  };
}
