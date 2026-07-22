CREATE TABLE IF NOT EXISTS project_deletions (
  id uuid PRIMARY KEY,
  project_id uuid UNIQUE NOT NULL,
  customer_id uuid NOT NULL REFERENCES app_customers(id) ON DELETE RESTRICT,
  asset_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  last_error text NOT NULL DEFAULT '',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_deletions_customer_idx
  ON project_deletions(customer_id, updated_at DESC);
