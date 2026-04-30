-- Add screenshot_status and screenshot_error columns to track async screenshot jobs.
-- Statuses: 'pending' (queued), 'processing' (worker started), 'complete', 'error'

ALTER TABLE savers.bookmarks
  ADD COLUMN screenshot_status text,
  ADD COLUMN screenshot_error text;

CREATE INDEX idx_bookmarks_screenshot_status ON savers.bookmarks (user_id, screenshot_status)
  WHERE screenshot_status IS NOT NULL;
