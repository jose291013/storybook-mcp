import crypto from "crypto";
import fs from "fs";
import path from "path";
import { databaseEnabled, getDatabasePool, runDatabaseMigrations } from "./database.js";

const DEFAULT_LOCAL_PATH = path.resolve("data/projects.json");
const PATCH_FIELDS = new Set([
  "status", "title", "locale", "questionnaire", "photoRefs", "productConfiguration",
  "continuitySnapshot", "finalBlueprint", "previewResult", "generationJobId", "expiresAt",
  "childProfileId", "seriesId", "episodeNumber", "sourceProjectId",
]);
const now = () => new Date().toISOString();
const safePatch = (patch = {}) => Object.fromEntries(Object.entries(patch).filter(([key, value]) => PATCH_FIELDS.has(key) && value !== undefined));
const jsonbParameter = (value) => value == null ? null : JSON.stringify(value);
export function normalizePhotoRefs(value) {
  if (Array.isArray(value)) return value.flatMap((item) => normalizePhotoRefs(item));
  if (!value || typeof value !== "object") return [];
  const nested = Object.values(value).filter((item) => item && typeof item === "object");
  const looksLikePhoto = ["storageKey", "url", "name", "role", "story_role"].some((key) => key in value)
    || ("id" in value && nested.length === 0);
  return looksLikePhoto ? [value] : nested.flatMap((item) => normalizePhotoRefs(item));
}
const deletionFromRow = (row) => row ? {
  id: row.id,
  projectId: row.project_id,
  customerId: row.customer_id,
  assetManifest: row.asset_manifest || {},
  status: row.status,
  lastError: row.last_error || "",
  cleanupAttempts: Number(row.cleanup_attempts || 0),
  nextRetryAt: row.next_retry_at?.toISOString?.() || row.next_retry_at || null,
  lastAttemptAt: row.last_attempt_at?.toISOString?.() || row.last_attempt_at || null,
  createdAt: row.created_at?.toISOString?.() || row.created_at || null,
  updatedAt: row.updated_at?.toISOString?.() || row.updated_at || null,
  completedAt: row.completed_at?.toISOString?.() || row.completed_at || null,
} : null;

function createRecord(input = {}) {
  const createdAt = now();
  const ttlDays = Math.max(1, Number.parseInt(process.env.DRAFT_TTL_DAYS || "7", 10) || 7);
  return {
    id: crypto.randomUUID(), customerId: input.customerId || null, anonymousOwnerHash: input.anonymousOwnerHash || null,
    childProfileId: input.childProfileId || null, seriesId: input.seriesId || null, episodeNumber: input.episodeNumber || null,
    sourceProjectId: input.sourceProjectId || null,
    status: input.status || "draft", title: input.title || "", locale: input.locale || "FR",
    questionnaire: input.questionnaire || {}, photoRefs: normalizePhotoRefs(input.photoRefs),
    productConfiguration: input.productConfiguration || {}, continuitySnapshot: input.continuitySnapshot || {},
    finalBlueprint: input.finalBlueprint || null, previewResult: input.previewResult || null,
    generationJobId: input.generationJobId || null,
    expiresAt: input.expiresAt === null ? null : (input.expiresAt || new Date(Date.now() + ttlDays * 86400000).toISOString()), createdAt, updatedAt: createdAt,
  };
}

export class JsonProjectStore {
  constructor(filePath = DEFAULT_LOCAL_PATH) { this.filePath = path.resolve(filePath); }
  read() {
    if (!fs.existsSync(this.filePath)) return { customers: {}, projects: {}, deletions: {} };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { customers: parsed.customers || {}, projects: parsed.projects || {}, deletions: parsed.deletions || {} };
    } catch { return { customers: {}, projects: {}, deletions: {} }; }
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
  async get(id) {
    const store = this.read();
    const deleted = Object.values(store.deletions).some((item) => item.projectId === id);
    return deleted ? null : (store.projects[id] || null);
  }
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
    const store = this.read();
    const deleted = new Set(Object.values(store.deletions).map((item) => item.projectId));
    return Object.values(store.projects).filter((project) => project.customerId === customer.id && !deleted.has(project.id))
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  }
  async getForCustomer(id, identity) {
    const customer = await this.ensureCustomer(identity);
    const project = await this.get(id);
    return project?.customerId === customer.id ? project : null;
  }
  async updateForCustomer(id, identity, patch) {
    const project = await this.getForCustomer(id, identity);
    return project ? this.update(id, patch) : null;
  }
  async listForSeries(seriesId, customerId) {
    return Object.values(this.read().projects).filter((project) => project.seriesId === seriesId && project.customerId === customerId)
      .sort((left, right) => Number(left.episodeNumber || 0) - Number(right.episodeNumber || 0));
  }
  async findDerivedDraft(sourceProjectId, customerId) {
    return Object.values(this.read().projects).find((project) => (
      project.sourceProjectId === sourceProjectId && project.customerId === customerId
      && !["purchased", "archived"].includes(project.status)
    )) || null;
  }
  async photoStorageKeysReferencedElsewhere(projectId, candidates = []) {
    const wanted = new Set(candidates.filter(Boolean));
    if (!wanted.size) return [];
    const referenced = new Set();
    for (const project of Object.values(this.read().projects)) {
      if (project.id === projectId) continue;
      for (const photo of normalizePhotoRefs(project.photoRefs)) if (wanted.has(photo?.storageKey)) referenced.add(photo.storageKey);
    }
    return [...referenced];
  }
  async prepareDeletion(id, identity, assetManifest = {}) {
    const customer = await this.ensureCustomer(identity); const store = this.read();
    const prior = Object.values(store.deletions).find((item) => item.projectId === id && item.customerId === customer.id);
    if (prior) return { project: null, deletion: prior, alreadyDeleted: true };
    const project = store.projects[id];
    if (!project || project.customerId !== customer.id) return null;
    const timestamp = now();
    const deletion = {
      id: crypto.randomUUID(), projectId: project.id, customerId: customer.id, assetManifest,
      status: "pending", lastError: "", cleanupAttempts: 0, nextRetryAt: timestamp, lastAttemptAt: null,
      createdAt: timestamp, updatedAt: timestamp, completedAt: null,
    };
    store.deletions[deletion.id] = deletion;
    delete store.projects[id];
    this.write(store);
    return { project, deletion, alreadyDeleted: false };
  }
  async claimPendingDeletions({ limit = 10, leaseMs = 120000 } = {}) {
    const store = this.read(); const timestamp = Date.now();
    const pending = Object.values(store.deletions)
      .filter((item) => item.status === "pending" && Date.parse(item.nextRetryAt || item.updatedAt || 0) <= timestamp)
      .sort((left, right) => String(left.nextRetryAt || "").localeCompare(String(right.nextRetryAt || "")))
      .slice(0, Math.max(1, Math.min(50, Number(limit) || 10)));
    for (const deletion of pending) {
      deletion.lastAttemptAt = now();
      deletion.nextRetryAt = new Date(timestamp + Math.max(30000, Number(leaseMs) || 120000)).toISOString();
      deletion.updatedAt = now();
    }
    if (pending.length) this.write(store);
    return pending;
  }
  async recordDeletionCleanup(projectId, { error = "", maxAttempts = 8, retryDelayMs = 60000, customerId = null } = {}) {
    const store = this.read();
    const deletion = Object.values(store.deletions).find((item) => item.projectId === projectId && (!customerId || item.customerId === customerId));
    if (!deletion) return null;
    const failure = String(error || "");
    if (failure) {
      deletion.cleanupAttempts = Number(deletion.cleanupAttempts || 0) + 1;
      deletion.status = deletion.cleanupAttempts >= Math.max(1, Number(maxAttempts) || 8) ? "manual_review" : "pending";
      deletion.lastError = failure;
      deletion.lastAttemptAt = now();
      deletion.nextRetryAt = new Date(Date.now() + Math.max(30000, Number(retryDelayMs) || 60000)).toISOString();
      deletion.completedAt = null;
    } else {
      deletion.status = "completed";
      deletion.lastError = "";
      deletion.completedAt = deletion.completedAt || now();
    }
    deletion.updatedAt = now();
    this.write(store);
    return deletion;
  }
  async completeDeletion(projectId, identity, options = {}) {
    const customer = await this.ensureCustomer(identity); const store = this.read();
    const deletion = Object.values(store.deletions).find((item) => item.projectId === projectId && item.customerId === customer.id);
    if (!deletion) return null;
    return this.recordDeletionCleanup(projectId, { ...options, customerId: customer.id });
  }
}

function fromRow(row) {
  if (!row) return null;
  const date = (value) => value?.toISOString?.() || value || null;
  return {
    id: row.id, customerId: row.customer_id, anonymousOwnerHash: row.anonymous_owner_hash,
    childProfileId: row.child_profile_id, seriesId: row.series_id, episodeNumber: row.episode_number,
    sourceProjectId: row.source_project_id || null,
    status: row.status, title: row.title || "", locale: row.locale || "FR", questionnaire: row.questionnaire || {},
    photoRefs: normalizePhotoRefs(row.photo_refs), productConfiguration: row.product_configuration || {},
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
      `INSERT INTO book_projects (id,customer_id,anonymous_owner_hash,child_profile_id,series_id,episode_number,source_project_id,status,title,locale,
       questionnaire,photo_refs,product_configuration,continuity_snapshot,final_blueprint,preview_result,generation_job_id,expires_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [p.id,p.customerId,p.anonymousOwnerHash,p.childProfileId,p.seriesId,p.episodeNumber,p.sourceProjectId,p.status,p.title,p.locale,jsonbParameter(p.questionnaire),
        jsonbParameter(p.photoRefs),jsonbParameter(p.productConfiguration),jsonbParameter(p.continuitySnapshot),jsonbParameter(p.finalBlueprint),jsonbParameter(p.previewResult),p.generationJobId,p.expiresAt,p.createdAt,p.updatedAt]
    ); return fromRow(rows[0]);
  }
  async get(id) {
    const { rows } = await this.database.query(
      "SELECT project.* FROM book_projects AS project WHERE project.id=$1 AND NOT EXISTS (SELECT 1 FROM project_deletions AS deletion WHERE deletion.project_id=project.id)",
      [id]
    );
    return fromRow(rows[0]);
  }
  async update(id, patch) {
    const existing = await this.get(id); if (!existing) return null; const p = { ...existing, ...safePatch(patch), updatedAt: now() };
    const { rows } = await this.database.query(
      `UPDATE book_projects SET status=$2,title=$3,locale=$4,questionnaire=$5,photo_refs=$6,product_configuration=$7,
       continuity_snapshot=$8,final_blueprint=$9,preview_result=$10,generation_job_id=$11,expires_at=$12,child_profile_id=$13,
       series_id=$14,episode_number=$15,source_project_id=$16,updated_at=$17 WHERE id=$1 RETURNING *`,
      [id,p.status,p.title,p.locale,jsonbParameter(p.questionnaire),jsonbParameter(p.photoRefs),jsonbParameter(p.productConfiguration),jsonbParameter(p.continuitySnapshot),jsonbParameter(p.finalBlueprint),
        jsonbParameter(p.previewResult),p.generationJobId,p.expiresAt,p.childProfileId,p.seriesId,p.episodeNumber,p.sourceProjectId,p.updatedAt]
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
    const { rows } = await this.database.query(
      `SELECT project.* FROM book_projects AS project
       WHERE project.customer_id=$1
       AND NOT EXISTS (
         SELECT 1 FROM project_deletions AS deletion
         WHERE deletion.project_id=project.id AND deletion.customer_id=project.customer_id
       )
       ORDER BY project.updated_at DESC`,
      [customer.id]
    );
    return rows.map(fromRow);
  }
  async getForCustomer(id, identity) {
    const customer = await this.ensureCustomer(identity);
    const { rows } = await this.database.query(
      `SELECT project.* FROM book_projects AS project
       WHERE project.id=$1 AND project.customer_id=$2
       AND NOT EXISTS (
         SELECT 1 FROM project_deletions AS deletion
         WHERE deletion.project_id=project.id AND deletion.customer_id=project.customer_id
       )`,
      [id, customer.id]
    );
    return fromRow(rows[0]);
  }
  async updateForCustomer(id, identity, patch) {
    const project = await this.getForCustomer(id, identity);
    return project ? this.update(id, patch) : null;
  }
  async listForSeries(seriesId, customerId) {
    const { rows } = await this.database.query(
      "SELECT * FROM book_projects WHERE series_id=$1 AND customer_id=$2 ORDER BY episode_number ASC,created_at ASC",
      [seriesId, customerId]
    );
    return rows.map(fromRow);
  }
  async findDerivedDraft(sourceProjectId, customerId) {
    const { rows } = await this.database.query(
      "SELECT * FROM book_projects WHERE source_project_id=$1 AND customer_id=$2 AND status NOT IN ('purchased','archived') ORDER BY created_at DESC LIMIT 1",
      [sourceProjectId, customerId]
    );
    return fromRow(rows[0]);
  }
  async photoStorageKeysReferencedElsewhere(projectId, candidates = []) {
    const wanted = new Set(candidates.filter(Boolean));
    if (!wanted.size) return [];
    const { rows } = await this.database.query("SELECT photo_refs FROM book_projects WHERE id<>$1", [projectId]);
    const referenced = new Set();
    for (const row of rows) for (const photo of normalizePhotoRefs(row.photo_refs)) if (wanted.has(photo?.storageKey)) referenced.add(photo.storageKey);
    return [...referenced];
  }
  async prepareDeletion(id, identity, assetManifest = {}) {
    const customer = await this.ensureCustomer(identity); const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const prior = await client.query("SELECT * FROM project_deletions WHERE project_id=$1 AND customer_id=$2 FOR UPDATE", [id, customer.id]);
      if (prior.rows[0]) {
        await client.query("COMMIT");
        return { project: null, deletion: deletionFromRow(prior.rows[0]), alreadyDeleted: true };
      }
      const selected = await client.query("SELECT * FROM book_projects WHERE id=$1 AND customer_id=$2 FOR UPDATE", [id, customer.id]);
      const project = fromRow(selected.rows[0]);
      if (!project) { await client.query("COMMIT"); return null; }
      if (project.status === "purchased") { await client.query("ROLLBACK"); return { blockedReason: "purchased" }; }
      const protectedRows = await client.query(
        `SELECT EXISTS(SELECT 1 FROM commerce_orders WHERE project_id=$1) AS has_order,
                EXISTS(SELECT 1 FROM series_continuity_facts WHERE source_project_id=$1) AS has_canon`,
        [id]
      );
      if (protectedRows.rows[0]?.has_order) { await client.query("ROLLBACK"); return { blockedReason: "order_exists" }; }
      if (protectedRows.rows[0]?.has_canon) { await client.query("ROLLBACK"); return { blockedReason: "series_canon" }; }
      const deletionId = crypto.randomUUID();
      const inserted = await client.query(
        "INSERT INTO project_deletions (id,project_id,customer_id,asset_manifest) VALUES ($1,$2,$3,$4) RETURNING *",
        [deletionId, id, customer.id, JSON.stringify(assetManifest || {})]
      );
      await client.query("DELETE FROM book_projects WHERE id=$1 AND customer_id=$2", [id, customer.id]);
      await client.query("COMMIT");
      return { project, deletion: deletionFromRow(inserted.rows[0]), alreadyDeleted: false };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async claimPendingDeletions({ limit = 10, leaseMs = 120000 } = {}) {
    const boundedLimit = Math.max(1, Math.min(50, Number(limit) || 10));
    const boundedLease = Math.max(30000, Number(leaseMs) || 120000);
    const { rows } = await this.database.query(
      `WITH candidates AS (
         SELECT id FROM project_deletions
         WHERE status='pending' AND next_retry_at<=now()
         ORDER BY next_retry_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE project_deletions AS deletion
       SET last_attempt_at=now(),next_retry_at=now()+($2 * interval '1 millisecond'),updated_at=now()
       FROM candidates
       WHERE deletion.id=candidates.id
       RETURNING deletion.*`,
      [boundedLimit, boundedLease]
    );
    return rows.map(deletionFromRow);
  }
  async recordDeletionCleanup(projectId, { error = "", maxAttempts = 8, retryDelayMs = 60000, customerId = null } = {}) {
    const failure = String(error || "");
    const boundedAttempts = Math.max(1, Number(maxAttempts) || 8);
    const boundedDelay = Math.max(30000, Number(retryDelayMs) || 60000);
    const { rows } = await this.database.query(
      `UPDATE project_deletions SET
       cleanup_attempts=CASE WHEN $2='' THEN cleanup_attempts ELSE cleanup_attempts+1 END,
       status=CASE WHEN $2='' THEN 'completed'
                   WHEN cleanup_attempts+1 >= $3 THEN 'manual_review'
                   ELSE 'pending' END,
       last_error=$2,
       last_attempt_at=CASE WHEN $2='' THEN last_attempt_at ELSE now() END,
       next_retry_at=CASE WHEN $2='' THEN next_retry_at ELSE now()+($4 * interval '1 millisecond') END,
       updated_at=now(),
       completed_at=CASE WHEN $2='' THEN COALESCE(completed_at,now()) ELSE NULL END
       WHERE project_id=$1 AND ($5::uuid IS NULL OR customer_id=$5) RETURNING *`,
      [projectId, failure, boundedAttempts, boundedDelay, customerId]
    );
    return deletionFromRow(rows[0]);
  }
  async completeDeletion(projectId, identity, options = {}) {
    const customer = await this.ensureCustomer(identity);
    return this.recordDeletionCleanup(projectId, { ...options, customerId: customer.id });
  }
}

export function createProjectStore({ filePath } = {}) {
  return databaseEnabled() ? new PostgresProjectStore() : new JsonProjectStore(filePath);
}
export const projectStore = createProjectStore();
