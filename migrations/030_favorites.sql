-- Hearts are separate from the existing pinned ordering of bookmarks.
-- The existing owner UPDATE and SELECT policies apply to these columns.
alter table savers.bookmarks
  add column if not exists favorite boolean not null default false;

alter table savers.images
  add column if not exists favorite boolean not null default false;
