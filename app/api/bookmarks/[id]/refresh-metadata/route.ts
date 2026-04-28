import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { isPublicUrl } from "@/lib/api";
import { fetchMetadata } from "@/lib/fetch-metadata";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const msg = "message" in error ? (error as { message?: unknown }).message : null;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "Failed to refresh metadata";
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireUser();
    const { id } = await params;
    const supabaseAdmin = getSupabaseAdmin();

    const { data: bookmark, error: lookupError } = await supabaseAdmin
      .from("bookmarks")
      .select("id, url")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      console.error(`refresh-metadata lookup failed ${getErrorMessage(lookupError)}`);
      return NextResponse.json({ error: getErrorMessage(lookupError) }, { status: 500 });
    }

    if (!bookmark) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }

    if (!isPublicUrl(bookmark.url)) {
      return NextResponse.json(
        { error: "Cannot refresh metadata for this URL" },
        { status: 400 }
      );
    }

    const result = await fetchMetadata(bookmark.url);

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(`refresh-metadata failed ${getErrorMessage(err)}`);
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}
