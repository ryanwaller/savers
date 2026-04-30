-- Public collections: per-collection privacy toggle plus an unguessable
-- short id and an optional vanity slug. Public visibility is opt-in;
-- collections default to private.
--
--   is_public           — toggle. RLS bypass only applies when true.
--   public_id           — random unguessable handle. URL: /c/<public_id>
--                         Generated on first publish. Stable across
--                         republishes so old shared links keep working.
--   public_slug         — optional vanity slug. URL: /c/<slug>. Globally
--                         unique. Lowercase letters, digits, hyphens.
--   public_description  — short paragraph the owner can show on the
--                         public page (e.g. "Updated quarterly").

alter table if exists savers.collections
  add column if not exists is_public boolean not null default false,
  add column if not exists public_id text,
  add column if not exists public_slug text,
  add column if not exists public_description text;

create unique index if not exists collections_public_id_key
  on savers.collections (public_id)
  where public_id is not null;

create unique index if not exists collections_public_slug_key
  on savers.collections (public_slug)
  where public_slug is not null;

create index if not exists collections_is_public_idx
  on savers.collections (is_public)
  where is_public = true;

-- RLS: allow anonymous read access to public collections + their bookmarks.
-- We use service-role queries server-side rather than relying on RLS for
-- the public reads, so this is just a belt-and-braces select policy.
drop policy if exists collections_select_public on savers.collections;
create policy collections_select_public
  on savers.collections
  for select
  to anon, authenticated
  using (is_public = true);

drop policy if exists bookmarks_select_via_public_collection on savers.bookmarks;
create policy bookmarks_select_via_public_collection
  on savers.bookmarks
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from savers.collections c
      where c.id = bookmarks.collection_id
        and c.is_public = true
    )
  );
