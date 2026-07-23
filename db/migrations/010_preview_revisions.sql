CREATE TABLE IF NOT EXISTS preview_modifications (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES book_projects(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES app_customers(id) ON DELETE CASCADE,
  spread_number integer NOT NULL CHECK (spread_number > 0),
  change_scope text NOT NULL CHECK (change_scope IN ('text','illustration','both')),
  instruction text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'quoted',
  reservation_id uuid REFERENCES preview_credit_reservations(id) ON DELETE SET NULL,
  source_fingerprint text NOT NULL,
  source_snapshot jsonb NOT NULL,
  candidate_snapshot jsonb,
  failure_code text,
  failure_message text,
  attempt_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  rejected_at timestamptz
);

CREATE INDEX IF NOT EXISTS preview_modifications_project_idx
  ON preview_modifications(project_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS preview_modifications_one_active_idx
  ON preview_modifications(project_id)
  WHERE status IN ('reserved','generating','awaiting_approval');

CREATE TABLE IF NOT EXISTS preview_revisions (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES book_projects(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES app_customers(id) ON DELETE CASCADE,
  parent_revision_id uuid REFERENCES preview_revisions(id) ON DELETE SET NULL,
  source_modification_id uuid UNIQUE REFERENCES preview_modifications(id) ON DELETE SET NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  status text NOT NULL CHECK (status IN ('superseded','current')),
  blueprint_snapshot jsonb NOT NULL,
  preview_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, revision_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS preview_revisions_one_current_idx
  ON preview_revisions(project_id)
  WHERE status='current';
