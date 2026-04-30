import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import CollectionIcon from "@/app/components/CollectionIcon";

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

type ChildCollection = {
  id: string;
  name: string;
  icon: string | null;
  public_id: string | null;
  public_slug: string | null;
  public_description: string | null;
};

type CollectionRow = {
  id: string;
  name: string;
  icon: string | null;
  public_id: string | null;
  public_slug: string | null;
  public_description: string | null;
  parent_id: string | null;
};

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

async function loadPublicCollection(handle: string) {
  if (!HANDLE_PATTERN.test(handle)) return null;
  const admin = getSupabaseAdmin();

  const { data: bySlug } = await admin
    .from("collections")
    .select(
      "id, name, icon, public_id, public_slug, public_description, parent_id"
    )
    .eq("public_slug", handle)
    .eq("is_public", true)
    .maybeSingle<CollectionRow>();

  let collection = bySlug;
  if (!collection) {
    const { data: byId } = await admin
      .from("collections")
      .select(
        "id, name, icon, public_id, public_slug, public_description, parent_id"
      )
      .eq("public_id", handle)
      .eq("is_public", true)
      .maybeSingle<CollectionRow>();
    collection = byId ?? null;
  }

  if (!collection) return null;

  const [{ data: bookmarks }, { data: children }] = await Promise.all([
    admin
      .from("bookmarks")
      .select(
        "id, url, title, description, og_image, favicon, tags, pinned, preview_path, preview_version"
      )
      .eq("collection_id", collection.id)
      .order("pinned", { ascending: false })
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })
      .returns<Bookmark[]>(),
    admin
      .from("collections")
      .select("id, name, icon, public_id, public_slug, public_description")
      .eq("parent_id", collection.id)
      .eq("is_public", true)
      .order("position", { ascending: true })
      .returns<ChildCollection[]>(),
  ]);

  return {
    collection,
    bookmarks: bookmarks ?? [],
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
  const desc =
    data.collection.public_description ??
    `${data.bookmarks.length} bookmarks in ${data.collection.name}`;
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

  const { collection, bookmarks, children } = data;
  const headersList = await headers();
  const host = headersList.get("host") ?? "savers.app";
  const proto = headersList.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  function publicHref(child: ChildCollection): string {
    return `/c/${child.public_slug ?? child.public_id}`;
  }

  return (
    <div className="public-shell">
      <header className="public-head">
        <div className="public-head-row">
          <span className="public-icon" aria-hidden>
            <CollectionIcon name={collection.icon} size={14} />
          </span>
          <h1 className="public-title">{collection.name}</h1>
          <span className="public-count">{bookmarks.length}</span>
        </div>
        {collection.public_description && (
          <p className="public-desc">{collection.public_description}</p>
        )}
      </header>

      {children.length > 0 && (
        <nav className="public-children" aria-label="Sub-collections">
          {children.map((child) => (
            <a key={child.id} href={publicHref(child)} className="public-child">
              <span className="public-child-icon" aria-hidden>
                <CollectionIcon name={child.icon} size={14} />
              </span>
              <span className="public-child-name">{child.name}</span>
            </a>
          ))}
        </nav>
      )}

      <main className="public-grid">
        {bookmarks.length === 0 ? (
          <div className="public-empty muted small">No bookmarks here yet.</div>
        ) : (
          bookmarks.map((b) => (
            <PublicCard key={b.id} bookmark={b} origin={origin} />
          ))
        )}
      </main>

      <footer className="public-foot">
        <a className="public-cta" href={`/?savers_ref=public_${collection.public_id}`}>
          Save this to your library →
        </a>
        <span className="public-attribution muted small">
          Saved in <a href="/" className="public-brand">Savers</a>
        </span>
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
        html, body { background: var(--public-bg); color: var(--public-text); }
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
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.005em;
          margin: 0;
          line-height: 1.2;
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
          font-size: 13px;
          line-height: 1.5;
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
          font-size: 13px;
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
        .public-empty {
          grid-column: 1 / -1;
          padding: 48px 24px;
          text-align: center;
        }
        .public-foot {
          margin-top: 64px;
          padding-top: 24px;
          border-top: 1px solid var(--public-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .public-cta {
          font-size: 14px;
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
        .public-attribution {
          font-size: 12px;
        }
        .public-brand {
          color: inherit;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .small { font-size: 12px; }
        .muted { color: var(--public-muted); }
      `}</style>
    </div>
  );
}

function PublicCard({
  bookmark,
  origin,
}: {
  bookmark: Bookmark;
  origin: string;
}) {
  // Use the same /api/preview proxy the authenticated grid uses, but
  // anonymous-friendly: we'll fall through to og_image / favicon if the
  // private proxy isn't hit. For v1 we just use og_image directly to
  // avoid any auth concerns.
  const previewSrc = bookmark.og_image ?? null;
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
          <img
            src={previewSrc}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
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
          font-size: 14px;
          font-weight: 600;
          line-height: 1.3;
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
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </a>
  );
}
