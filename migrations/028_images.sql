-- Images feature: a parallel taxonomy to bookmarks/collections for image
-- assets (JPEG, PNG, GIF, WebP, HEIC, SVG, PDF, EPS).
--
-- Design notes (see decisions captured in 2026-06-17 conversation):
--   • Separate taxonomy from links. image_collections mirrors collections
--     so users can build their own folder tree under the Images section.
--   • Smart collections and feeds are deliberately link-only for now.
--   • Public collections work for image_collections too — same public_id /
--     public_slug shape, so /c/[handle] can serve either type.
--   • Files are stored in two Supabase Storage buckets:
--       image-originals  — private, full-resolution source files
--       image-previews   — public, 1600px-longest-edge JPEG for the grid
--     The worker generates previews and runs vision AI for title/desc/tags.
--   • PDF and EPS are accepted: the worker rasterises the first page into
--     the preview bucket. Downloads always return the original.
--   • Soft warning at 3MB upload, hard cap at 20MB (enforced client-side
--     plus a defensive size check on the server).
--   • EXIF GPS is stripped on upload; camera/timestamp metadata is kept.

-- ---------------------------------------------------------------------------
-- image_collections — folder tree for images. Independent from collections.
-- ---------------------------------------------------------------------------

create table if not exists savers.image_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  parent_id uuid references savers.image_collections (id) on delete cascade,
  position integer not null default 0,
  icon text,
  -- public-sharing fields (same shape as collections, see 009)
  is_public boolean not null default false,
  public_id text,
  public_slug text,
  public_description text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists image_collections_user_idx
  on savers.image_collections (user_id);

create index if not exists image_collections_parent_position_idx
  on savers.image_collections (parent_id, position);

create unique index if not exists image_collections_public_id_key
  on savers.image_collections (public_id)
  where public_id is not null;

create unique index if not exists image_collections_public_slug_key
  on savers.image_collections (public_slug)
  where public_slug is not null;

create index if not exists image_collections_is_public_idx
  on savers.image_collections (is_public)
  where is_public = true;

-- ---------------------------------------------------------------------------
-- images — one row per asset. Originals live in storage; this row is
-- metadata + AI-generated fields + bookkeeping.
-- ---------------------------------------------------------------------------

create table if not exists savers.images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  collection_id uuid references savers.image_collections (id) on delete set null,

  -- titles/desc/tags mirror bookmarks. title may be ai-generated; user can
  -- override or fall back to the filename via the edit panel.
  title text,
  description text,
  tags text[] not null default '{}'::text[],
  notes text,

  -- storage references. paths are relative to their bucket
  -- (e.g. "<user_id>/<image_id>.jpg").
  original_path text not null,
  preview_path text,                       -- null until worker fills it in
  original_filename text,                  -- preserved for download UX

  -- source_url is populated when the image was added from a URL (direct or
  -- page hero/og:image). null for uploads. surfaces as "Go to source"
  -- in the slideshow.
  source_url text,
  source_kind text,                        -- 'upload' | 'direct_url' | 'page_url'

  -- file_kind drives worker routing:
  --   'image'  — JPEG/PNG/WebP/GIF/HEIC — preview = downscaled JPEG
  --   'svg'    — preview = rasterised PNG snapshot
  --   'pdf'    — preview = first-page JPEG via Ghostscript
  --   'eps'    — preview = JPEG via Ghostscript
  file_kind text not null default 'image',
  mime_type text,
  original_size_bytes bigint,
  preview_size_bytes bigint,
  width integer,                           -- of the original, post-EXIF orient
  height integer,                          -- of the original

  -- async pipeline state for preview + AI enrichment
  processing_status text not null default 'pending',  -- 'pending'|'ready'|'failed'
  processing_error text,
  ai_processed_at timestamptz,
  ai_failed_at timestamptz,

  -- preserved EXIF (GPS already stripped pre-upload).
  taken_at timestamptz,
  camera_make text,
  camera_model text,

  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists images_user_idx
  on savers.images (user_id);

create index if not exists images_collection_position_idx
  on savers.images (collection_id, position);

create index if not exists images_user_created_idx
  on savers.images (user_id, created_at desc);

create index if not exists images_processing_status_idx
  on savers.images (processing_status)
  where processing_status <> 'ready';

create index if not exists images_tags_gin_idx
  on savers.images using gin (tags);

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on savers.image_collections
  to anon, authenticated, service_role;
grant select, insert, update, delete on savers.images
  to anon, authenticated, service_role;

alter table savers.image_collections enable row level security;
alter table savers.images enable row level security;

-- image_collections: owner CRUD
drop policy if exists image_collections_select_own on savers.image_collections;
create policy image_collections_select_own
  on savers.image_collections for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists image_collections_insert_own on savers.image_collections;
create policy image_collections_insert_own
  on savers.image_collections for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists image_collections_update_own on savers.image_collections;
create policy image_collections_update_own
  on savers.image_collections for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists image_collections_delete_own on savers.image_collections;
create policy image_collections_delete_own
  on savers.image_collections for delete to authenticated
  using (auth.uid() = user_id);

-- image_collections: anon/authenticated read when is_public = true
-- (server-side public pages use service-role; this is belt-and-braces)
drop policy if exists image_collections_select_public on savers.image_collections;
create policy image_collections_select_public
  on savers.image_collections for select to anon, authenticated
  using (is_public = true);

-- images: owner CRUD
drop policy if exists images_select_own on savers.images;
create policy images_select_own
  on savers.images for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists images_insert_own on savers.images;
create policy images_insert_own
  on savers.images for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists images_update_own on savers.images;
create policy images_update_own
  on savers.images for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists images_delete_own on savers.images;
create policy images_delete_own
  on savers.images for delete to authenticated
  using (auth.uid() = user_id);

-- images: anon/authenticated read via public image_collection
drop policy if exists images_select_via_public_collection on savers.images;
create policy images_select_via_public_collection
  on savers.images for select to anon, authenticated
  using (
    exists (
      select 1 from savers.image_collections c
      where c.id = images.collection_id
        and c.is_public = true
    )
  );

-- ---------------------------------------------------------------------------
-- Storage buckets
-- image-originals is private (signed URLs only).
-- image-previews is public so the grid loads via CDN with no per-request auth.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
  values ('image-originals', 'image-originals', false)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('image-previews', 'image-previews', true)
  on conflict (id) do nothing;

-- Storage RLS: users can only read/write objects whose path starts with
-- their own user_id. Paths look like "<user_id>/<image_id>.<ext>".

drop policy if exists image_originals_owner_read on storage.objects;
create policy image_originals_owner_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'image-originals'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists image_originals_owner_write on storage.objects;
create policy image_originals_owner_write
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'image-originals'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists image_originals_owner_update on storage.objects;
create policy image_originals_owner_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'image-originals'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists image_originals_owner_delete on storage.objects;
create policy image_originals_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'image-originals'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Previews are publicly readable (bucket is public), but only the owner
-- (or the worker via service role) can write.
drop policy if exists image_previews_owner_write on storage.objects;
create policy image_previews_owner_write
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'image-previews'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists image_previews_owner_update on storage.objects;
create policy image_previews_owner_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'image-previews'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists image_previews_owner_delete on storage.objects;
create policy image_previews_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'image-previews'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
