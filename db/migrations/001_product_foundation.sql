CREATE TABLE IF NOT EXISTS app_customers (
  id uuid PRIMARY KEY,
  woo_customer_id bigint UNIQUE NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS child_profiles (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES app_customers(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  profile_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS series (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES app_customers(id) ON DELETE CASCADE,
  child_profile_id uuid REFERENCES child_profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  memory_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS character_profiles (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES app_customers(id) ON DELETE CASCADE,
  child_profile_id uuid REFERENCES child_profiles(id) ON DELETE CASCADE,
  series_id uuid REFERENCES series(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL,
  story_role text,
  canon_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS book_projects (
  id uuid PRIMARY KEY,
  customer_id uuid REFERENCES app_customers(id) ON DELETE SET NULL,
  anonymous_owner_hash text,
  child_profile_id uuid REFERENCES child_profiles(id) ON DELETE SET NULL,
  series_id uuid REFERENCES series(id) ON DELETE SET NULL,
  episode_number integer,
  status text NOT NULL DEFAULT 'draft',
  title text,
  locale text,
  questionnaire jsonb NOT NULL DEFAULT '{}'::jsonb,
  photo_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  product_configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  continuity_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  final_blueprint jsonb,
  preview_result jsonb,
  generation_job_id text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS book_projects_customer_updated_idx ON book_projects(customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS book_projects_anonymous_owner_idx ON book_projects(anonymous_owner_hash);
CREATE INDEX IF NOT EXISTS book_projects_series_episode_idx ON book_projects(series_id, episode_number);

CREATE TABLE IF NOT EXISTS project_assets (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES book_projects(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  storage_key text NOT NULL,
  mime_type text,
  byte_size bigint,
  is_private boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES app_customers(id) ON DELETE CASCADE,
  project_id uuid REFERENCES book_projects(id) ON DELETE SET NULL,
  amount integer NOT NULL,
  entry_type text NOT NULL,
  idempotency_key text UNIQUE NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preview_access_codes (
  id uuid PRIMARY KEY,
  code_hash text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by_customer_id uuid REFERENCES app_customers(id) ON DELETE SET NULL,
  redeemed_for_project_id uuid REFERENCES book_projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commerce_orders (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES book_projects(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES app_customers(id) ON DELETE RESTRICT,
  woo_order_id bigint UNIQUE NOT NULL,
  product_type text NOT NULL,
  payment_status text NOT NULL,
  promised_production jsonb NOT NULL DEFAULT '{}'::jsonb,
  promised_shipping jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fulfillment_rules (
  id uuid PRIMARY KEY,
  product_type text NOT NULL,
  destination_zone text NOT NULL DEFAULT '*',
  min_production_days integer NOT NULL DEFAULT 0,
  max_production_days integer NOT NULL DEFAULT 0,
  min_shipping_days integer NOT NULL DEFAULT 0,
  max_shipping_days integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

