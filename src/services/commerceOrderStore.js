import crypto from "crypto";
import fs from "fs";
import path from "path";
import { databaseEnabled, getDatabasePool } from "./database.js";

const DEFAULT_LOCAL_PATH = path.resolve("data/commerce-orders.json");
const now = () => new Date().toISOString();
const orderKey = ({ orderId, projectId, productType }) => `${orderId}:${projectId}:${productType}`;

function normalize(record) {
  if (!record) return null;
  return {
    id: record.id,
    orderId: String(record.orderId ?? record.woo_order_id),
    projectId: record.projectId ?? record.project_id,
    customerId: record.customerId ?? record.customer_id,
    wooCustomerId: String(record.wooCustomerId ?? record.woo_customer_id ?? ""),
    productType: record.productType ?? record.product_type,
    pageCount: Number(record.pageCount ?? record.page_count ?? 0),
    orderTotalCents: Number(record.orderTotalCents ?? record.order_total_cents ?? 0),
    paymentStatus: record.paymentStatus ?? record.payment_status,
    fulfillmentStatus: record.fulfillmentStatus ?? record.fulfillment_status,
    storageKey: record.storageKey ?? record.storage_key ?? "",
    downloadFilename: record.downloadFilename ?? record.download_filename ?? "",
    deliveryError: record.deliveryError ?? record.delivery_error ?? "",
    paidAt: record.paidAt ?? record.paid_at?.toISOString?.() ?? record.paid_at ?? null,
    readyAt: record.readyAt ?? record.ready_at?.toISOString?.() ?? record.ready_at ?? null,
    createdAt: record.createdAt ?? record.created_at?.toISOString?.() ?? record.created_at ?? null,
    updatedAt: record.updatedAt ?? record.updated_at?.toISOString?.() ?? record.updated_at ?? null,
  };
}

export class JsonCommerceOrderStore {
  constructor(filePath = DEFAULT_LOCAL_PATH) { this.filePath = path.resolve(filePath); }
  read() {
    if (!fs.existsSync(this.filePath)) return { orders: {} };
    try { const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")); return { orders: parsed.orders || {} }; }
    catch { return { orders: {} }; }
  }
  write(store) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2), "utf8");
    fs.renameSync(temporary, this.filePath);
  }
  async recordPaid(input) {
    const store = this.read(); const key = orderKey(input); const existing = store.orders[key]; const timestamp = now();
    const record = {
      id: existing?.id || crypto.randomUUID(), orderId: String(input.orderId), projectId: input.projectId,
      customerId: input.customerId, wooCustomerId: String(input.wooCustomerId), productType: input.productType,
      pageCount: Number(input.pageCount || 0), orderTotalCents: Number(input.orderTotalCents || 0), paymentStatus: "paid",
      fulfillmentStatus: existing?.fulfillmentStatus || (input.productType === "ebook" ? "queued" : "not_required"),
      storageKey: existing?.storageKey || "", downloadFilename: existing?.downloadFilename || "", deliveryError: existing?.deliveryError || "",
      paidAt: existing?.paidAt || timestamp, readyAt: existing?.readyAt || null, createdAt: existing?.createdAt || timestamp,
      updatedAt: existing?.fulfillmentStatus === "generating" ? existing.updatedAt : timestamp,
    };
    store.orders[key] = record; this.write(store); return normalize(record);
  }
  async updateDelivery(identity, patch) {
    const store = this.read(); const key = orderKey(identity); const existing = store.orders[key];
    if (!existing) return null;
    store.orders[key] = { ...existing, ...patch, updatedAt: now() };
    this.write(store); return normalize(store.orders[key]);
  }
  async claimDelivery(identity, { staleAfterMs = 4 * 60 * 1000, allowReady = false } = {}) {
    const store = this.read(); const key = orderKey(identity); const existing = store.orders[key];
    if (!existing || String(existing.wooCustomerId) !== String(identity.wooCustomerId)) return null;
    const updatedAt = Date.parse(existing.updatedAt || existing.createdAt || "");
    const staleGenerating = existing.fulfillmentStatus === "generating"
      && Number.isFinite(updatedAt) && Date.now() - updatedAt >= staleAfterMs;
    const rebuildReady = allowReady && existing.fulfillmentStatus === "ready";
    if (!["queued", "failed"].includes(existing.fulfillmentStatus) && !staleGenerating && !rebuildReady) return null;
    store.orders[key] = { ...existing, fulfillmentStatus: "generating", deliveryError: "", updatedAt: now() };
    this.write(store); return normalize(store.orders[key]);
  }
  async findForCustomer({ orderId, projectId, wooCustomerId, productType = "ebook" }) {
    const record = this.read().orders[orderKey({ orderId, projectId, productType })];
    return record && String(record.wooCustomerId) === String(wooCustomerId) ? normalize(record) : null;
  }
  async recordStatus({ orderId, projectId, productType, wooCustomerId, status }) {
    const store = this.read(); const key = orderKey({ orderId, projectId, productType }); const existing = store.orders[key];
    if (!existing || String(existing.wooCustomerId) !== String(wooCustomerId)) return null;
    store.orders[key] = { ...existing, paymentStatus: status, fulfillmentStatus: productType === "ebook" ? "revoked" : existing.fulfillmentStatus, updatedAt: now() };
    this.write(store); return normalize(store.orders[key]);
  }
}

export class PostgresCommerceOrderStore {
  constructor(database = getDatabasePool()) { this.database = database; }
  async recordPaid(input) {
    const { rows } = await this.database.query(
      `INSERT INTO commerce_orders (id,project_id,customer_id,woo_order_id,product_type,payment_status,page_count,order_total_cents,fulfillment_status,paid_at)
       VALUES ($1,$2,$3,$4,$5,'paid',$6,$7,$8,now())
       ON CONFLICT (woo_order_id,project_id,product_type) DO UPDATE SET payment_status='paid',page_count=EXCLUDED.page_count,
         order_total_cents=EXCLUDED.order_total_cents,paid_at=COALESCE(commerce_orders.paid_at,now()),
         updated_at=CASE WHEN commerce_orders.fulfillment_status='generating' THEN commerce_orders.updated_at ELSE now() END
       RETURNING *`,
      [crypto.randomUUID(), input.projectId, input.customerId, input.orderId, input.productType, input.pageCount, input.orderTotalCents,
        input.productType === "ebook" ? "queued" : "not_required"]
    );
    return normalize({ ...rows[0], woo_customer_id: input.wooCustomerId });
  }
  async updateDelivery(identity, patch) {
    const allowed = {
      fulfillmentStatus: "fulfillment_status", storageKey: "storage_key", downloadFilename: "download_filename",
      deliveryError: "delivery_error", readyAt: "ready_at",
    };
    const entries = Object.entries(patch).filter(([key, value]) => allowed[key] && value !== undefined);
    if (!entries.length) return this.findForCustomer({ ...identity, wooCustomerId: identity.wooCustomerId || "" });
    const assignments = entries.map(([key], index) => `${allowed[key]}=$${index + 4}`);
    const values = entries.map(([, value]) => value);
    const { rows } = await this.database.query(
      `UPDATE commerce_orders SET ${assignments.join(",")},updated_at=now() WHERE woo_order_id=$1 AND project_id=$2 AND product_type=$3 RETURNING *`,
      [identity.orderId, identity.projectId, identity.productType, ...values]
    );
    return normalize({ ...rows[0], woo_customer_id: identity.wooCustomerId || "" });
  }
  async claimDelivery(identity, { staleAfterMs = 4 * 60 * 1000, allowReady = false } = {}) {
    const { rows } = await this.database.query(
      `UPDATE commerce_orders SET fulfillment_status='generating',delivery_error='',updated_at=now()
       FROM app_customers WHERE commerce_orders.customer_id=app_customers.id AND commerce_orders.woo_order_id=$1
       AND commerce_orders.project_id=$2 AND commerce_orders.product_type=$3 AND app_customers.woo_customer_id=$4
       AND (commerce_orders.fulfillment_status IN ('queued','failed')
         OR (commerce_orders.fulfillment_status='generating' AND commerce_orders.updated_at < now() - ($5::bigint * interval '1 millisecond'))
         OR ($6::boolean AND commerce_orders.fulfillment_status='ready'))
       RETURNING commerce_orders.*,app_customers.woo_customer_id`,
      [identity.orderId, identity.projectId, identity.productType, identity.wooCustomerId, staleAfterMs, allowReady]
    );
    return normalize(rows[0]);
  }
  async findForCustomer({ orderId, projectId, wooCustomerId, productType = "ebook" }) {
    const { rows } = await this.database.query(
      `SELECT commerce_orders.*,app_customers.woo_customer_id FROM commerce_orders
       JOIN app_customers ON app_customers.id=commerce_orders.customer_id
       WHERE commerce_orders.woo_order_id=$1 AND commerce_orders.project_id=$2 AND commerce_orders.product_type=$3 AND app_customers.woo_customer_id=$4`,
      [orderId, projectId, productType, wooCustomerId]
    );
    return normalize(rows[0]);
  }
  async recordStatus({ orderId, projectId, productType, wooCustomerId, status }) {
    const { rows } = await this.database.query(
      `UPDATE commerce_orders SET payment_status=$5,fulfillment_status=CASE WHEN product_type='ebook' THEN 'revoked' ELSE fulfillment_status END,updated_at=now()
       FROM app_customers WHERE commerce_orders.customer_id=app_customers.id AND commerce_orders.woo_order_id=$1
       AND commerce_orders.project_id=$2 AND commerce_orders.product_type=$3 AND app_customers.woo_customer_id=$4 RETURNING commerce_orders.*`,
      [orderId, projectId, productType, wooCustomerId, status]
    );
    return normalize({ ...rows[0], woo_customer_id: wooCustomerId });
  }
}

export function createCommerceOrderStore({ filePath } = {}) {
  return databaseEnabled() ? new PostgresCommerceOrderStore() : new JsonCommerceOrderStore(filePath);
}

export const commerceOrderStore = createCommerceOrderStore();
