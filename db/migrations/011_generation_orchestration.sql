CREATE TABLE IF NOT EXISTS generation_runs (
  id text PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES book_projects(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'preview',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','waiting_input','repair_pending','completed','failed','cancelled')),
  current_step text NOT NULL DEFAULT '',
  input_fingerprint text NOT NULL DEFAULT '',
  attempt_count integer NOT NULL DEFAULT 0,
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  error_code text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS generation_runs_project_idx
  ON generation_runs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS generation_runs_claim_idx
  ON generation_runs(status, lease_expires_at, created_at)
  WHERE status IN ('queued','running');

CREATE TABLE IF NOT EXISTS generation_steps (
  id uuid PRIMARY KEY,
  run_id text NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  step_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','waiting_input','retry_pending','repair_pending','completed','failed','cancelled')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 1 CHECK (max_attempts > 0),
  input_fingerprint text NOT NULL DEFAULT '',
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (run_id, step_key)
);

CREATE INDEX IF NOT EXISTS generation_steps_claim_idx
  ON generation_steps(status, next_attempt_at, lease_expires_at, created_at)
  WHERE status IN ('queued','running','retry_pending','repair_pending');

CREATE TABLE IF NOT EXISTS generation_candidates (
  id uuid PRIMARY KEY,
  run_id text NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES generation_steps(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES book_projects(id) ON DELETE CASCADE,
  page_number integer,
  candidate_number integer NOT NULL CHECK (candidate_number > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','quarantined')),
  storage_key text NOT NULL DEFAULT '',
  preview_url text NOT NULL DEFAULT '',
  rejection_kind text NOT NULL DEFAULT '',
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (step_id, candidate_number)
);

CREATE INDEX IF NOT EXISTS generation_candidates_project_page_idx
  ON generation_candidates(project_id, page_number, created_at DESC);
