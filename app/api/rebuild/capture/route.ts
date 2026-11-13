import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const imageFields = "id,title,description,notes,source_url,tags,collection_id,preview_path,processing_status,favorite,created_at";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  if (process.env.SAVERS_REBUILD_LIVE !== "1" || process.env.SAVERS_REBUILD_READ_ONLY !== "1") {
    return NextResponse.json({ error: "Capture upload is unavailable here." }, { status: 404 });
  }
  try {
    const { user } = await requireUser();
    const form = await req.formData();
    const captureId = form.get("capture_id");
    const file = form.get("file");
    if (typeof captureId !== "string" || !uuidPattern.test(captureId) || !(file instanceof File) || file.type !== "image/png" || file.size < 1 || file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "A PNG screenshot under 20 MB is required." }, { status: 400 });
    }
    const db = await createSupabaseServerClient();
    const existing = await db.from("images").select(imageFields).eq("id", captureId).eq("user_id", user.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return NextResponse.json({ image: existing.data });

    const bytes = Buffer.from(await file.arrayBuffer());
    let width: number;
    let height: number;
    let preview: Buffer;
    try {
      const input = sharp(bytes, { limitInputPixels: 100_000_000 });
      const metadata = await input.metadata();
      if (metadata.format !== "png" || !metadata.width || !metadata.height) throw new Error("Invalid PNG");
      width = metadata.width;
      height = metadata.height;
      preview = await sharp(bytes, { limitInputPixels: 100_000_000 }).resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    } catch {
      return NextResponse.json({ error: "Could not read this screenshot." }, { status: 400 });
    }

    const originalPath = `${user.id}/${captureId}.png`;
    const previewPath = `${user.id}/${captureId}.jpg`;
    const originalUpload = await db.storage.from("image-originals").upload(originalPath, bytes, { contentType: "image/png", upsert: false });
    if (originalUpload.error) return NextResponse.json({ error: "Could not store screenshot." }, { status: 502 });
    const previewUpload = await db.storage.from("image-previews").upload(previewPath, preview, { contentType: "image/jpeg", upsert: false });
    if (previewUpload.error) {
      await db.storage.from("image-originals").remove([originalPath]);
      return NextResponse.json({ error: "Could not store screenshot preview." }, { status: 502 });
    }

    const title = String(form.get("title") || "Screenshot").trim().slice(0, 120) || "Screenshot";
    const inserted = await db.from("images").insert({
      id: captureId,
      user_id: user.id,
      title,
      original_path: originalPath,
      preview_path: previewPath,
      original_filename: `${title}.png`,
      source_kind: "upload",
      file_kind: "image",
      mime_type: "image/png",
      original_size_bytes: bytes.length,
      preview_size_bytes: preview.length,
      width,
      height,
      processing_status: "ready",
    }).select(imageFields).single();
    if (inserted.error || !inserted.data) {
      await Promise.allSettled([
        db.storage.from("image-originals").remove([originalPath]),
        db.storage.from("image-previews").remove([previewPath]),
      ]);
      return NextResponse.json({ error: "Could not save screenshot to your library." }, { status: 502 });
    }
    return NextResponse.json({ image: inserted.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json({ error: "Could not save screenshot." }, { status: 500 });
  }
}
