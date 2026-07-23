import crypto from "crypto";
import fs from "fs";
import path from "path";
import { databaseEnabled, getDatabasePool } from "./database.js";
import { projectStore } from "./projectStore.js";

const LOCAL_PATH = path.resolve("data/preview-revisions.json");
const now = () => new Date().toISOString();

function emptyStore() {
  return { modifications: {}, revisions: {} };
}

function modificationFromRow(row) {
  if (!row) return null;
  const date = (value) => value?.toISOString?.() || value || null;
  return {
    id: row.id,
    projectId: row.project_id,
    customerId: row.customer_id,
    spreadNumber: Number(row.spread_number),
    changeScope: row.change_scope,
    instruction: row.instruction,
    amountCents: Number(row.amount_cents),
    status: row.status,
    reservationId: row.reservation_id || null,
    sourceFingerprint: row.source_fingerprint,
    sourceSnapshot: row.source_snapshot,
    candidateSnapshot: row.candidate_snapshot || null,
    failureCode: row.failure_code || "",
    failureMessage: row.failure_message || "",
    attemptCount: Number(row.attempt_count || 0),
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
    approvedAt: date(row.approved_at),
    rejectedAt: date(row.rejected_at),
  };
}

export class JsonPreviewRevisionStore {
  constructor(filePath = LOCAL_PATH, customerStore = projectStore) {
    this.filePath = path.resolve(filePath);
    this.customerStore = customerStore;
  }
  read() {
    try { return { ...emptyStore(), ...JSON.parse(fs.readFileSync(this.filePath, "utf8")) }; }
    catch { return emptyStore(); }
  }
  write(store) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2), "utf8");
    fs.renameSync(temporary, this.filePath);
  }
  async customer(identity) { return this.customerStore.ensureCustomer(identity); }
  async create(identity, input) {
    const customer = await this.customer(identity);
    const store = this.read();
    const active = Object.values(store.modifications).find((item) => (
      item.projectId === input.projectId && ["reserved", "generating", "awaiting_approval"].includes(item.status)
    ));
    if (active) return { modification: active, created: false };
    const timestamp = now();
    const modification = {
      id: crypto.randomUUID(),
      projectId: input.projectId,
      customerId: customer.id,
      spreadNumber: input.spreadNumber,
      changeScope: input.changeScope,
      instruction: input.instruction,
      amountCents: input.amountCents,
      status: "reserved",
      reservationId: null,
      sourceFingerprint: input.sourceFingerprint,
      sourceSnapshot: input.sourceSnapshot,
      candidateSnapshot: null,
      failureCode: "",
      failureMessage: "",
      attemptCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      approvedAt: null,
      rejectedAt: null,
    };
    store.modifications[modification.id] = modification;
    this.write(store);
    return { modification, created: true };
  }
  async getForCustomer(id, identity) {
    const customer = await this.customer(identity);
    const item = this.read().modifications[id];
    return item?.customerId === customer.id ? item : null;
  }
  async latestForProject(identity, projectId) {
    const customer = await this.customer(identity);
    return Object.values(this.read().modifications)
      .filter((item) => item.projectId === projectId && item.customerId === customer.id)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))[0] || null;
  }
  async activeForProject(projectId) {
    return Object.values(this.read().modifications)
      .filter((item) => item.projectId === projectId && ["reserved", "generating", "awaiting_approval"].includes(item.status))
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))[0] || null;
  }
  async update(id, patch) {
    const store = this.read();
    const current = store.modifications[id];
    if (!current) return null;
    const allowed = [
      "status", "reservationId", "candidateSnapshot", "failureCode", "failureMessage",
      "attemptCount", "approvedAt", "rejectedAt",
    ];
    const safePatch = Object.fromEntries(Object.entries(patch).filter(([key, value]) => allowed.includes(key) && value !== undefined));
    store.modifications[id] = { ...current, ...safePatch, updatedAt: now() };
    this.write(store);
    return store.modifications[id];
  }
  async approve(id, { previewResult, finalBlueprint }) {
    const store = this.read();
    const modification = store.modifications[id];
    if (!modification) return null;
    const revisions = Object.values(store.revisions).filter((item) => item.projectId === modification.projectId);
    revisions.filter((item) => item.status === "current").forEach((item) => { item.status = "superseded"; });
    const current = revisions.find((item) => item.status === "superseded");
    if (!revisions.length) {
      const source = {
        id: crypto.randomUUID(),
        projectId: modification.projectId,
        customerId: modification.customerId,
        parentRevisionId: null,
        sourceModificationId: null,
        revisionNumber: 1,
        status: "superseded",
        blueprintSnapshot: modification.sourceSnapshot.finalBlueprint,
        previewSnapshot: modification.sourceSnapshot.previewResult,
        createdAt: modification.createdAt,
        approvedAt: modification.createdAt,
      };
      store.revisions[source.id] = source;
    }
    const parent = Object.values(store.revisions)
      .filter((item) => item.projectId === modification.projectId)
      .sort((left, right) => right.revisionNumber - left.revisionNumber)[0] || current;
    const revision = {
      id: crypto.randomUUID(),
      projectId: modification.projectId,
      customerId: modification.customerId,
      parentRevisionId: parent?.id || null,
      sourceModificationId: modification.id,
      revisionNumber: Number(parent?.revisionNumber || 0) + 1,
      status: "current",
      blueprintSnapshot: finalBlueprint,
      previewSnapshot: previewResult,
      createdAt: now(),
      approvedAt: now(),
    };
    store.revisions[revision.id] = revision;
    store.modifications[id] = { ...modification, status: "approved", approvedAt: now(), updatedAt: now() };
    this.write(store);
    return { modification: store.modifications[id], revision };
  }
}

export class PostgresPreviewRevisionStore {
  constructor(database = getDatabasePool(), customerStore = projectStore) {
    this.database = database;
    this.customerStore = customerStore;
  }
  async customer(identity) { return this.customerStore.ensureCustomer(identity); }
  async create(identity, input) {
    const customer = await this.customer(identity);
    const id = crypto.randomUUID();
    try {
      const { rows } = await this.database.query(
        `INSERT INTO preview_modifications
         (id,project_id,customer_id,spread_number,change_scope,instruction,amount_cents,status,source_fingerprint,source_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'reserved',$8,$9) RETURNING *`,
        [id, input.projectId, customer.id, input.spreadNumber, input.changeScope, input.instruction,
          input.amountCents, input.sourceFingerprint, JSON.stringify(input.sourceSnapshot)],
      );
      return { modification: modificationFromRow(rows[0]), created: true };
    } catch (error) {
      if (error?.code !== "23505") throw error;
      const active = await this.activeForProject(input.projectId);
      if (!active) throw error;
      return { modification: active, created: false };
    }
  }
  async getForCustomer(id, identity) {
    const customer = await this.customer(identity);
    const { rows } = await this.database.query(
      "SELECT * FROM preview_modifications WHERE id=$1 AND customer_id=$2",
      [id, customer.id],
    );
    return modificationFromRow(rows[0]);
  }
  async latestForProject(identity, projectId) {
    const customer = await this.customer(identity);
    const { rows } = await this.database.query(
      "SELECT * FROM preview_modifications WHERE project_id=$1 AND customer_id=$2 ORDER BY created_at DESC LIMIT 1",
      [projectId, customer.id],
    );
    return modificationFromRow(rows[0]);
  }
  async activeForProject(projectId) {
    const { rows } = await this.database.query(
      "SELECT * FROM preview_modifications WHERE project_id=$1 AND status IN ('reserved','generating','awaiting_approval') ORDER BY created_at DESC LIMIT 1",
      [projectId],
    );
    return modificationFromRow(rows[0]);
  }
  async update(id, patch) {
    const fields = {
      status: "status",
      reservationId: "reservation_id",
      candidateSnapshot: "candidate_snapshot",
      failureCode: "failure_code",
      failureMessage: "failure_message",
      attemptCount: "attempt_count",
      approvedAt: "approved_at",
      rejectedAt: "rejected_at",
    };
    const entries = Object.entries(patch).filter(([key, value]) => fields[key] && value !== undefined);
    if (!entries.length) {
      const { rows } = await this.database.query("SELECT * FROM preview_modifications WHERE id=$1", [id]);
      return modificationFromRow(rows[0]);
    }
    const values = [id];
    const setters = entries.map(([key, value], index) => {
      values.push(["candidateSnapshot"].includes(key) && value != null ? JSON.stringify(value) : value);
      return `${fields[key]}=$${index + 2}`;
    });
    const { rows } = await this.database.query(
      `UPDATE preview_modifications SET ${setters.join(",")},updated_at=now() WHERE id=$1 RETURNING *`,
      values,
    );
    return modificationFromRow(rows[0]);
  }
  async approve(id, { previewResult, finalBlueprint }) {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query("SELECT * FROM preview_modifications WHERE id=$1 FOR UPDATE", [id]);
      const modification = selected.rows[0];
      if (!modification) { await client.query("ROLLBACK"); return null; }
      const prior = await client.query(
        "SELECT * FROM preview_revisions WHERE project_id=$1 ORDER BY revision_number DESC LIMIT 1 FOR UPDATE",
        [modification.project_id],
      );
      let parent = prior.rows[0] || null;
      if (!parent) {
        const inserted = await client.query(
          `INSERT INTO preview_revisions
           (id,project_id,customer_id,revision_number,status,blueprint_snapshot,preview_snapshot,approved_at)
           VALUES ($1,$2,$3,1,'superseded',$4,$5,$6) RETURNING *`,
          [crypto.randomUUID(), modification.project_id, modification.customer_id,
            JSON.stringify(modification.source_snapshot.finalBlueprint),
            JSON.stringify(modification.source_snapshot.previewResult),
            modification.created_at],
        );
        parent = inserted.rows[0];
      } else {
        await client.query("UPDATE preview_revisions SET status='superseded' WHERE project_id=$1 AND status='current'", [modification.project_id]);
      }
      const revision = await client.query(
        `INSERT INTO preview_revisions
         (id,project_id,customer_id,parent_revision_id,source_modification_id,revision_number,status,blueprint_snapshot,preview_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,'current',$7,$8) RETURNING *`,
        [crypto.randomUUID(), modification.project_id, modification.customer_id, parent.id, modification.id,
          Number(parent.revision_number) + 1, JSON.stringify(finalBlueprint), JSON.stringify(previewResult)],
      );
      const updated = await client.query(
        "UPDATE preview_modifications SET status='approved',approved_at=now(),updated_at=now() WHERE id=$1 RETURNING *",
        [id],
      );
      await client.query("COMMIT");
      return { modification: modificationFromRow(updated.rows[0]), revision: revision.rows[0] };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export function createPreviewRevisionStore(options = {}) {
  return databaseEnabled()
    ? new PostgresPreviewRevisionStore(options.database, options.customerStore)
    : new JsonPreviewRevisionStore(options.filePath, options.customerStore);
}

export const previewRevisionStore = createPreviewRevisionStore();
