import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const msg = "message" in error ? (error as { message?: unknown }).message : null;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "Failed to move bookmarks";
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser();
    const { ids, collectionId } = await req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Missing ids" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { error } = await supabaseAdmin
      .from("bookmarks")
      .update({ collection_id: collectionId ?? null })
      .in("id", ids)
      .eq("user_id", user.id);

    if (error) {
      console.error(`[bulk-move] ${getErrorMessage(error)}`);
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ moved: ids.length });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(`[bulk-move] ${getErrorMessage(err)}`);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
