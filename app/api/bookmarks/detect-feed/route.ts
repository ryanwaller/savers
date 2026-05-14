import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";

function isFeedContentType(ct: string | null): boolean {
  if (!ct) return false;
  return /application\/(?:rss|atom)\+xml/.test(ct) || ct.includes("text/xml") || ct.includes("application/xml");
}

function extractFeedTitle(xml: string): string | null {
  // Try RSS <channel><title> first, then Atom <feed><title>
  const channelMatch = xml.match(/<channel[^>]*>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i);
  if (channelMatch) return channelMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();
  const feedMatch = xml.match(/<feed[^>]*>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i);
  if (feedMatch) return feedMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();
  return null;
}

function isFeedBodyStart(text: string): boolean {
  const t = text.trimStart();
  return t.startsWith("<?xml") || t.startsWith("<rss") || t.startsWith("<feed") || t.startsWith("<atom");
}

async function discoverFeedUrl(html: string, baseUrl: string): Promise<string | null> {
  const linkTags = html.match(/<link\b[^>]*\/?>/gi) || [];
  for (const tag of linkTags) {
    const hasAlternate = /\brel=["']alternate["']/i.test(tag);
    const isFeedType = /\btype=["']application\/(?:rss|atom)\+xml["']/i.test(tag);
    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    const hrefLooksFeed = hrefMatch?.[1] && /(?:feed|rss|atom)/i.test(hrefMatch[1]);

    if ((hasAlternate && isFeedType) || (hasAlternate && hrefLooksFeed)) {
      return new URL(hrefMatch![1], baseUrl).href;
    }
  }

  const commonPaths = ["/feed", "/atom", "/rss", "/feed.xml", "/atom.xml", "/rss.xml", "/index.xml"];
  for (const path of commonPaths) {
    try {
      const candidate = new URL(path, baseUrl).href;
      const probe = await fetch(candidate, {
        headers: { "User-Agent": "Savers/1.0 (FeedFetcher; +https://savers-production.up.railway.app)" },
        signal: AbortSignal.timeout(8000),
      });
      if (probe.ok) {
        const ct = probe.headers.get("content-type");
        const text = await probe.text();
        if (isFeedContentType(ct) || isFeedBodyStart(text)) {
          return candidate;
        }
      }
    } catch {
      // continue to next path
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  await requireUser();

  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing ?url parameter" }, { status: 400 });
  }

  const ua = "Savers/1.0 (FeedFetcher; +https://savers-production.up.railway.app)";

  try {
    // Step 1: HEAD to check Content-Type
    const headRes = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": ua },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });

    const ct = headRes.headers.get("content-type");

    // Step 2: If Content-Type is feed-like, fetch the feed for its title
    if (isFeedContentType(ct)) {
      const feedRes = await fetch(url, {
        headers: { "User-Agent": ua },
        signal: AbortSignal.timeout(10000),
      });
      const xml = await feedRes.text();
      const title = extractFeedTitle(xml);
      return NextResponse.json({ isFeed: true, feedUrl: url, title });
    }

    // Step 3: If HTML, try auto-discovery
    if (ct && ct.includes("text/html")) {
      const htmlRes = await fetch(url, {
        headers: { "User-Agent": ua },
        signal: AbortSignal.timeout(10000),
      });
      const html = await htmlRes.text();
      const discovered = await discoverFeedUrl(html, url);
      if (discovered) {
        // Fetch the discovered feed for its title
        try {
          const feedRes = await fetch(discovered, {
            headers: { "User-Agent": ua },
            signal: AbortSignal.timeout(10000),
          });
          const xml = await feedRes.text();
          const title = extractFeedTitle(xml);
          return NextResponse.json({ isFeed: true, feedUrl: discovered, title });
        } catch {
          return NextResponse.json({ isFeed: true, feedUrl: discovered, title: null });
        }
      }
    }

    // Step 4: If Content-Type wasn't clear, do a partial GET to peek at the body
    if (!ct || (!ct.includes("text/html") && !isFeedContentType(ct))) {
      try {
        const peekRes = await fetch(url, {
          headers: { "User-Agent": ua, Range: "bytes=0-2048" },
          signal: AbortSignal.timeout(10000),
        });
        const text = await peekRes.text();
        if (isFeedBodyStart(text)) {
          const title = extractFeedTitle(text);
          return NextResponse.json({ isFeed: true, feedUrl: url, title });
        }
        // If HTML, try auto-discovery
        if (text.trimStart().startsWith("<") && !text.trimStart().startsWith("<?")) {
          const discovered = await discoverFeedUrl(text, url);
          if (discovered) {
            return NextResponse.json({ isFeed: true, feedUrl: discovered, title: null });
          }
        }
      } catch {
        // peek failed, give up
      }
    }

    return NextResponse.json({ isFeed: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ isFeed: false, error: message });
  }
}
