-- Migration 005: Persist screenshot refreshes across page reloads/devices
--
-- Run this in the Supabase SQL editor.
-- `preview_version` is a cache-busting token stored on the bookmark row.
-- When a user clicks "Reload preview", we update this field so future page
-- loads use the refreshed screenshot URL instead of a one-off client nonce.

alter table savers.bookmarks
  add column if not exists preview_version bigint;

create index if not exists bookmarks_preview_version_idx
  on savers.bookmarks (preview_version);
