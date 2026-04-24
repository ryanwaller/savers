-- Migration 007: Allow manual uploaded preview overrides per bookmark
--
-- Run this after migration 006.

alter table savers.bookmarks
  add column if not exists custom_preview_path text;
