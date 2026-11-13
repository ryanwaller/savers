import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function getAllowedOrigins(): string[] {
  const origins: string[] = [];

  // Local development
  origins.push("http://localhost:3000", "http://127.0.0.1:3000");

  // Production URL
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) origins.push(siteUrl);

  return origins;
}

function isOriginAllowed(origin: string | null): string | null {
  if (!origin) return null;

  // Allow all chrome-extension origins (the extension ID changes on each
  // unpacked load, so we can't pin a specific one).
  if (origin.startsWith("chrome-extension://")) return origin;

  const allowed = getAllowedOrigins();
  if (allowed.includes(origin)) return origin;

  return null;
}

async function refreshRebuildSession(req: NextRequest, rewriteUrl?: URL) {
  const makeResponse = () => rewriteUrl
    ? NextResponse.rewrite(rewriteUrl, { request: req })
    : NextResponse.next({ request: req });
  let response = makeResponse();
  if (!req.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"))) return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const updatedCookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          req.cookies.set(cookie.name, cookie.value);
          const options = process.env.NODE_ENV === "production"
            ? { ...cookie.options, sameSite: "none" as const, secure: true }
            : cookie.options;
          updatedCookies.push({ name: cookie.name, value: cookie.value, options });
        }
        response = makeResponse();
        for (const cookie of updatedCookies) response.cookies.set(cookie.name, cookie.value, cookie.options);
      },
    },
  });
  try {
    await supabase.auth.getUser();
  } catch {
    // Let the page show its normal sign-in state if Auth is temporarily unavailable.
  }
  return response;
}

export async function proxy(req: NextRequest) {
  if (process.env.SAVERS_REBUILD_READ_ONLY === "1" && req.nextUrl.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method) && !(req.nextUrl.pathname === "/api/favorites" && req.method === "PATCH") && !(req.nextUrl.pathname === "/api/feeds" && req.method === "POST") && !(req.nextUrl.pathname === "/api/rebuild/capture" && req.method === "POST")) {
    return NextResponse.json({ error: "This connected preview is read-only. Use current Savers to make changes." }, { status: 403 });
  }
  if ((process.env.SAVERS_REBUILD_STAGING === "1" || process.env.SAVERS_REBUILD_LIVE === "1") && req.nextUrl.pathname === "/") {
    const rebuildUrl = req.nextUrl.clone();
    rebuildUrl.pathname = "/rebuild";
    return refreshRebuildSession(req, rebuildUrl);
  }
  if ((process.env.SAVERS_REBUILD_STAGING === "1" || process.env.SAVERS_REBUILD_LIVE === "1") && req.nextUrl.pathname === "/rebuild") {
    return refreshRebuildSession(req);
  }
  if (process.env.SAVERS_REBUILD_PREVIEW === "1") {
    if (req.nextUrl.pathname === "/") {
      const previewUrl = req.nextUrl.clone();
      previewUrl.pathname = "/rebuild";
      return NextResponse.rewrite(previewUrl);
    }
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return new NextResponse(null, { status: 404 });
    }
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
    const origin = isOriginAllowed(req.headers.get("origin"));

    // No matching origin — don't set CORS headers. The browser will block
    // cross-origin reads, which is the desired behavior for unknown origins.
    if (!origin) {
      // For OPTIONS preflight requests from disallowed origins, respond with
      // 204 (no CORS headers) so the browser blocks the actual request.
      if (req.method === "OPTIONS") {
        return new NextResponse(null, { status: 204 });
      }
      return NextResponse.next();
    }

    if (req.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Methods":
            "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const response = NextResponse.next();
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
