ALTER TABLE intention_ideation_budgets
  ADD COLUMN IF NOT EXISTS reserved_request_id text,
  ADD COLUMN IF NOT EXISTS reserved_round smallint,
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz;

COMMENT ON COLUMN intention_ideation_budgets.round_count IS
  'Number of successfully generated perspective batches. Failed or interrupted reservations do not consume this count.';

COMMENT ON COLUMN intention_ideation_budgets.reserved_request_id IS
  'Opaque token for the single active generation reservation. Never contains parent wording.';
