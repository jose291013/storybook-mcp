CREATE TABLE IF NOT EXISTS family_book_shares (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES book_projects(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES app_customers(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  access_count integer NOT NULL DEFAULT 0,
  last_accessed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_book_shares_project_active_idx
  ON family_book_shares(project_id, customer_id, expires_at DESC)
  WHERE revoked_at IS NULL;
