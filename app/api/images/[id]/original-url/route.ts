import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * GET /api/images/[id]/original-url
 *
 * Returns a short-lived signed URL for the image's original file (the
 * full-resolution version stored in the private image-originals bucket).
 * The slideshow's "Download Original" button hits this endpoint and then
 * follows the returned URL to trigger a browser download.
 *
 * Signed URLs expire after 5 minutes — long enough for the user to click
 * download, short enough that the link can't be casually reshared.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser();
    const { id } = await params;

    const supabaseAdmin = getSupabaseAdmin();
    const { data: row, error: lookupErr } = await supabaseAdmin
      .schema("savers")
      .from("images")
      .select("id, original_path, original_filename")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupErr) {
      return NextResponse.json({ error: lookupErr.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("image-originals")
      .createSignedUrl(row.original_path, 300, {
        download: row.original_filename || true,
      });

    if (signErr || !signed?.signedUrl) {
      return NextResponse.json(
        { error: signErr?.message || "Failed to sign URL" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: signed.signedUrl });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to sign URL" },
      { status: 500 },
    );
  }
}
