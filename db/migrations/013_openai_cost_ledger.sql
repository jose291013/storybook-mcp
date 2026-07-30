CREATE TABLE IF NOT EXISTS openai_cost_events (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  run_id text NOT NULL DEFAULT '',
  workflow text NOT NULL DEFAULT 'book_generation',
  stage text NOT NULL DEFAULT '',
  attempt_kind text NOT NULL DEFAULT 'normal'
    CHECK (attempt_kind IN ('normal','technical_retry','quality_repair','customer_change')),
  endpoint text NOT NULL,
  provider_response_id text NOT NULL DEFAULT '',
  provider_request_id text NOT NULL DEFAULT '',
  model text NOT NULL,
  service_tier text NOT NULL DEFAULT 'standard',
  price_version text NOT NULL,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_usd_micros bigint NOT NULL DEFAULT 0 CHECK (cost_usd_micros >= 0),
  pricing_complete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS openai_cost_events_provider_response_idx
  ON openai_cost_events(project_id, endpoint, provider_response_id)
  WHERE provider_response_id <> '';

CREATE INDEX IF NOT EXISTS openai_cost_events_project_created_idx
  ON openai_cost_events(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS openai_cost_events_created_idx
  ON openai_cost_events(created_at DESC);

COMMENT ON TABLE openai_cost_events IS
  'Private Calitiki production-cost ledger. Stores numeric usage only; never prompts, answers, photos or generated content.';
