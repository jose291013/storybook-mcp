CREATE TABLE IF NOT EXISTS credit_wallet_entries (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES app_customers(id) ON DELETE CASCADE,
  project_id uuid REFERENCES book_projects(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL,
  entry_type text NOT NULL,
  idempotency_key text UNIQUE NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_wallet_customer_idx ON credit_wallet_entries(customer_id, created_at);

CREATE TABLE IF NOT EXISTS preview_credit_reservations (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES app_customers(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES book_projects(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'reserved',
  idempotency_key text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preview_promo_redemptions (
  id uuid PRIMARY KEY,
  code_hash text NOT NULL,
  code_label text NOT NULL,
  customer_id uuid NOT NULL REFERENCES app_customers(id) ON DELETE CASCADE,
  project_id uuid REFERENCES book_projects(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code_hash, customer_id)
);

CREATE TABLE IF NOT EXISTS project_purchase_rebates (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES app_customers(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES book_projects(id) ON DELETE CASCADE,
  reservation_id uuid UNIQUE NOT NULL REFERENCES preview_credit_reservations(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_purchase_rebates_project_idx ON project_purchase_rebates(project_id, status);

