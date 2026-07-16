ALTER TABLE commerce_orders DROP CONSTRAINT IF EXISTS commerce_orders_woo_order_id_key;

ALTER TABLE commerce_orders
  ADD COLUMN IF NOT EXISTS page_count integer,
  ADD COLUMN IF NOT EXISTS order_total_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS storage_key text,
  ADD COLUMN IF NOT EXISTS download_filename text,
  ADD COLUMN IF NOT EXISTS delivery_error text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS commerce_orders_order_project_type_idx
  ON commerce_orders(woo_order_id, project_id, product_type);

CREATE INDEX IF NOT EXISTS commerce_orders_customer_ready_idx
  ON commerce_orders(customer_id, fulfillment_status, updated_at DESC);
