-- Migration 002: Add icon column to collections
--
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query).
-- The `icon` column stores a Phosphor icon name like "Folder", "Briefcase",
-- "Palette", etc. NULL means "use the default folder glyph".

alter table savers.collections
  add column if not exists icon text;

-- No backfill needed; existing rows get NULL = default folder icon.
