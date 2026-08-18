CREATE TABLE IF NOT EXISTS narrative_artifacts (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES book_projects(id) ON DELETE CASCADE,
  artifact_type text NOT NULL
    CHECK (artifact_type IN ('story_concept','canonical_story_graph')),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  revision bigint NOT NULL CHECK (revision > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_digest text NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'sealed'
    CHECK (state IN ('sealed','accepted','rejected','quarantined')),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, artifact_type, revision),
  UNIQUE (project_id, artifact_type, payload_digest),
  UNIQUE (id, project_id),
  UNIQUE (id, project_id, payload_digest),
  UNIQUE (id, project_id, artifact_type, payload_digest),
  UNIQUE (id, project_id, artifact_type, payload_digest, revision)
);

CREATE INDEX IF NOT EXISTS narrative_artifacts_project_type_idx
  ON narrative_artifacts(project_id, artifact_type, revision DESC);

CREATE TABLE IF NOT EXISTS narrative_artifact_parents (
  child_artifact_id uuid NOT NULL,
  project_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  parent_artifact_id uuid NOT NULL,
  parent_digest text NOT NULL CHECK (parent_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (child_artifact_id, ordinal),
  UNIQUE (child_artifact_id, parent_artifact_id),
  CHECK (child_artifact_id <> parent_artifact_id),
  FOREIGN KEY (child_artifact_id, project_id)
    REFERENCES narrative_artifacts(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_artifact_id, project_id, parent_digest)
    REFERENCES narrative_artifacts(id, project_id, payload_digest) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS narrative_artifact_parents_parent_idx
  ON narrative_artifact_parents(parent_artifact_id);

CREATE TABLE IF NOT EXISTS narrative_project_pointers (
  project_id uuid NOT NULL REFERENCES book_projects(id) ON DELETE CASCADE,
  artifact_type text NOT NULL
    CHECK (artifact_type IN ('story_concept','canonical_story_graph')),
  artifact_id uuid NOT NULL,
  artifact_digest text NOT NULL CHECK (artifact_digest ~ '^[a-f0-9]{64}$'),
  artifact_revision bigint NOT NULL CHECK (artifact_revision > 0),
  pointer_revision bigint NOT NULL CHECK (pointer_revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, artifact_type),
  FOREIGN KEY (artifact_id, project_id, artifact_type, artifact_digest, artifact_revision)
    REFERENCES narrative_artifacts(id, project_id, artifact_type, payload_digest, revision)
    ON DELETE RESTRICT
);
