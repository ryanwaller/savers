import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { buildSaveUrl } from "@/lib/save-url";

function resolveSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return "https://savers-production.up.railway.app";
}

type Props = {
  params: Promise<{ token: string }>;
};

type SharedBookmark = {
  id: string;
  title: string | null;
  url: string;
  description: string | null;
  preview_path: string | null;
  custom_preview_path: string | null;
  og_image: string | null;
  favicon: string | null;
};

async function getSharedBookmark(token: string): Promise<SharedBookmark | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("bookmarks")
    .select(
      "id, title, url, description, preview_path, custom_preview_path, og_image, favicon",
    )
    .eq("share_token", token)
    .maybeSingle();

  if (error || !data) return null;
  return data as SharedBookmark;
}

function resolveImageUrl(bookmark: SharedBookmark): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const previewPath = bookmark.custom_preview_path || bookmark.preview_path;
  if (supabaseUrl && previewPath) {
    const encoded = previewPath
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/bookmark-previews/${encoded}`;
  }

  const params = new URLSearchParams({ url: bookmark.url });
  if (bookmark.og_image) params.set("og", bookmark.og_image);
  if (bookmark.favicon) params.set("favicon", bookmark.favicon);
  return `/api/preview?${params.toString()}`;
}

function safeResolveImageUrl(bookmark: SharedBookmark): string | null {
  try {
    return resolveImageUrl(bookmark);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const bookmark = await getSharedBookmark(token);
  if (!bookmark) {
    return { title: "Bookmark not found" };
  }

  const title = bookmark.title || bookmark.url;
  const description = bookmark.description || bookmark.url;
  const image = safeResolveImageUrl(bookmark);
  const siteUrl = resolveSiteUrl();

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${siteUrl}/s/${token}`,
      type: "website",
      ...(image ? { images: [{ url: image, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function SharedBookmarkPage({ params }: Props) {
  const { token } = await params;
  const bookmark = await getSharedBookmark(token);

  if (!bookmark) {
    notFound();
  }

  const title = bookmark.title || bookmark.url;
  const imageUrl = safeResolveImageUrl(bookmark);
  const siteUrl = resolveSiteUrl();
  let saveUrl: string;
  try {
    saveUrl = buildSaveUrl({ baseUrl: siteUrl, sourceUrl: bookmark.url });
  } catch {
    saveUrl = `${siteUrl}/save`;
  }

  return (
    <div className="s-page">
      <div className="s-card">
        {imageUrl && (
          <div className="s-image-wrap">
            <img src={imageUrl} alt={title} className="s-image" />
          </div>
        )}

        <div className="s-content">
          {bookmark.favicon && (
            <img
              src={bookmark.favicon}
              alt=""
              className="s-favicon"
              width={20}
              height={20}
            />
          )}

          <h1 className="s-title">{title}</h1>

          {bookmark.description && (
            <p className="s-desc">{bookmark.description}</p>
          )}

          <div className="s-actions">
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              className="s-visit-btn"
            >
              Visit website
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
            <a href={saveUrl} className="s-save-btn">
              Save to Savers
            </a>
          </div>
        </div>
      </div>

      <footer className="s-footer">
        <span>
          Shared via{" "}
          <a href={siteUrl} className="s-footer-link">
            Savers
          </a>
        </span>
      </footer>
    </div>
  );
}
