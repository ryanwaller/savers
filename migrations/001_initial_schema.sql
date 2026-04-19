create schema if not exists savers;

create extension if not exists pgcrypto;

create table if not exists savers.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references savers.collections (id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists collections_parent_position_idx
  on savers.collections (parent_id, position);

create table if not exists savers.bookmarks (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid references savers.collections (id) on delete set null,
  url text not null,
  title text,
  description text,
  og_image text,
  favicon text,
  tags text[] not null default '{}'::text[],
  notes text,
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists bookmarks_collection_position_idx
  on savers.bookmarks (collection_id, position);

create index if not exists bookmarks_created_at_idx
  on savers.bookmarks (created_at desc);
