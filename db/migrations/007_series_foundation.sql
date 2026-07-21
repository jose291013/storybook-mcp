ALTER TABLE book_projects
  ADD COLUMN IF NOT EXISTS source_project_id uuid REFERENCES book_projects(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS book_projects_source_project_unique_idx
  ON book_projects(source_project_id)
  WHERE source_project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS book_projects_series_episode_unique_idx
  ON book_projects(series_id, episode_number)
  WHERE series_id IS NOT NULL AND episode_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS series_continuity_facts (
  id uuid PRIMARY KEY,
  series_id uuid NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  source_project_id uuid REFERENCES book_projects(id) ON DELETE SET NULL,
  fact_key text NOT NULL,
  fact_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'approved',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(series_id, source_project_id, fact_key)
);

CREATE INDEX IF NOT EXISTS series_continuity_facts_series_idx
  ON series_continuity_facts(series_id, created_at ASC);
