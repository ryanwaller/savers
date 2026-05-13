-- Track duplicate delete operations for undo support.
-- Stores full bookmark snapshots as JSONB so undo can restore them exactly.
CREATE TABLE IF NOT EXISTS savers.duplicate_deletes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deleted_bookmarks jsonb NOT NULL,
  deleted_count integer NOT NULL,
  duplicate_group_count integer NOT NULL,
  reverted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX idx_duplicate_deletes_user_created
  ON savers.duplicate_deletes (user_id, created_at DESC);

ALTER TABLE savers.duplicate_deletes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own duplicate deletes"
  ON savers.duplicate_deletes FOR SELECT
  USING (user_id = (SELECT auth.uid()));
