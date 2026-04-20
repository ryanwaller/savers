-- Migration 006: Persist preview files in Supabase Storage
--
-- Run this after migration 005.
-- The image bytes themselves live in the `bookmark-previews` storage bucket.
-- These columns track the stored file path and metadata per bookmark.

alter table savers.bookmarks
  add column if not exists preview_path text,
  add column if not exists preview_provider text,
  add column if not exists preview_updated_at timestamptz;
