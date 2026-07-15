import crypto from "crypto";
import fs from "fs";
import path from "path";
import { databaseEnabled, getDatabasePool } from "./database.js";
import { projectStore } from "./projectStore.js";

const LOCAL_PATH = path.resolve("data/credits.json");
const now = () => new Date().toISOString();
const codeHash = (code) => crypto.createHash("sha256").update(String(code || "").trim().toUpperCase()).digest("hex");

export class InsufficientCreditError extends Error {
  constructor({ requiredCents, balanceCents }) {
    super("Insufficient preview credit");
    this.name = "InsufficientCreditError";
    this.requiredCents = requiredCents;
    this.balanceCents = balanceCents;
    this.missingCents = Math.max(0, requiredCents - balanceCents);
  }
}

export function configuredPromoCodes(source = process.env.PREVIEW_PROMO_CODES || "") {
  return new Map(String(source).split(",").map((item) => item.trim()).filter(Boolean).map((item) => {
    const separator = item.lastIndexOf(":");
    const label = (separator >= 0 ? item.slice(0, separator) : item).trim().toUpperCase();
    const amountCents = Number.parseInt(separator >= 0 ? item.slice(separator + 1) : "250", 10);
    return [codeHash(label), { label, amountCents }];
  }).filter(([, value]) => value.label && Number.isInteger(value.amountCents) && value.amountCents >= 250));
}

function emptyLocalStore() { return { entries: [], reservations: [], redemptions: [], rebates: [] }; }

export class JsonCreditStore {
  constructor(filePath = LOCAL_PATH, customerStore = projectStore) { this.filePath = path.resolve(filePath); this.customerStore = customerStore; }
  read() {
    try { return { ...emptyLocalStore(), ...JSON.parse(fs.readFileSync(this.filePath, "utf8")) }; }
    catch { return emptyLocalStore(); }
  }
  write(store) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2), "utf8");
    fs.renameSync(temporary, this.filePath);
  }
  async customer(identity) { return this.customerStore.ensureCustomer(identity); }
  async summary(identity, projectId = null) {
    const customer = await this.customer(identity); const store = this.read();
    const balanceCents = store.entries.filter((entry) => entry.customerId === customer.id).reduce((sum, entry) => sum + entry.amountCents, 0);
    const rebateCents = store.rebates.filter((entry) => entry.customerId === customer.id && entry.projectId === projectId && entry.status === "available").reduce((sum, entry) => sum + entry.amountCents, 0);
    return { balanceCents, rebateCents };
  }
  async redeem(identity, { code, projectId }) {
    const customer = await this.customer(identity); const configured = configuredPromoCodes(); const normalizedHash = codeHash(code); const promotion = configured.get(normalizedHash);
    if (!promotion) throw new Error("Invalid or inactive promotion code");
    const store = this.read(); const key = `${normalizedHash}:${customer.id}`;
    if (store.redemptions.some((item) => item.key === key)) throw new Error("Promotion code already used by this customer");
    store.redemptions.push({ id: crypto.randomUUID(), key, codeHash: normalizedHash, codeLabel: promotion.label, customerId: customer.id, projectId, amountCents: promotion.amountCents, createdAt: now() });
    store.entries.push({ id: crypto.randomUUID(), customerId: customer.id, projectId, amountCents: promotion.amountCents, entryType: "promotion_grant", idempotencyKey: `promo:${key}`, createdAt: now() });
    this.write(store); return { amountCents: promotion.amountCents, ...(await this.summary(identity, projectId)) };
  }
  async grantPaidOrder(identity, { amountCents, orderId }) {
    const customer = await this.customer(identity); const store = this.read(); const key = `woo-credit-order:${orderId}`;
    const existing = store.entries.find((entry) => entry.idempotencyKey === key);
    if (!existing) { store.entries.push({ id: crypto.randomUUID(), customerId: customer.id, projectId: null, amountCents, entryType: "woocommerce_credit_purchase", idempotencyKey: key, createdAt: now() }); this.write(store); }
    return this.summary(identity);
  }
  async reservePreview(identity, { projectId, amountCents, idempotencyKey }) {
    const customer = await this.customer(identity); const store = this.read();
    const existing = store.reservations.find((item) => item.idempotencyKey === idempotencyKey);
    if (existing) return existing;
    const balanceCents = store.entries.filter((entry) => entry.customerId === customer.id).reduce((sum, entry) => sum + entry.amountCents, 0);
    if (balanceCents < amountCents) throw new InsufficientCreditError({ requiredCents: amountCents, balanceCents });
    const reservation = { id: crypto.randomUUID(), customerId: customer.id, projectId, amountCents, status: "reserved", idempotencyKey, createdAt: now(), updatedAt: now() };
    store.reservations.push(reservation); store.entries.push({ id: crypto.randomUUID(), customerId: customer.id, projectId, amountCents: -amountCents, entryType: "preview_reserve", idempotencyKey: `reserve:${reservation.id}`, createdAt: now() });
    this.write(store); return reservation;
  }
  async capturePreview(reservationId) {
    const store = this.read(); const reservation = store.reservations.find((item) => item.id === reservationId);
    if (!reservation || reservation.status === "captured") return reservation;
    if (reservation.status !== "reserved") return reservation;
    reservation.status = "captured"; reservation.updatedAt = now();
    store.rebates.push({ id: crypto.randomUUID(), customerId: reservation.customerId, projectId: reservation.projectId, reservationId, amountCents: reservation.amountCents, status: "available", createdAt: now() });
    this.write(store); return reservation;
  }
  async releasePreview(reservationId) {
    const store = this.read(); const reservation = store.reservations.find((item) => item.id === reservationId);
    if (!reservation || reservation.status !== "reserved") return reservation;
    reservation.status = "released"; reservation.updatedAt = now();
    store.entries.push({ id: crypto.randomUUID(), customerId: reservation.customerId, projectId: reservation.projectId, amountCents: reservation.amountCents, entryType: "preview_release", idempotencyKey: `release:${reservation.id}`, createdAt: now() });
    this.write(store); return reservation;
  }
}

export class PostgresCreditStore {
  constructor(database = getDatabasePool(), customerStore = projectStore) { this.database = database; this.customerStore = customerStore; }
  async customer(identity) { return this.customerStore.ensureCustomer(identity); }
  async summary(identity, projectId = null) {
    const customer = await this.customer(identity);
    const [wallet, rebate] = await Promise.all([
      this.database.query("SELECT COALESCE(SUM(amount_cents),0)::int AS amount FROM credit_wallet_entries WHERE customer_id=$1", [customer.id]),
      projectId ? this.database.query("SELECT COALESCE(SUM(amount_cents),0)::int AS amount FROM project_purchase_rebates WHERE customer_id=$1 AND project_id=$2 AND status='available'", [customer.id, projectId]) : { rows: [{ amount: 0 }] },
    ]);
    return { balanceCents: wallet.rows[0].amount, rebateCents: rebate.rows[0].amount };
  }
  async redeem(identity, { code, projectId }) {
    const customer = await this.customer(identity); const normalizedHash = codeHash(code); const promotion = configuredPromoCodes().get(normalizedHash);
    if (!promotion) throw new Error("Invalid or inactive promotion code");
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const redemptionId = crypto.randomUUID();
      await client.query("INSERT INTO preview_promo_redemptions (id,code_hash,code_label,customer_id,project_id,amount_cents) VALUES ($1,$2,$3,$4,$5,$6)", [redemptionId, normalizedHash, promotion.label, customer.id, projectId || null, promotion.amountCents]);
      await client.query("INSERT INTO credit_wallet_entries (id,customer_id,project_id,amount_cents,entry_type,idempotency_key,metadata) VALUES ($1,$2,$3,$4,'promotion_grant',$5,$6)", [crypto.randomUUID(), customer.id, projectId || null, promotion.amountCents, `promo:${normalizedHash}:${customer.id}`, JSON.stringify({ codeLabel: promotion.label })]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); if (error?.code === "23505") throw new Error("Promotion code already used by this customer"); throw error; }
    finally { client.release(); }
    return { amountCents: promotion.amountCents, ...(await this.summary(identity, projectId)) };
  }
  async grantPaidOrder(identity, { amountCents, orderId }) {
    const customer = await this.customer(identity);
    await this.database.query("INSERT INTO credit_wallet_entries (id,customer_id,project_id,amount_cents,entry_type,idempotency_key,metadata) VALUES ($1,$2,NULL,$3,'woocommerce_credit_purchase',$4,$5) ON CONFLICT (idempotency_key) DO NOTHING", [crypto.randomUUID(), customer.id, amountCents, `woo-credit-order:${orderId}`, JSON.stringify({ wooOrderId: String(orderId) })]);
    return this.summary(identity);
  }
  async reservePreview(identity, { projectId, amountCents, idempotencyKey }) {
    const customer = await this.customer(identity); const client = await this.database.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT id FROM app_customers WHERE id=$1 FOR UPDATE", [customer.id]);
      const prior = await client.query("SELECT * FROM preview_credit_reservations WHERE idempotency_key=$1", [idempotencyKey]);
      if (prior.rows[0]) { await client.query("COMMIT"); return prior.rows[0]; }
      const balance = await client.query("SELECT COALESCE(SUM(amount_cents),0)::int AS amount FROM credit_wallet_entries WHERE customer_id=$1", [customer.id]);
      if (balance.rows[0].amount < amountCents) throw new InsufficientCreditError({ requiredCents: amountCents, balanceCents: balance.rows[0].amount });
      const id = crypto.randomUUID();
      const inserted = await client.query("INSERT INTO preview_credit_reservations (id,customer_id,project_id,amount_cents,idempotency_key) VALUES ($1,$2,$3,$4,$5) RETURNING *", [id, customer.id, projectId, amountCents, idempotencyKey]);
      await client.query("INSERT INTO credit_wallet_entries (id,customer_id,project_id,amount_cents,entry_type,idempotency_key) VALUES ($1,$2,$3,$4,'preview_reserve',$5)", [crypto.randomUUID(), customer.id, projectId, -amountCents, `reserve:${id}`]);
      await client.query("COMMIT"); return inserted.rows[0];
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async capturePreview(reservationId) {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query("UPDATE preview_credit_reservations SET status='captured',updated_at=now() WHERE id=$1 AND status='reserved' RETURNING *", [reservationId]);
      const reservation = updated.rows[0];
      if (reservation) await client.query("INSERT INTO project_purchase_rebates (id,customer_id,project_id,reservation_id,amount_cents) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (reservation_id) DO NOTHING", [crypto.randomUUID(), reservation.customer_id, reservation.project_id, reservation.id, reservation.amount_cents]);
      await client.query("COMMIT"); return reservation || null;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async releasePreview(reservationId) {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query("UPDATE preview_credit_reservations SET status='released',updated_at=now() WHERE id=$1 AND status='reserved' RETURNING *", [reservationId]);
      const reservation = updated.rows[0];
      if (reservation) await client.query("INSERT INTO credit_wallet_entries (id,customer_id,project_id,amount_cents,entry_type,idempotency_key) VALUES ($1,$2,$3,$4,'preview_release',$5) ON CONFLICT (idempotency_key) DO NOTHING", [crypto.randomUUID(), reservation.customer_id, reservation.project_id, reservation.amount_cents, `release:${reservation.id}`]);
      await client.query("COMMIT"); return reservation || null;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
}

export function createCreditStore(options = {}) { return databaseEnabled() ? new PostgresCreditStore(options.database, options.customerStore) : new JsonCreditStore(options.filePath, options.customerStore); }
export const creditStore = createCreditStore();
