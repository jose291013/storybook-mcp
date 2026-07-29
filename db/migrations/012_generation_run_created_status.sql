DO $$
DECLARE
  current_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid)
    INTO current_definition
    FROM pg_constraint
   WHERE conrelid = 'generation_runs'::regclass
     AND conname = 'generation_runs_status_check';

  IF current_definition IS NULL OR position('created' IN current_definition) = 0 THEN
    ALTER TABLE generation_runs
      DROP CONSTRAINT IF EXISTS generation_runs_status_check;

    ALTER TABLE generation_runs
      ADD CONSTRAINT generation_runs_status_check
      CHECK (status IN (
        'created',
        'queued',
        'running',
        'waiting_input',
        'repair_pending',
        'completed',
        'failed',
        'cancelled'
      ));
  END IF;
END
$$;
