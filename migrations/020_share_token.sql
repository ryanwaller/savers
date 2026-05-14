-- Add share_token to bookmarks for public sharing
ALTER TABLE savers.bookmarks
  ADD COLUMN IF NOT EXISTS share_token uuid UNIQUE DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_bookmarks_share_token
  ON savers.bookmarks (share_token)
  WHERE share_token IS NOT NULL;
