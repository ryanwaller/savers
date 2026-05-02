-- Migration 015: Add asset_override flag to bookmarks.
-- When true, prevents automatic asset type detection from overriding
-- the current preview on collection changes or re-processing.
--
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query).

ALTER TABLE savers.bookmarks
  ADD COLUMN IF NOT EXISTS asset_override boolean DEFAULT false;

-- Also ensure asset_type column exists (migration 014)
ALTER TABLE savers.bookmarks
  ADD COLUMN IF NOT EXISTS asset_type text;
