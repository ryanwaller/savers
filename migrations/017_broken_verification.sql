-- Migration 017: Add broken link verification tracking columns.
--
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query).

ALTER TABLE savers.bookmarks
  ADD COLUMN IF NOT EXISTS broken_status TEXT DEFAULT 'flagged'
    CHECK (broken_status IN ('flagged', 'confirmed_broken', 'verified_active', 'false_positive'));

ALTER TABLE savers.bookmarks
  ADD COLUMN IF NOT EXISTS broken_checked_at TIMESTAMPTZ;

ALTER TABLE savers.bookmarks
  ADD COLUMN IF NOT EXISTS broken_verified_at TIMESTAMPTZ;

ALTER TABLE savers.bookmarks
  ADD COLUMN IF NOT EXISTS broken_verified_by UUID REFERENCES savers.users(id);

CREATE INDEX IF NOT EXISTS idx_bookmarks_broken_status ON savers.bookmarks(broken_status);
