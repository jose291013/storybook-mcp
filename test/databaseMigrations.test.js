import assert from "node:assert/strict";
import test from "node:test";

import {
  databaseMigrationChecksum,
  inferLegacyMigrationBaseline,
  runDatabaseMigrations,
} from "../src/services/database.js";

class FakeMigrationClient {
  constructor({
    hasBookProjects = true,
    hasNarrativeArtifacts = true,
    hasNarrativeSteps = true,
    constraint = "",
  } = {}) {
    this.hasBookProjects = hasBookProjects;
    this.hasNarrativeArtifacts = hasNarrativeArtifacts;
    this.hasNarrativeSteps = hasNarrativeSteps;
    this.constraint = constraint;
    this.applied = new Map();
    this.executedMigrationSql = [];
    this.released = false;
  }

  async query(sql, values = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (normalized.startsWith("SELECT filename, checksum FROM app_schema_migrations")) {
      return { rows: [...this.applied].sort(([left], [right]) => left.localeCompare(right)).map(([filename, checksum]) => ({ filename, checksum })) };
    }
    if (normalized.includes("to_regclass('public.book_projects') IS NOT NULL")) {
      return { rows: [{
        has_book_projects: this.hasBookProjects,
        has_narrative_artifacts: this.hasNarrativeArtifacts,
        has_narrative_steps: this.hasNarrativeSteps,
        artifact_type_constraint: this.constraint,
      }] };
    }
    if (normalized.startsWith("INSERT INTO app_schema_migrations")) {
      this.applied.set(String(values[0]), String(values[1]));
      return { rowCount: 1, rows: [] };
    }
    if (normalized.includes("ALTER TABLE narrative_artifacts")) this.executedMigrationSql.push(String(sql));
    return { rows: [], rowCount: 0 };
  }

  release() {
    this.released = true;
  }
}

class FakeMigrationPool {
  constructor(client) {
    this.client = client;
  }

  async connect() {
    return this.client;
  }
}

test("legacy migration baseline is inferred from the schema that really reached production", () => {
  assert.equal(inferLegacyMigrationBaseline({}), 0);
  assert.equal(inferLegacyMigrationBaseline({ hasBookProjects: true }), 15);
  assert.equal(inferLegacyMigrationBaseline({ hasBookProjects: true, hasNarrativeArtifacts: true }), 16);
  assert.equal(inferLegacyMigrationBaseline({ hasBookProjects: true, hasNarrativeArtifacts: true, hasNarrativeSteps: true }), 17);
  assert.equal(inferLegacyMigrationBaseline({
    hasBookProjects: true,
    hasNarrativeArtifacts: true,
    hasNarrativeSteps: true,
    artifactTypeConstraint: "CHECK ((artifact_type = ANY (ARRAY['creation_intent', 'delivery_manifest'])))",
  }), 25);
  assert.equal(inferLegacyMigrationBaseline({
    hasBookProjects: true,
    hasNarrativeArtifacts: true,
    hasNarrativeSteps: true,
    artifactTypeConstraint: "CHECK ((artifact_type = ANY (ARRAY['delivery_manifest', 'visual_continuity_plan'])))",
  }), 26);
});

test("migration checksums bind the exact immutable SQL", () => {
  assert.equal(databaseMigrationChecksum("SELECT 1;"), databaseMigrationChecksum("SELECT 1;"));
  assert.notEqual(databaseMigrationChecksum("SELECT 1;"), databaseMigrationChecksum("SELECT 2;"));
});

test("an existing pre-ledger production database baselines 001-025 and applies only 026 once", async () => {
  const client = new FakeMigrationClient({
    constraint: "CHECK ((artifact_type = ANY (ARRAY['creation_intent', 'delivery_manifest'])))",
  });
  const database = new FakeMigrationPool(client);
  const first = await runDatabaseMigrations({ database });

  assert.deepEqual(first.applied, ["026_narrative_v3_visual_continuity_plan.sql"]);
  assert.equal(client.applied.size, 26);
  assert.equal(client.executedMigrationSql.length, 1);
  assert.match(client.executedMigrationSql[0], /visual_continuity_plan/);
  assert.doesNotMatch(client.executedMigrationSql[0], /CHECK \(artifact_type IN \('creation_intent','story_concept','canonical_story_graph'\)\)/);

  client.executedMigrationSql.length = 0;
  client.released = false;
  const replay = await runDatabaseMigrations({ database });
  assert.deepEqual(replay.applied, []);
  assert.equal(client.executedMigrationSql.length, 0);
  assert.equal(client.released, true);
});

test("a genuinely fresh database applies every migration exactly once", async () => {
  const client = new FakeMigrationClient({
    hasBookProjects: false,
    hasNarrativeArtifacts: false,
    hasNarrativeSteps: false,
  });
  const result = await runDatabaseMigrations({ database: new FakeMigrationPool(client) });
  assert.equal(result.applied.length, 26);
  assert.equal(result.applied[0], "001_product_foundation.sql");
  assert.equal(result.applied.at(-1), "026_narrative_v3_visual_continuity_plan.sql");
  assert.equal(client.applied.size, 26);
});

test("an applied migration whose SQL changed fails closed before any pending migration", async () => {
  const client = new FakeMigrationClient();
  client.applied.set("001_product_foundation.sql", "0".repeat(64));
  await assert.rejects(
    runDatabaseMigrations({ database: new FakeMigrationPool(client) }),
    /Applied database migration checksum changed: 001_product_foundation[.]sql/,
  );
  assert.equal(client.executedMigrationSql.length, 0);
  assert.equal(client.released, true);
});
