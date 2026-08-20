import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

let pool;

const MIGRATION_LOCK_KEY = "storybook-mcp-schema-migrations-v1";
const MIGRATION_TABLE = "app_schema_migrations";
const MIGRATION_FILE_RE = /^\d{3}_[a-z0-9_]+\.sql$/;

export function databaseEnabled() {
  return Boolean(String(process.env.DATABASE_URL || "").trim());
}

export function getDatabasePool() {
  if (!databaseEnabled()) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export function databaseMigrationChecksum(contents) {
  return crypto.createHash("sha256").update(String(contents), "utf8").digest("hex");
}

function migrationNumber(filename) {
  return Number.parseInt(String(filename).slice(0, 3), 10);
}

export function inferLegacyMigrationBaseline({
  hasBookProjects = false,
  hasNarrativeArtifacts = false,
  hasNarrativeSteps = false,
  artifactTypeConstraint = "",
} = {}) {
  if (!hasBookProjects) return 0;
  if (!hasNarrativeArtifacts) return 15;

  const constraint = String(artifactTypeConstraint || "");
  const typeMilestones = [
    ["delivery_manifest_v2", 32],
    ["illustration_decision_set_v2", 31],
    ["manuscript_fact_evidence", 30],
    ["world_law_contract", 29],
    ["character_state_timeline", 28],
    ["visual_intent", 27],
    ["visual_continuity_plan", 26],
    ["delivery_manifest", 25],
    ["image_candidate_set", 24],
    ["visual_storyboard", 23],
    ["manuscript", 22],
    ["narrative_book_spec_v3", 21],
    ["object_lifecycle_projection", 20],
    ["narrative_book_spec", 19],
    ["creation_intent", 18],
  ];
  const matched = typeMilestones.find(([artifactType]) => constraint.includes(`'${artifactType}'`));
  if (matched) return matched[1];
  return hasNarrativeSteps ? 17 : 16;
}

function migrationFiles(directory) {
  return fs.readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((filename) => {
      if (!MIGRATION_FILE_RE.test(filename)) {
        throw new Error(`Invalid database migration filename: ${filename}`);
      }
      const contents = fs.readFileSync(path.join(directory, filename), "utf8");
      return { filename, contents, checksum: databaseMigrationChecksum(contents) };
    });
}

async function legacySchemaState(client) {
  const result = await client.query(`
    SELECT
      to_regclass('public.book_projects') IS NOT NULL AS has_book_projects,
      to_regclass('public.narrative_artifacts') IS NOT NULL AS has_narrative_artifacts,
      to_regclass('public.narrative_v3_steps') IS NOT NULL AS has_narrative_steps,
      COALESCE((
        SELECT pg_get_constraintdef(oid)
        FROM pg_constraint
        WHERE conrelid = to_regclass('public.narrative_artifacts')
          AND conname = 'narrative_artifacts_artifact_type_check'
        LIMIT 1
      ), '') AS artifact_type_constraint
  `);
  const row = result.rows[0] || {};
  return {
    hasBookProjects: Boolean(row.has_book_projects),
    hasNarrativeArtifacts: Boolean(row.has_narrative_artifacts),
    hasNarrativeSteps: Boolean(row.has_narrative_steps),
    artifactTypeConstraint: String(row.artifact_type_constraint || ""),
  };
}

async function recordLegacyBaseline(client, files) {
  if (!files.length) return;
  await client.query("BEGIN");
  try {
    for (const migration of files) {
      await client.query(
        `INSERT INTO ${MIGRATION_TABLE} (filename, checksum, baseline)
         VALUES ($1, $2, true)
         ON CONFLICT (filename) DO NOTHING`,
        [migration.filename, migration.checksum],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function applyMigration(client, migration) {
  await client.query("BEGIN");
  try {
    await client.query(migration.contents);
    await client.query(
      `INSERT INTO ${MIGRATION_TABLE} (filename, checksum, baseline)
       VALUES ($1, $2, false)`,
      [migration.filename, migration.checksum],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function runDatabaseMigrations({
  database = getDatabasePool(),
  directory = path.resolve("db/migrations"),
} = {}) {
  if (!database) return { enabled: false, migrations: [], applied: [] };
  const files = migrationFiles(directory);
  const client = await database.connect();
  const appliedThisRun = [];
  let lockAcquired = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK_KEY]);
    lockAcquired = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
        filename text PRIMARY KEY CHECK (filename ~ '^[0-9]{3}_[a-z0-9_]+[.]sql$'),
        checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
        baseline boolean NOT NULL DEFAULT false,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    let appliedResult = await client.query(
      `SELECT filename, checksum FROM ${MIGRATION_TABLE} ORDER BY filename`,
    );
    if (!appliedResult.rows.length) {
      const baselineNumber = inferLegacyMigrationBaseline(await legacySchemaState(client));
      await recordLegacyBaseline(
        client,
        files.filter((migration) => migrationNumber(migration.filename) <= baselineNumber),
      );
      appliedResult = await client.query(
        `SELECT filename, checksum FROM ${MIGRATION_TABLE} ORDER BY filename`,
      );
    }

    const knownFiles = new Map(files.map((migration) => [migration.filename, migration]));
    const applied = new Map(appliedResult.rows.map((row) => [String(row.filename), String(row.checksum)]));
    for (const [filename, checksum] of applied) {
      const migration = knownFiles.get(filename);
      if (!migration) throw new Error(`Applied database migration is missing from the repository: ${filename}`);
      if (migration.checksum !== checksum) throw new Error(`Applied database migration checksum changed: ${filename}`);
    }

    for (const migration of files) {
      if (applied.has(migration.filename)) continue;
      await applyMigration(client, migration);
      appliedThisRun.push(migration.filename);
    }
    return { enabled: true, migrations: files.map((migration) => migration.filename), applied: appliedThisRun };
  } finally {
    if (lockAcquired) {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY]).catch(() => {});
    }
    client.release();
  }
}
