import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

export function proxy(req: NextRequest) {
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
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
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
  matcher: "/api/:path*",
};
