-- Add async auto-tagging columns to bookmarks
ALTER TABLE savers.bookmarks
  ADD COLUMN auto_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN tagging_status text NOT NULL DEFAULT 'pending'
    CHECK (tagging_status IN ('pending', 'processing', 'completed', 'failed'));

CREATE INDEX idx_bookmarks_tagging_status ON savers.bookmarks (user_id, tagging_status)
  WHERE tagging_status = 'pending';

-- Canonical tag aliases for normalization
CREATE TABLE savers.tag_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_tag text NOT NULL UNIQUE,
  variants text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_tag_aliases_variants ON savers.tag_aliases USING gin (variants);

-- Enable RLS
ALTER TABLE savers.tag_aliases ENABLE ROW LEVEL SECURITY;

-- Everyone can read tag aliases (they're global/shared)
CREATE POLICY "Anyone can read tag aliases"
  ON savers.tag_aliases FOR SELECT
  USING (true);
