import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/auth-server";
import {
  processAndStoreImage,
  isAcceptedMime,
  HARD_CAP_MB,
  ImageUploadError,
  type UploadedImageRow,
} from "@/lib/image-upload-server";

// Image uploads can be large; bump the request body parser limits.
// Next 16 App Router uses Web `Request` under the hood — the limit comes
// from the runtime config below.
export const runtime = "nodejs";
export const maxDuration = 60;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Image upload failed";
}

/**
 * POST /api/images/upload
 *
 * Multipart body. Accepts one or more files in a "files" field (repeated
 * for multi-upload) plus an optional "collection_id" field.
 *
 * Returns { images: UploadedImageRow[], errors: { name: string; reason: string }[] }
 * so a partial-success multi-upload surfaces per-file failures without
 * 500-ing the whole request.
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser();

    const formData = await req.formData();
    const files = formData.getAll("files").filter((v): v is File => v instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const collectionIdRaw = formData.get("collection_id");
    const collectionId = typeof collectionIdRaw === "string" && collectionIdRaw.trim()
      ? collectionIdRaw.trim()
      : null;

    const successes: UploadedImageRow[] = [];
    const errors: Array<{ name: string; reason: string }> = [];

    for (const file of files) {
      try {
        if (!isAcceptedMime(file.type)) {
          errors.push({ name: file.name, reason: `Unsupported file type: ${file.type || "unknown"}` });
          continue;
        }

        if (file.size > HARD_CAP_MB * 1024 * 1024) {
          errors.push({ name: file.name, reason: "Too large" });
          continue;
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const row = await processAndStoreImage({
          userId: user.id,
          fileName: file.name || "upload",
          contentType: file.type || "application/octet-stream",
          body: buffer,
          collectionId,
        });
        successes.push(row);
      } catch (err) {
        if (err instanceof ImageUploadError) {
          errors.push({ name: file.name, reason: err.message });
        } else {
          console.error(`[images/upload] file ${file.name} failed: ${errorMessage(err)}`);
          errors.push({ name: file.name, reason: errorMessage(err) });
        }
      }
    }

    return NextResponse.json({ images: successes, errors });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(`[images/upload] request failed: ${errorMessage(err)}`);
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
