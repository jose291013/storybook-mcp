import crypto from "crypto";
import fs from "fs";
import path from "path";
import { databaseEnabled, getDatabasePool } from "./database.js";

const DEFAULT_LOCAL_PATH = path.resolve("data/series.json");
const now = () => new Date().toISOString();
const jsonb = (value) => JSON.stringify(value || {});

function localShape(value = {}) {
  return {
    childProfiles: value.childProfiles || {},
    series: value.series || {},
    characters: value.characters || {},
    facts: value.facts || {},
  };
}

export class JsonSeriesStore {
  constructor(filePath = DEFAULT_LOCAL_PATH) { this.filePath = path.resolve(filePath); }
  read() {
    if (!fs.existsSync(this.filePath)) return localShape();
    try { return localShape(JSON.parse(fs.readFileSync(this.filePath, "utf8"))); }
    catch { return localShape(); }
  }
  write(store) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2), "utf8");
    fs.renameSync(temporary, this.filePath);
  }
  async createChildProfile({ customerId, displayName, profileData }) {
    const store = this.read(); const timestamp = now();
    const record = { id: crypto.randomUUID(), customerId, displayName, profileData: profileData || {}, createdAt: timestamp, updatedAt: timestamp };
    store.childProfiles[record.id] = record; this.write(store); return record;
  }
  async getChildProfile(id) { return this.read().childProfiles[id] || null; }
  async createSeries({ customerId, childProfileId, title, memoryData }) {
    const store = this.read(); const timestamp = now();
    const record = { id: crypto.randomUUID(), customerId, childProfileId, title, status: "active", memoryData: memoryData || {}, createdAt: timestamp, updatedAt: timestamp };
    store.series[record.id] = record; this.write(store); return record;
  }
  async getSeries(id) { return this.read().series[id] || null; }
  async addCharacter(input) {
    const store = this.read(); const timestamp = now();
    const record = { id: crypto.randomUUID(), ...input, canonData: input.canonData || {}, createdAt: timestamp, updatedAt: timestamp };
    store.characters[record.id] = record; this.write(store); return record;
  }
  async listCharacters(seriesId) { return Object.values(this.read().characters).filter((item) => item.seriesId === seriesId); }
  async addFact(input) {
    const store = this.read();
    const existing = Object.values(store.facts).find((item) => item.seriesId === input.seriesId && item.sourceProjectId === input.sourceProjectId && item.factKey === input.factKey);
    if (existing) return existing;
    const timestamp = now();
    const record = { id: crypto.randomUUID(), ...input, status: "approved", factData: input.factData || {}, createdAt: timestamp, updatedAt: timestamp };
    store.facts[record.id] = record; this.write(store); return record;
  }
  async hasFactsForProject(projectId) {
    return Object.values(this.read().facts).some((item) => item.sourceProjectId === projectId && item.status === "approved");
  }
}

function profileFromRow(row) {
  if (!row) return null;
  return { id: row.id, customerId: row.customer_id, displayName: row.display_name, profileData: row.profile_data || {} };
}
function seriesFromRow(row) {
  if (!row) return null;
  return { id: row.id, customerId: row.customer_id, childProfileId: row.child_profile_id, title: row.title, status: row.status, memoryData: row.memory_data || {} };
}
function characterFromRow(row) {
  if (!row) return null;
  return { id: row.id, customerId: row.customer_id, childProfileId: row.child_profile_id, seriesId: row.series_id, name: row.name, role: row.role, storyRole: row.story_role, canonData: row.canon_data || {} };
}

export class PostgresSeriesStore {
  constructor(database = getDatabasePool()) { this.database = database; }
  async createChildProfile({ customerId, displayName, profileData }) {
    const { rows } = await this.database.query(
      "INSERT INTO child_profiles (id,customer_id,display_name,profile_data) VALUES ($1,$2,$3,$4) RETURNING *",
      [crypto.randomUUID(), customerId, displayName, jsonb(profileData)]
    );
    return profileFromRow(rows[0]);
  }
  async getChildProfile(id) { const { rows } = await this.database.query("SELECT * FROM child_profiles WHERE id=$1", [id]); return profileFromRow(rows[0]); }
  async createSeries({ customerId, childProfileId, title, memoryData }) {
    const { rows } = await this.database.query(
      "INSERT INTO series (id,customer_id,child_profile_id,title,memory_data) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [crypto.randomUUID(), customerId, childProfileId, title, jsonb(memoryData)]
    );
    return seriesFromRow(rows[0]);
  }
  async getSeries(id) { const { rows } = await this.database.query("SELECT * FROM series WHERE id=$1", [id]); return seriesFromRow(rows[0]); }
  async addCharacter(input) {
    const { rows } = await this.database.query(
      `INSERT INTO character_profiles (id,customer_id,child_profile_id,series_id,name,role,story_role,canon_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [crypto.randomUUID(), input.customerId, input.childProfileId, input.seriesId, input.name, input.role, input.storyRole, jsonb(input.canonData)]
    );
    return characterFromRow(rows[0]);
  }
  async listCharacters(seriesId) {
    const { rows } = await this.database.query("SELECT * FROM character_profiles WHERE series_id=$1 ORDER BY created_at ASC", [seriesId]);
    return rows.map(characterFromRow);
  }
  async addFact(input) {
    const { rows } = await this.database.query(
      `INSERT INTO series_continuity_facts (id,series_id,source_project_id,fact_key,fact_data,status)
       VALUES ($1,$2,$3,$4,$5,'approved')
       ON CONFLICT (series_id,source_project_id,fact_key) DO UPDATE SET fact_data=EXCLUDED.fact_data,updated_at=now()
       RETURNING *`,
      [crypto.randomUUID(), input.seriesId, input.sourceProjectId, input.factKey, jsonb(input.factData)]
    );
    return rows[0];
  }
  async hasFactsForProject(projectId) {
    const { rowCount } = await this.database.query(
      "SELECT 1 FROM series_continuity_facts WHERE source_project_id=$1 AND status='approved' LIMIT 1",
      [projectId]
    );
    return rowCount > 0;
  }
}

export function createSeriesStore({ filePath } = {}) {
  return databaseEnabled() ? new PostgresSeriesStore() : new JsonSeriesStore(filePath);
}

export const seriesStore = createSeriesStore();
