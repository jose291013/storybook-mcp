CREATE TABLE IF NOT EXISTS narrative_v3_runs (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES book_projects(id) ON DELETE CASCADE,
  run_key text NOT NULL,
  pipeline_version integer NOT NULL DEFAULT 1 CHECK (pipeline_version = 1),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','waiting_input','completed','failed','cancelled')),
  error_code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (project_id, run_key)
);

CREATE TABLE IF NOT EXISTS narrative_v3_steps (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES narrative_v3_runs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES book_projects(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  step_key text NOT NULL,
  step_type text NOT NULL
    CHECK (step_type IN ('parse_story_concept','compile_story_graph')),
  output_artifact_type text NOT NULL
    CHECK (output_artifact_type IN ('story_concept','canonical_story_graph')),
  expected_pointer_revision bigint NOT NULL CHECK (expected_pointer_revision >= 0),
  input_fingerprint text NOT NULL CHECK (input_fingerprint ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','waiting_provider','completed','failed','cancelled')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 2 CHECK (max_attempts > 0),
  lease_owner text,
  lease_expires_at timestamptz,
  provider_response_id text NOT NULL DEFAULT '',
  error_code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (run_id, sequence),
  UNIQUE (run_id, step_key),
  UNIQUE (id, project_id)
);

CREATE INDEX IF NOT EXISTS narrative_v3_steps_claim_idx
  ON narrative_v3_steps(status, lease_expires_at, created_at)
  WHERE status IN ('queued','running','waiting_provider');

CREATE TABLE IF NOT EXISTS narrative_v3_step_inputs (
  step_id uuid NOT NULL,
  project_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  artifact_id uuid NOT NULL,
  artifact_type text NOT NULL,
  artifact_digest text NOT NULL CHECK (artifact_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (step_id, ordinal),
  UNIQUE (step_id, artifact_id),
  FOREIGN KEY (step_id, project_id)
    REFERENCES narrative_v3_steps(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY (artifact_id, project_id, artifact_type, artifact_digest)
    REFERENCES narrative_artifacts(id, project_id, artifact_type, payload_digest) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS narrative_v3_step_commits (
  step_id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  artifact_id uuid NOT NULL,
  artifact_type text NOT NULL,
  artifact_digest text NOT NULL CHECK (artifact_digest ~ '^[a-f0-9]{64}$'),
  artifact_revision bigint NOT NULL CHECK (artifact_revision > 0),
  pointer_revision bigint NOT NULL CHECK (pointer_revision > 0),
  committed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (step_id, project_id)
    REFERENCES narrative_v3_steps(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY (artifact_id, project_id, artifact_type, artifact_digest, artifact_revision)
    REFERENCES narrative_artifacts(id, project_id, artifact_type, payload_digest, revision)
    ON DELETE RESTRICT
);
