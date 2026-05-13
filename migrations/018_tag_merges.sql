-- Track tag merge operations for undo support.
-- Tags live as text[] on bookmarks, so merging means rewriting those arrays.
CREATE TABLE IF NOT EXISTS savers.tag_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_tags text[] NOT NULL,
  target_tag text NOT NULL,
  affected_bookmark_ids uuid[] NOT NULL,
  reverted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_tag_merges_user_created
  ON savers.tag_merges (user_id, created_at DESC);

ALTER TABLE savers.tag_merges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own merges"
  ON savers.tag_merges FOR SELECT
  USING (user_id = (SELECT savers.current_user_id()));

-- RPC: get tag counts for a user (unnest tags arrays, group, count).
CREATE OR REPLACE FUNCTION savers.get_tag_counts(p_user_id uuid)
RETURNS TABLE(tag text, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT unnest(tags) AS tag, count(*) AS count
  FROM savers.bookmarks
  WHERE user_id = p_user_id
  GROUP BY tag
  ORDER BY count DESC, tag;
$$;
