-- Migration 003: Add pinned flag to bookmarks
--
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query).
-- Pinned bookmarks sort first in every view, and activate a virtual
-- "Pinned" collection in the sidebar.

alter table savers.bookmarks
  add column if not exists pinned boolean not null default false;

-- Partial index: only stores rows where pinned=true, since most rows are false.
create index if not exists bookmarks_pinned_idx
  on savers.bookmarks (pinned)
  where pinned = true;
