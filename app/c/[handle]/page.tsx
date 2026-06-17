import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { storedPreviewUrl } from "@/lib/api";
import CollectionIcon from "@/app/components/CollectionIcon";

type SharedCollection = {
  id: string;
  name: string;
  icon: string | null;
  public_id: string | null;
  public_slug: string | null;
  public_description: string | null;
  parent_id: string | null;
};

type ChildCollection = {
  id: string;
  name: string;
  icon: string | null;
  public_id: string | null;
  public_slug: string | null;
  public_description: string | null;
};

type Bookmark = {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  og_image: string | null;
  favicon: string | null;
  tags: string[] | null;
  pinned: boolean;
  preview_path: string | null;
  preview_version: number | null;
};

type ImageItem = {
  id: string;
  title: string | null;
  description: string | null;
  preview_path: string | null;
  width: number | null;
  height: number | null;
  source_url: string | null;
  created_at: string;
};

type LinkCollectionData = {
  kind: "links";
  collection: SharedCollection;
  bookmarks: Bookmark[];
  children: ChildCollection[];
};

type ImageCollectionData = {
  kind: "images";
  collection: SharedCollection;
  images: ImageItem[];
  children: ChildCollection[];
};

type PublicCollectionData = LinkCollectionData | ImageCollectionData;

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

async function findPublicLinkCollection(handle: string): Promise<SharedCollection | null> {
  const admin = getSupabaseAdmin();
  const { data: bySlug } = await admin
    .from("collections")
    .select("id, name, icon, public_id, public_slug, public_description, parent_id")
    .eq("public_slug", handle)
    .eq("is_public", true)
    .maybeSingle<SharedCollection>();

  if (bySlug) return bySlug;

  const { data: byId } = await admin
    .from("collections")
    .select("id, name, icon, public_id, public_slug, public_description, parent_id")
    .eq("public_id", handle)
    .eq("is_public", true)
    .maybeSingle<SharedCollection>();

  return byId ?? null;
}

async function findPublicImageCollection(handle: string): Promise<SharedCollection | null> {
  const admin = getSupabaseAdmin();
  const { data: bySlug } = await admin
    .schema("savers")
    .from("image_collections")
    .select("id, name, icon, public_id, public_slug, public_description, parent_id")
    .eq("public_slug", handle)
    .eq("is_public", true)
    .maybeSingle<SharedCollection>();

  if (bySlug) return bySlug;

  const { data: byId } = await admin
    .schema("savers")
    .from("image_collections")
    .select("id, name, icon, public_id, public_slug, public_description, parent_id")
    .eq("public_id", handle)
    .eq("is_public", true)
    .maybeSingle<SharedCollection>();

  return byId ?? null;
}

async function loadPublicCollection(handle: string): Promise<PublicCollectionData | null> {
  if (!HANDLE_PATTERN.test(handle)) return null;
  const admin = getSupabaseAdmin();

  const linkCollection = await findPublicLinkCollection(handle);
  if (linkCollection) {
    const [{ data: bookmarks }, { data: children }] = await Promise.all([
      admin
        .from("bookmarks")
        .select(
          "id, url, title, description, og_image, favicon, tags, pinned, preview_path, preview_version"
        )
        .eq("collection_id", linkCollection.id)
        .order("pinned", { ascending: false })
        .order("position", { ascending: true })
        .order("created_at", { ascending: false })
        .returns<Bookmark[]>(),
      admin
        .from("collections")
        .select("id, name, icon, public_id, public_slug, public_description")
        .eq("parent_id", linkCollection.id)
        .eq("is_public", true)
        .order("position", { ascending: true })
        .returns<ChildCollection[]>(),
    ]);

    return {
      kind: "links",
      collection: linkCollection,
      bookmarks: bookmarks ?? [],
      children: children ?? [],
    };
  }

  const imageCollection = await findPublicImageCollection(handle);
  if (!imageCollection) return null;

  const [{ data: images }, { data: children }] = await Promise.all([
    admin
      .schema("savers")
      .from("images")
      .select("id, title, description, preview_path, width, height, source_url, created_at")
      .eq("collection_id", imageCollection.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })
      .returns<ImageItem[]>(),
    admin
      .schema("savers")
      .from("image_collections")
      .select("id, name, icon, public_id, public_slug, public_description")
      .eq("parent_id", imageCollection.id)
      .eq("is_public", true)
      .order("position", { ascending: true })
      .returns<ChildCollection[]>(),
  ]);

  return {
    kind: "images",
    collection: imageCollection,
    images: images ?? [],
    children: children ?? [],
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const data = await loadPublicCollection(handle);
  if (!data) return { title: "Savers" };

  const count =
    data.kind === "links" ? data.bookmarks.length : data.images.length;
  const noun = data.kind === "links" ? "bookmarks" : "images";
  const desc =
    data.collection.public_description ??
    `${count} ${noun} in ${data.collection.name}`;

  return {
    title: `${data.collection.name} · Savers`,
    description: desc,
    openGraph: {
      title: data.collection.name,
      description: desc,
    },
  };
}

export default async function PublicCollectionPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const data = await loadPublicCollection(handle);
  if (!data) notFound();

  const count = data.kind === "links" ? data.bookmarks.length : data.images.length;

  function publicHref(child: ChildCollection): string {
    return `/c/${child.public_slug ?? child.public_id}`;
  }

  return (
    <div className="public-shell">
      <header className="public-head">
        <div className="public-head-row">
          <span className="public-icon" aria-hidden>
            <CollectionIcon name={data.collection.icon} size={14} />
          </span>
          <h1 className="public-title">{data.collection.name}</h1>
          <span className="public-count">{count}</span>
        </div>
        {data.collection.public_description && (
          <p className="public-desc">{data.collection.public_description}</p>
        )}
      </header>

      {data.children.length > 0 && (
        <nav className="public-children" aria-label="Sub-collections">
          {data.children.map((child) => (
            <a key={child.id} href={publicHref(child)} className="public-child">
              <span className="public-child-icon" aria-hidden>
                <CollectionIcon name={child.icon} size={14} />
              </span>
              <span className="public-child-name">{child.name}</span>
            </a>
          ))}
        </nav>
      )}

      {data.kind === "links" ? (
        <main className="public-grid">
          {data.bookmarks.length === 0 ? (
            <div className="public-empty muted small">No bookmarks here yet.</div>
          ) : (
            data.bookmarks.map((bookmark) => (
              <PublicBookmarkCard key={bookmark.id} bookmark={bookmark} />
            ))
          )}
        </main>
      ) : (
        <main className="public-image-grid">
          {data.images.length === 0 ? (
            <div className="public-empty muted small">No images here yet.</div>
          ) : (
            data.images.map((image) => (
              <PublicImageCard key={image.id} image={image} />
            ))
          )}
        </main>
      )}

      <footer className="public-foot">
        <a className="public-cta" href={`/?savers_ref=public_${data.collection.public_id}`}>
          Save this collection
        </a>
      </footer>

      <style>{`
        :root {
          --public-bg: #fafaf9;
          --public-surface: #ffffff;
          --public-text: #111111;
          --public-muted: #6b6b6b;
          --public-border: #ececea;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --public-bg: #0e0e0e;
            --public-surface: #161616;
            --public-text: #ececec;
            --public-muted: #8a8a8a;
            --public-border: #232323;
          }
        }
        html, body {
          height: auto !important;
          overflow: auto !important;
          background: var(--public-bg);
          color: var(--public-text);
        }
        .public-shell {
          max-width: 1100px;
          margin: 0 auto;
          padding: 56px 24px 96px;
          font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
          color: var(--public-text);
        }
        .public-head {
          margin-bottom: 28px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .public-head-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .public-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--public-muted);
        }
        .public-title {
          flex: 1 1 auto;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: -0.005em;
          margin: 0;
          line-height: 17px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .public-count {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 32px;
          height: 22px;
          padding: 0 10px;
          border-radius: 999px;
          background: var(--public-surface);
          border: 1px solid var(--public-border);
          color: var(--public-muted);
          font-size: 12px;
          font-feature-settings: "tnum" 1;
        }
        .public-desc {
          font-size: 12px;
          line-height: 17px;
          color: var(--public-muted);
          max-width: 56ch;
          margin: 0;
        }
        .public-children {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 32px;
        }
        .public-child {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border: 1px solid var(--public-border);
          border-radius: 999px;
          background: var(--public-surface);
          color: var(--public-text);
          text-decoration: none;
          font-size: 12px;
          transition: border-color 120ms ease, background 120ms ease;
        }
        .public-child:hover {
          border-color: var(--public-text);
        }
        .public-child-icon {
          display: inline-flex;
          align-items: center;
          color: var(--public-muted);
        }
        .public-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }
        .public-image-grid {
          columns: 280px;
          column-gap: 16px;
        }
        .public-empty {
          padding: 48px 24px;
          text-align: center;
        }
        .public-foot {
          margin-top: 64px;
          padding-top: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .public-cta {
          font-size: 12px;
          color: var(--public-text);
          text-decoration: none;
          padding: 8px 14px;
          border: 1px solid var(--public-border);
          border-radius: 999px;
          background: var(--public-surface);
        }
        .public-cta:hover {
          border-color: var(--public-text);
        }
        .small { font-size: 12px; }
        .muted { color: var(--public-muted); }
        @media (max-width: 680px) {
          .public-shell {
            padding: 36px 16px 72px;
          }
          .public-grid {
            grid-template-columns: minmax(0, 1fr);
          }
          .public-image-grid {
            columns: 1;
          }
        }
      `}</style>
    </div>
  );
}

function PublicBookmarkCard({ bookmark }: { bookmark: Bookmark }) {
  const previewSrc =
    storedPreviewUrl(bookmark.preview_path, { previewVersion: bookmark.preview_version }) ??
    bookmark.og_image ??
    null;
  const host = (() => {
    try {
      return new URL(bookmark.url).hostname.replace(/^www\./, "");
    } catch {
      return bookmark.url;
    }
  })();

  return (
    <a
      className="public-card"
      href={bookmark.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className="public-card-thumb">
        {previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewSrc} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="public-card-thumb-fallback">{host}</span>
        )}
      </div>
      <div className="public-card-body">
        <div className="public-card-title">{bookmark.title || host}</div>
        <div className="public-card-host muted small">
          {bookmark.favicon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="public-card-favicon"
              src={bookmark.favicon}
              alt=""
              referrerPolicy="no-referrer"
            />
          )}
          <span>{host}</span>
        </div>
        {bookmark.description && (
          <p className="public-card-desc small muted">{bookmark.description}</p>
        )}
      </div>
      <style>{`
        .public-card {
          display: flex;
          flex-direction: column;
          gap: 0;
          background: var(--public-surface);
          border: 1px solid var(--public-border);
          border-radius: 10px;
          overflow: hidden;
          color: inherit;
          text-decoration: none;
          transition: border-color 120ms ease, transform 120ms ease;
        }
        .public-card:hover {
          border-color: var(--public-text);
        }
        .public-card-thumb {
          aspect-ratio: 16 / 10;
          background: var(--public-bg);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .public-card-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .public-card-thumb-fallback {
          font-size: 12px;
          color: var(--public-muted);
        }
        .public-card-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 12px 14px 14px;
        }
        .public-card-title {
          font-size: 12px;
          font-weight: 600;
          line-height: 17px;
          letter-spacing: -0.005em;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .public-card-host {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .public-card-favicon {
          width: 12px;
          height: 12px;
          border-radius: 2px;
        }
        .public-card-desc {
          line-height: 17px;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </a>
  );
}

function PublicImageCard({
  image,
}: {
  image: ImageItem;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") || "";
  const previewSrc =
    image.preview_path
      ? `${supabaseUrl}/storage/v1/object/public/image-previews/${image.preview_path}`
      : null;
  const href = image.source_url || previewSrc || "#";

  return (
    <a
      className="public-image-card"
      href={href}
      target={href === "#" ? undefined : "_blank"}
      rel={href === "#" ? undefined : "noopener noreferrer"}
    >
      <div className="public-image-thumb">
        {previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewSrc} alt={image.title || ""} loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <div className="public-image-fallback" />
        )}
      </div>
      {(image.title || image.description) && (
        <div className="public-image-meta">
          {image.title && <div className="public-image-title">{image.title}</div>}
          {image.description && <p className="public-image-desc small muted">{image.description}</p>}
        </div>
      )}
      <style>{`
        .public-image-card {
          display: inline-flex;
          flex-direction: column;
          width: 100%;
          margin: 0 0 16px;
          break-inside: avoid;
          background: var(--public-surface);
          border: 1px solid var(--public-border);
          border-radius: 12px;
          overflow: hidden;
          color: inherit;
          text-decoration: none;
          transition: border-color 120ms ease;
        }
        .public-image-card:hover {
          border-color: var(--public-text);
        }
        .public-image-thumb {
          width: 100%;
          background: var(--public-bg);
        }
        .public-image-thumb img,
        .public-image-fallback {
          display: block;
          width: 100%;
          height: auto;
          min-height: 180px;
          object-fit: cover;
        }
        .public-image-fallback {
          background: linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.08));
        }
        .public-image-meta {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 12px 14px 14px;
        }
        .public-image-title {
          font-size: 12px;
          font-weight: 600;
          line-height: 17px;
          letter-spacing: -0.005em;
        }
        .public-image-desc {
          line-height: 17px;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </a>
  );
}
