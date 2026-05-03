-- Migration 016: Add link health tracking columns to bookmarks.
--
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query).

ALTER TABLE savers.bookmarks
  ADD COLUMN IF NOT EXISTS link_status TEXT DEFAULT 'unknown' CHECK (link_status IN ('unknown', 'active', 'broken', 'redirect'));

ALTER TABLE savers.bookmarks
  ADD COLUMN IF NOT EXISTS last_link_check TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bookmarks_link_status ON savers.bookmarks(link_status);
