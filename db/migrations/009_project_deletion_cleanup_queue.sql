ALTER TABLE project_deletions
  ADD COLUMN IF NOT EXISTS cleanup_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS project_deletions_pending_cleanup_idx
  ON project_deletions(next_retry_at ASC)
  WHERE status = 'pending';
