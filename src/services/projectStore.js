import crypto from "crypto";
import fs from "fs";
import path from "path";
import { databaseEnabled, getDatabasePool, runDatabaseMigrations } from "./database.js";

const DEFAULT_LOCAL_PATH = path.resolve("data/projects.json");
const PATCH_FIELDS = new Set([
  "status", "title", "locale", "questionnaire", "photoRefs", "productConfiguration",
  "continuitySnapshot", "finalBlueprint", "previewResult", "generationJobId", "expiresAt",
  "childProfileId", "seriesId", "episodeNumber",
]);
const now = () => new Date().toISOString();
const safePatch = (patch = {}) => Object.fromEntries(Object.entries(patch).filter(([key, value]) => PATCH_FIELDS.has(key) && value !== undefined));

function createRecord(input = {}) {
  const createdAt = now();
  const ttlDays = Math.max(1, Number.parseInt(process.env.DRAFT_TTL_DAYS || "7", 10) || 7);
  return {
    id: crypto.randomUUID(), customerId: input.customerId || null, anonymousOwnerHash: input.anonymousOwnerHash || null,
    childProfileId: input.childProfileId || null, seriesId: input.seriesId || null, episodeNumber: input.episodeNumber || null,
    status: input.status || "draft", title: input.title || "", locale: input.locale || "FR",
    questionnaire: input.questionnaire || {}, photoRefs: Array.isArray(input.photoRefs) ? input.photoRefs : [],
    productConfiguration: input.productConfiguration || {}, continuitySnapshot: input.continuitySnapshot || {},
    finalBlueprint: input.finalBlueprint || null, previewResult: input.previewResult || null,
    generationJobId: input.generationJobId || null,
    expiresAt: input.expiresAt || new Date(Date.now() + ttlDays * 86400000).toISOString(), createdAt, updatedAt: createdAt,
  };
}

export class JsonProjectStore {
  constructor(filePath = DEFAULT_LOCAL_PATH) { this.filePath = path.resolve(filePath); }
  read() {
    if (!fs.existsSync(this.filePath)) return { customers: {}, projects: {} };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { customers: parsed.customers || {}, projects: parsed.projects || {} };
    } catch { return { customers: {}, projects: {} }; }
  }
  write(store) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2), "utf8");
    fs.renameSync(temporary, this.filePath);
  }
  async initialize() { return { backend: "json", path: this.filePath }; }
  async ensureCustomer({ wooCustomerId, email = "" }) {
    const store = this.read();
    const key = String(wooCustomerId);
    const existing = Object.values(store.customers).find((customer) => customer.wooCustomerId === key);
    if (existing) return existing;
    const customer = { id: crypto.randomUUID(), wooCustomerId: key, email, createdAt: now(), updatedAt: now() };
    store.customers[customer.id] = customer; this.write(store); return customer;
  }
  async create(input) {
    const store = this.read(); const project = createRecord(input);
    store.projects[project.id] = project; this.write(store); return project;
  }
  async get(id) { return this.read().projects[id] || null; }
  async update(id, patch) {
    const store = this.read(); const existing = store.projects[id]; if (!existing) return null;
    const project = { ...existing, ...safePatch(patch), updatedAt: now() };
    store.projects[id] = project; this.write(store); return project;
  }
  async claim(id, anonymousOwnerHash, identity) {
    const customer = await this.ensureCustomer(identity); const store = this.read(); const existing = store.projects[id];
    if (!existing || existing.anonymousOwnerHash !== anonymousOwnerHash) return null;
    const project = { ...existing, customerId: customer.id, anonymousOwnerHash: null, expiresAt: null, updatedAt: now() };
    store.projects[id] = project; this.write(store); return project;
  }
  async listForCustomer(identity) {
    const customer = await this.ensureCustomer(identity);
    return Object.values(this.read().projects).filter((project) => project.customerId === customer.id)
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  }
}

function fromRow(row) {
  if (!row) return null;
  const date = (value) => value?.toISOString?.() || value || null;
  return {
    id: row.id, customerId: row.customer_id, anonymousOwnerHash: row.anonymous_owner_hash,
    childProfileId: row.child_profile_id, seriesId: row.series_id, episodeNumber: row.episode_number,
    status: row.status, title: row.title || "", locale: row.locale || "FR", questionnaire: row.questionnaire || {},
    photoRefs: row.photo_refs || [], productConfiguration: row.product_configuration || {},
    continuitySnapshot: row.continuity_snapshot || {}, finalBlueprint: row.final_blueprint,
    previewResult: row.preview_result, generationJobId: row.generation_job_id, expiresAt: date(row.expires_at),
    createdAt: date(row.created_at), updatedAt: date(row.updated_at),
  };
}

export class PostgresProjectStore {
  constructor(database = getDatabasePool()) { this.database = database; }
  async initialize() { await runDatabaseMigrations(); return { backend: "postgres" }; }
  async ensureCustomer({ wooCustomerId, email = "" }) {
    const { rows } = await this.database.query(
      `INSERT INTO app_customers (id, woo_customer_id, email) VALUES ($1,$2,$3)
       ON CONFLICT (woo_customer_id) DO UPDATE SET email=COALESCE(NULLIF(EXCLUDED.email,''),app_customers.email),updated_at=now()
       RETURNING *`, [crypto.randomUUID(), wooCustomerId, email]
    );
    return { id: rows[0].id, wooCustomerId: String(rows[0].woo_customer_id), email: rows[0].email || "" };
  }
  async create(input) {
    const p = createRecord(input);
    const { rows } = await this.database.query(
      `INSERT INTO book_projects (id,customer_id,anonymous_owner_hash,child_profile_id,series_id,episode_number,status,title,locale,
       questionnaire,photo_refs,product_configuration,continuity_snapshot,final_blueprint,preview_result,generation_job_id,expires_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [p.id,p.customerId,p.anonymousOwnerHash,p.childProfileId,p.seriesId,p.episodeNumber,p.status,p.title,p.locale,p.questionnaire,
        p.photoRefs,p.productConfiguration,p.continuitySnapshot,p.finalBlueprint,p.previewResult,p.generationJobId,p.expiresAt,p.createdAt,p.updatedAt]
    ); return fromRow(rows[0]);
  }
  async get(id) { const { rows } = await this.database.query("SELECT * FROM book_projects WHERE id=$1", [id]); return fromRow(rows[0]); }
  async update(id, patch) {
    const existing = await this.get(id); if (!existing) return null; const p = { ...existing, ...safePatch(patch), updatedAt: now() };
    const { rows } = await this.database.query(
      `UPDATE book_projects SET status=$2,title=$3,locale=$4,questionnaire=$5,photo_refs=$6,product_configuration=$7,
       continuity_snapshot=$8,final_blueprint=$9,preview_result=$10,generation_job_id=$11,expires_at=$12,child_profile_id=$13,
       series_id=$14,episode_number=$15,updated_at=$16 WHERE id=$1 RETURNING *`,
      [id,p.status,p.title,p.locale,p.questionnaire,p.photoRefs,p.productConfiguration,p.continuitySnapshot,p.finalBlueprint,
        p.previewResult,p.generationJobId,p.expiresAt,p.childProfileId,p.seriesId,p.episodeNumber,p.updatedAt]
    ); return fromRow(rows[0]);
  }
  async claim(id, ownerHash, identity) {
    const customer = await this.ensureCustomer(identity);
    const { rows } = await this.database.query(
      "UPDATE book_projects SET customer_id=$3,anonymous_owner_hash=NULL,expires_at=NULL,updated_at=now() WHERE id=$1 AND anonymous_owner_hash=$2 RETURNING *",
      [id, ownerHash, customer.id]
    ); return fromRow(rows[0]);
  }
  async listForCustomer(identity) {
    const customer = await this.ensureCustomer(identity);
    const { rows } = await this.database.query("SELECT * FROM book_projects WHERE customer_id=$1 ORDER BY updated_at DESC", [customer.id]);
    return rows.map(fromRow);
  }
}

export function createProjectStore({ filePath } = {}) {
  return databaseEnabled() ? new PostgresProjectStore() : new JsonProjectStore(filePath);
}
export const projectStore = createProjectStore();
