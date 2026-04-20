import { NextRequest } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { fetchBestPreviewAsset, normalizeRemotePreviewUrl } from "@/lib/preview-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return Response.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeRemotePreviewUrl(rawUrl);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid url" },
      { status: 400 }
    );
  }

  const force = request.nextUrl.searchParams.get("force") === "true";
  const cacheBust =
    request.nextUrl.searchParams.get("cb") ?? request.nextUrl.searchParams.get("pv");

  try {
    const asset = await fetchBestPreviewAsset({
      url: normalizedUrl,
      force,
      cacheBust,
    });

    return new Response(asset.body, {
      headers: {
        "Content-Type": asset.contentType,
        "Cache-Control": force
          ? "no-store"
          : "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        "X-Savers-Preview-Provider": asset.provider,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview unavailable";
    return Response.json({ error: message }, { status: 502 });
  }
}
