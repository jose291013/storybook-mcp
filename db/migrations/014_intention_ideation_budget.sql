CREATE TABLE IF NOT EXISTS intention_ideation_budgets (
  owner_hash text NOT NULL,
  input_fingerprint text NOT NULL,
  round_count smallint NOT NULL DEFAULT 0 CHECK (round_count BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_hash, input_fingerprint)
);

CREATE INDEX IF NOT EXISTS intention_ideation_budgets_updated_idx
  ON intention_ideation_budgets(updated_at DESC);

COMMENT ON TABLE intention_ideation_budgets IS
  'Numeric anonymous intention-ideation budget only. Never stores parent wording or generated perspectives.';
