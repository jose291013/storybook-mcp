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

function emptyLocalStore() { return { entries: [], reservations: [], redemptions: [], rebates: [], checkoutReservations: [] }; }

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
  async history(identity, limit = 50) {
    const customer = await this.customer(identity); const store = this.read();
    return store.entries.filter((entry) => entry.customerId === customer.id)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .slice(0, Math.max(1, Math.min(100, Number(limit) || 50)))
      .map((entry) => ({ id: entry.id, projectId: entry.projectId || null, amountCents: entry.amountCents, entryType: entry.entryType, metadata: entry.metadata || {}, createdAt: entry.createdAt }));
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
    if (!["reserved", "released"].includes(reservation.status)) return reservation;
    if (reservation.status === "released") {
      const idempotencyKey = `retry-capture:${reservation.id}`;
      if (!store.entries.some((entry) => entry.idempotencyKey === idempotencyKey)) {
        store.entries.push({
          id: crypto.randomUUID(),
          customerId: reservation.customerId,
          projectId: reservation.projectId,
          amountCents: -reservation.amountCents,
          entryType: "preview_retry_capture",
          idempotencyKey,
          createdAt: now(),
        });
      }
    }
    reservation.status = "captured"; reservation.updatedAt = now();
    if (!store.rebates.some((rebate) => rebate.reservationId === reservation.id)) {
      store.rebates.push({ id: crypto.randomUUID(), customerId: reservation.customerId, projectId: reservation.projectId, reservationId, amountCents: reservation.amountCents, status: "available", createdAt: now() });
    }
    this.write(store); return reservation;
  }
  async releasePreview(reservationId) {
    const store = this.read(); const reservation = store.reservations.find((item) => item.id === reservationId);
    if (!reservation || reservation.status !== "reserved") return reservation;
    reservation.status = "released"; reservation.updatedAt = now();
    store.entries.push({ id: crypto.randomUUID(), customerId: reservation.customerId, projectId: reservation.projectId, amountCents: reservation.amountCents, entryType: "preview_release", idempotencyKey: `release:${reservation.id}`, createdAt: now() });
    this.write(store); return reservation;
  }
  async releasePreviewForProject(identity, { projectId }) {
    const customer = await this.customer(identity); const store = this.read(); let releasedCount = 0;
    for (const reservation of store.reservations.filter((item) => (
      item.customerId === customer.id && item.projectId === projectId && item.status === "reserved"
    ))) {
      reservation.status = "released"; reservation.updatedAt = now(); releasedCount += 1;
      const idempotencyKey = `release:${reservation.id}`;
      if (!store.entries.some((entry) => entry.idempotencyKey === idempotencyKey)) {
        store.entries.push({ id: crypto.randomUUID(), customerId: reservation.customerId, projectId: reservation.projectId, amountCents: reservation.amountCents, entryType: "preview_release", idempotencyKey, createdAt: now() });
      }
    }
    if (releasedCount) this.write(store);
    return { projectId, releasedCount };
  }
  async deleteProjectEntitlements(identity, { projectId }) {
    const customer = await this.customer(identity); const store = this.read();
    store.entries.forEach((entry) => { if (entry.customerId === customer.id && entry.projectId === projectId) entry.projectId = null; });
    store.redemptions.forEach((redemption) => { if (redemption.customerId === customer.id && redemption.projectId === projectId) redemption.projectId = null; });
    store.reservations = store.reservations.filter((item) => !(item.customerId === customer.id && item.projectId === projectId));
    store.rebates = store.rebates.filter((item) => !(item.customerId === customer.id && item.projectId === projectId));
    store.checkoutReservations = store.checkoutReservations.filter((item) => !(item.customerId === customer.id && item.projectId === projectId));
    this.write(store);
    return { projectId, deleted: true };
  }
  async reserveProjectRebate(identity, { projectId, idempotencyKey }) {
    const customer = await this.customer(identity); const store = this.read(); const timestamp = Date.now();
    for (const reservation of store.checkoutReservations) {
      if (reservation.status === "reserved" && Date.parse(reservation.expiresAt) <= timestamp) {
        reservation.status = "expired"; reservation.updatedAt = now();
        store.rebates.filter((rebate) => rebate.checkoutReservationId === reservation.id && rebate.status === "reserved")
          .forEach((rebate) => { rebate.status = "available"; rebate.checkoutReservationId = null; rebate.updatedAt = now(); });
      }
    }
    const existing = store.checkoutReservations.find((item) => item.customerId === customer.id && item.projectId === projectId && item.status === "reserved");
    if (existing) { this.write(store); return existing; }
    const rebates = store.rebates.filter((item) => item.customerId === customer.id && item.projectId === projectId && item.status === "available");
    const amountCents = rebates.reduce((sum, item) => sum + item.amountCents, 0);
    if (amountCents <= 0) { this.write(store); return { id: "", projectId, amountCents: 0, status: "none" }; }
    const reservation = { id: crypto.randomUUID(), customerId: customer.id, projectId, amountCents, status: "reserved", idempotencyKey, expiresAt: new Date(timestamp + 30 * 60000).toISOString(), createdAt: now(), updatedAt: now() };
    store.checkoutReservations.push(reservation);
    rebates.forEach((rebate) => { rebate.status = "reserved"; rebate.checkoutReservationId = reservation.id; rebate.updatedAt = now(); });
    this.write(store); return reservation;
  }
  async hasActiveCheckoutReservation(identity, { projectId }) {
    const customer = await this.customer(identity);
    const store = this.read();
    const timestamp = Date.now();
    let changed = false;
    for (const reservation of store.checkoutReservations) {
      if (reservation.status === "reserved" && Date.parse(reservation.expiresAt) <= timestamp) {
        reservation.status = "expired";
        reservation.updatedAt = now();
        store.rebates.filter((rebate) => rebate.checkoutReservationId === reservation.id && rebate.status === "reserved")
          .forEach((rebate) => { rebate.status = "available"; rebate.checkoutReservationId = null; rebate.updatedAt = now(); });
        changed = true;
      }
    }
    if (changed) this.write(store);
    return store.checkoutReservations.some((item) => (
      item.customerId === customer.id && item.projectId === projectId && item.status === "reserved"
    ));
  }
  async captureCheckout(reservationId, orderId) {
    if (!reservationId) return null;
    const store = this.read(); const reservation = store.checkoutReservations.find((item) => item.id === reservationId);
    if (!reservation || reservation.status === "captured") return reservation || null;
    if (reservation.status !== "reserved") return reservation;
    reservation.status = "captured"; reservation.wooOrderId = String(orderId); reservation.updatedAt = now();
    store.rebates.filter((item) => item.checkoutReservationId === reservation.id).forEach((item) => { item.status = "spent"; item.updatedAt = now(); });
    this.write(store); return reservation;
  }
  async releaseCheckout(reservationId, orderId = "") {
    if (!reservationId) return null;
    const store = this.read(); const reservation = store.checkoutReservations.find((item) => item.id === reservationId);
    if (!reservation || ["released", "expired"].includes(reservation.status)) return reservation || null;
    reservation.status = "released"; reservation.wooOrderId = String(orderId || reservation.wooOrderId || ""); reservation.updatedAt = now();
    store.rebates.filter((item) => item.checkoutReservationId === reservation.id).forEach((item) => { item.status = "available"; item.checkoutReservationId = null; item.updatedAt = now(); });
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
  async history(identity, limit = 50) {
    const customer = await this.customer(identity);
    const capped = Math.max(1, Math.min(100, Number(limit) || 50));
    const { rows } = await this.database.query(
      "SELECT id,project_id,amount_cents,entry_type,metadata,created_at FROM credit_wallet_entries WHERE customer_id=$1 ORDER BY created_at DESC LIMIT $2",
      [customer.id, capped]
    );
    return rows.map((row) => ({ id: row.id, projectId: row.project_id || null, amountCents: row.amount_cents, entryType: row.entry_type, metadata: row.metadata || {}, createdAt: row.created_at?.toISOString?.() || row.created_at }));
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
      const selected = await client.query("SELECT * FROM preview_credit_reservations WHERE id=$1 FOR UPDATE", [reservationId]);
      let reservation = selected.rows[0] || null;
      if (!reservation || reservation.status === "captured" || !["reserved", "released"].includes(reservation.status)) {
        await client.query("COMMIT"); return reservation;
      }
      if (reservation.status === "released") {
        await client.query(
          "INSERT INTO credit_wallet_entries (id,customer_id,project_id,amount_cents,entry_type,idempotency_key,metadata) VALUES ($1,$2,$3,$4,'preview_retry_capture',$5,$6) ON CONFLICT (idempotency_key) DO NOTHING",
          [crypto.randomUUID(), reservation.customer_id, reservation.project_id, -reservation.amount_cents, `retry-capture:${reservation.id}`, JSON.stringify({ recoveredReservationId: reservation.id })]
        );
      }
      const updated = await client.query("UPDATE preview_credit_reservations SET status='captured',updated_at=now() WHERE id=$1 AND status IN ('reserved','released') RETURNING *", [reservationId]);
      reservation = updated.rows[0] || reservation;
      await client.query("INSERT INTO project_purchase_rebates (id,customer_id,project_id,reservation_id,amount_cents) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (reservation_id) DO NOTHING", [crypto.randomUUID(), reservation.customer_id, reservation.project_id, reservation.id, reservation.amount_cents]);
      await client.query("COMMIT"); return reservation;
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
  async releasePreviewForProject(identity, { projectId }) {
    const customer = await this.customer(identity); const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        "UPDATE preview_credit_reservations SET status='released',updated_at=now() WHERE customer_id=$1 AND project_id=$2 AND status='reserved' RETURNING *",
        [customer.id, projectId]
      );
      for (const reservation of updated.rows) {
        await client.query(
          "INSERT INTO credit_wallet_entries (id,customer_id,project_id,amount_cents,entry_type,idempotency_key) VALUES ($1,$2,$3,$4,'preview_release',$5) ON CONFLICT (idempotency_key) DO NOTHING",
          [crypto.randomUUID(), reservation.customer_id, reservation.project_id, reservation.amount_cents, `release:${reservation.id}`]
        );
      }
      await client.query("COMMIT");
      return { projectId, releasedCount: updated.rows.length };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async deleteProjectEntitlements(identity, { projectId }) {
    await this.customer(identity);
    // PostgreSQL foreign keys preserve ledger history and cascade project-bound
    // reservations/rebates atomically when the project deletion commits.
    return { projectId, deleted: true, managedByDatabase: true };
  }
  async reserveProjectRebate(identity, { projectId, idempotencyKey }) {
    const customer = await this.customer(identity); const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM app_customers WHERE id=$1 FOR UPDATE", [customer.id]);
      const expired = await client.query("UPDATE checkout_credit_reservations SET status='expired',updated_at=now() WHERE customer_id=$1 AND status='reserved' AND expires_at<=now() RETURNING id", [customer.id]);
      if (expired.rows.length) await client.query("UPDATE project_purchase_rebates SET status='available',checkout_reservation_id=NULL,updated_at=now() WHERE checkout_reservation_id=ANY($1::uuid[]) AND status='reserved'", [expired.rows.map((row) => row.id)]);
      const prior = await client.query("SELECT * FROM checkout_credit_reservations WHERE customer_id=$1 AND project_id=$2 AND status='reserved' ORDER BY created_at DESC LIMIT 1", [customer.id, projectId]);
      if (prior.rows[0]) { await client.query("COMMIT"); return { ...prior.rows[0], amountCents: prior.rows[0].amount_cents }; }
      const rebates = await client.query("SELECT id,amount_cents FROM project_purchase_rebates WHERE customer_id=$1 AND project_id=$2 AND status='available' FOR UPDATE", [customer.id, projectId]);
      const amountCents = rebates.rows.reduce((sum, row) => sum + row.amount_cents, 0);
      if (amountCents <= 0) { await client.query("COMMIT"); return { id: "", projectId, amountCents: 0, status: "none" }; }
      const id = crypto.randomUUID();
      const inserted = await client.query("INSERT INTO checkout_credit_reservations (id,customer_id,project_id,amount_cents,idempotency_key,expires_at) VALUES ($1,$2,$3,$4,$5,now()+interval '30 minutes') RETURNING *", [id, customer.id, projectId, amountCents, idempotencyKey]);
      await client.query("UPDATE project_purchase_rebates SET status='reserved',checkout_reservation_id=$1,updated_at=now() WHERE id=ANY($2::uuid[])", [id, rebates.rows.map((row) => row.id)]);
      await client.query("COMMIT"); return { ...inserted.rows[0], amountCents };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async hasActiveCheckoutReservation(identity, { projectId }) {
    const customer = await this.customer(identity);
    const { rowCount } = await this.database.query(
      "SELECT 1 FROM checkout_credit_reservations WHERE customer_id=$1 AND project_id=$2 AND status='reserved' AND expires_at>now() LIMIT 1",
      [customer.id, projectId],
    );
    return rowCount > 0;
  }
  async captureCheckout(reservationId, orderId) {
    if (!reservationId) return null; const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query("UPDATE checkout_credit_reservations SET status='captured',woo_order_id=$2,updated_at=now() WHERE id=$1 AND status='reserved' RETURNING *", [reservationId, orderId]);
      if (updated.rows[0]) await client.query("UPDATE project_purchase_rebates SET status='spent',updated_at=now() WHERE checkout_reservation_id=$1", [reservationId]);
      await client.query("COMMIT"); return updated.rows[0] || null;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async releaseCheckout(reservationId, orderId = null) {
    if (!reservationId) return null; const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query("UPDATE checkout_credit_reservations SET status='released',woo_order_id=COALESCE($2,woo_order_id),updated_at=now() WHERE id=$1 AND status IN ('reserved','captured') RETURNING *", [reservationId, orderId || null]);
      if (updated.rows[0]) await client.query("UPDATE project_purchase_rebates SET status='available',checkout_reservation_id=NULL,updated_at=now() WHERE checkout_reservation_id=$1", [reservationId]);
      await client.query("COMMIT"); return updated.rows[0] || null;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
}

export function createCreditStore(options = {}) { return databaseEnabled() ? new PostgresCreditStore(options.database, options.customerStore) : new JsonCreditStore(options.filePath, options.customerStore); }
export const creditStore = createCreditStore();
