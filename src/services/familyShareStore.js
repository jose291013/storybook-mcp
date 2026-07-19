import crypto from "crypto";
import fs from "fs";
import path from "path";
import { databaseEnabled, getDatabasePool, runDatabaseMigrations } from "./database.js";

const DEFAULT_LOCAL_PATH = path.resolve("data/family-shares.json");
const now = () => new Date().toISOString();
const hashToken = (token) => crypto.createHash("sha256").update(String(token || "")).digest("hex");
const active = (share, timestamp = Date.now()) => !share.revokedAt && Date.parse(share.expiresAt) > timestamp;

function publicShare(share) {
  if (!share) return null;
  const { tokenHash, ...safe } = share;
  return { ...safe, active: active(share) };
}

function fromRow(row) {
  if (!row) return null;
  const date = (value) => value?.toISOString?.() || value || null;
  return {
    id: row.id,
    projectId: row.project_id,
    customerId: row.customer_id,
    tokenHash: row.token_hash,
    expiresAt: date(row.expires_at),
    revokedAt: date(row.revoked_at),
    accessCount: Number(row.access_count || 0),
    lastAccessedAt: date(row.last_accessed_at),
    createdAt: date(row.created_at),
  };
}

export class JsonFamilyShareStore {
  constructor(filePath = DEFAULT_LOCAL_PATH) { this.filePath = path.resolve(filePath); }
  read() {
    if (!fs.existsSync(this.filePath)) return { shares: {} };
    try { return { shares: JSON.parse(fs.readFileSync(this.filePath, "utf8")).shares || {} }; }
    catch { return { shares: {} }; }
  }
  write(store) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2), "utf8");
    fs.renameSync(temporary, this.filePath);
  }
  async initialize() { return { backend: "json", path: this.filePath }; }
  async create({ projectId, customerId, expiresAt }) {
    const store = this.read();
    const token = crypto.randomBytes(32).toString("base64url");
    const share = {
      id: crypto.randomUUID(), projectId, customerId, tokenHash: hashToken(token), expiresAt,
      revokedAt: null, accessCount: 0, lastAccessedAt: null, createdAt: now(),
    };
    store.shares[share.id] = share; this.write(store);
    return { share: publicShare(share), token };
  }
  async list(projectId, customerId) {
    return Object.values(this.read().shares).filter((item) => item.projectId === projectId && item.customerId === customerId)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))).map(publicShare);
  }
  async activeCount(projectId, customerId) {
    return (await this.list(projectId, customerId)).filter((item) => item.active).length;
  }
  async revoke(id, projectId, customerId) {
    const store = this.read(); const share = store.shares[id];
    if (!share || share.projectId !== projectId || share.customerId !== customerId) return null;
    share.revokedAt = share.revokedAt || now(); this.write(store); return publicShare(share);
  }
  async exchange(token) {
    const store = this.read(); const tokenHash = hashToken(token);
    const share = Object.values(store.shares).find((item) => item.tokenHash === tokenHash);
    if (!share || !active(share)) return null;
    share.accessCount += 1; share.lastAccessedAt = now(); this.write(store); return publicShare(share);
  }
  async getActive(id) {
    const share = this.read().shares[id]; return share && active(share) ? publicShare(share) : null;
  }
}

export class PostgresFamilyShareStore {
  constructor(database = getDatabasePool()) { this.database = database; }
  async initialize() { await runDatabaseMigrations(); return { backend: "postgres" }; }
  async create({ projectId, customerId, expiresAt }) {
    const token = crypto.randomBytes(32).toString("base64url");
    const { rows } = await this.database.query(
      `INSERT INTO family_book_shares (id,project_id,customer_id,token_hash,expires_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [crypto.randomUUID(), projectId, customerId, hashToken(token), expiresAt],
    );
    return { share: publicShare(fromRow(rows[0])), token };
  }
  async list(projectId, customerId) {
    const { rows } = await this.database.query(
      "SELECT * FROM family_book_shares WHERE project_id=$1 AND customer_id=$2 ORDER BY created_at DESC",
      [projectId, customerId],
    );
    return rows.map(fromRow).map(publicShare);
  }
  async activeCount(projectId, customerId) {
    const { rows } = await this.database.query(
      "SELECT count(*)::int AS total FROM family_book_shares WHERE project_id=$1 AND customer_id=$2 AND revoked_at IS NULL AND expires_at>now()",
      [projectId, customerId],
    );
    return Number(rows[0]?.total || 0);
  }
  async revoke(id, projectId, customerId) {
    const { rows } = await this.database.query(
      `UPDATE family_book_shares SET revoked_at=COALESCE(revoked_at,now())
       WHERE id=$1 AND project_id=$2 AND customer_id=$3 RETURNING *`,
      [id, projectId, customerId],
    );
    return publicShare(fromRow(rows[0]));
  }
  async exchange(token) {
    const { rows } = await this.database.query(
      `UPDATE family_book_shares SET access_count=access_count+1,last_accessed_at=now()
       WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now() RETURNING *`,
      [hashToken(token)],
    );
    return publicShare(fromRow(rows[0]));
  }
  async getActive(id) {
    const { rows } = await this.database.query(
      "SELECT * FROM family_book_shares WHERE id=$1 AND revoked_at IS NULL AND expires_at>now()",
      [id],
    );
    return publicShare(fromRow(rows[0]));
  }
}

export function createFamilyShareStore({ filePath } = {}) {
  return databaseEnabled() ? new PostgresFamilyShareStore() : new JsonFamilyShareStore(filePath);
}

export const familyShareStore = createFamilyShareStore();
