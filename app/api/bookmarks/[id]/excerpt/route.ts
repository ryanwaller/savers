import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const msg = "message" in error ? (error as { message?: unknown }).message : null;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "Failed to update excerpt";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser();
    const { id } = await params;
    const { text } = await req.json();

    if (typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Invalid excerpt text" },
        { status: 400 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("bookmarks")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      console.error(`excerpt lookup failed ${getErrorMessage(lookupError)}`);
      return NextResponse.json(
        { error: getErrorMessage(lookupError) },
        { status: 500 },
      );
    }

    if (!existing) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("bookmarks")
      .update({
        excerpt_text: text.trim(),
        excerpt_source: "user_edited",
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) {
      console.error(`excerpt update failed ${getErrorMessage(updateError)}`);
      return NextResponse.json(
        { error: getErrorMessage(updateError) },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(`excerpt PATCH failed ${getErrorMessage(err)}`);
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser();
    const { id } = await params;

    const supabaseAdmin = getSupabaseAdmin();

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("bookmarks")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      console.error(`excerpt lookup failed ${getErrorMessage(lookupError)}`);
      return NextResponse.json(
        { error: getErrorMessage(lookupError) },
        { status: 500 },
      );
    }

    if (!existing) {
      return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("bookmarks")
      .update({ excerpt_text: null, excerpt_source: null })
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) {
      console.error(`excerpt delete failed ${getErrorMessage(updateError)}`);
      return NextResponse.json(
        { error: getErrorMessage(updateError) },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(`excerpt DELETE failed ${getErrorMessage(err)}`);
    return NextResponse.json(
      { error: getErrorMessage(err) },
      { status: 500 },
    );
  }
}
