CREATE TABLE IF NOT EXISTS checkout_credit_reservations (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES app_customers(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES book_projects(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'reserved',
  idempotency_key text UNIQUE NOT NULL,
  woo_order_id bigint,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_purchase_rebates
  ADD COLUMN IF NOT EXISTS checkout_reservation_id uuid REFERENCES checkout_credit_reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS checkout_credit_reservations_project_idx
  ON checkout_credit_reservations(project_id, status);
