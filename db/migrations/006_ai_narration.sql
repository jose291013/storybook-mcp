ALTER TABLE commerce_orders
  ADD COLUMN IF NOT EXISTS configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_manifest jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS commerce_orders_ready_narration_idx
  ON commerce_orders(project_id, customer_id, updated_at DESC)
  WHERE product_type='narration' AND payment_status='paid' AND fulfillment_status='ready';
