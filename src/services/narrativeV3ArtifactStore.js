import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  CANONICAL_STORY_GRAPH_ID,
  CANONICAL_STORY_GRAPH_VERSION,
  STORY_CONCEPT_ID,
  STORY_CONCEPT_VERSION,
  canonicalStoryGraphDigest,
  loadCanonicalStoryGraph,
  loadStoryConcept,
  storyConceptDigest,
} from "../contracts/narrativeV3Canonical.js";
import {
  CREATION_INTENT_ID,
  CREATION_INTENT_VERSION,
  creationIntentDigest,
  loadCreationIntent,
} from "../contracts/creationIntent.js";
import { databaseEnabled, getDatabasePool } from "./database.js";

const LOCAL_PATH = path.resolve("data/narrative-v3-artifacts.json");
const DIGEST_RE = /^[a-f0-9]{64}$/;
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ARTIFACT_STATES = new Set(["sealed", "accepted", "rejected", "quarantined"]);
const PROMOTABLE_ARTIFACT_STATES = new Set(["sealed", "accepted"]);

const ARTIFACT_DEFINITIONS = Object.freeze({
  creation_intent: Object.freeze({
    contractId: CREATION_INTENT_ID,
    schemaVersion: CREATION_INTENT_VERSION,
    load: loadCreationIntent,
    digest: creationIntentDigest,
    parentTypes: Object.freeze([]),
  }),
  story_concept: Object.freeze({
    contractId: STORY_CONCEPT_ID,
    schemaVersion: STORY_CONCEPT_VERSION,
    load: loadStoryConcept,
    digest: storyConceptDigest,
    parentTypes: Object.freeze(["creation_intent"]),
  }),
  canonical_story_graph: Object.freeze({
    contractId: CANONICAL_STORY_GRAPH_ID,
    schemaVersion: CANONICAL_STORY_GRAPH_VERSION,
    load: loadCanonicalStoryGraph,
    digest: canonicalStoryGraphDigest,
    parentTypes: Object.freeze(["story_concept"]),
  }),
});

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value)) deepFreeze(entry);
  return value;
}

function frozenClone(value) {
  return value == null ? value : deepFreeze(clone(value));
}

function dateValue(value) {
  return value?.toISOString?.() || value || null;
}

function emptyLedger() {
  return { version: 1, artifacts: {}, pointers: {} };
}

function pointerKey(projectId, artifactType) {
  return `${projectId}:${artifactType}`;
}

function cleanIdentifier(value, field, { required = false } = {}) {
  const normalized = String(value || "").trim();
  if ((!normalized && required) || (normalized && !IDENTIFIER_RE.test(normalized))) {
    throw new NarrativeV3ArtifactStoreError("invalid_provenance", `${field} is not a bounded operational identifier.`);
  }
  return normalized;
}

function normalizeProvenance(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NarrativeV3ArtifactStoreError("invalid_provenance", "Artifact provenance must be a bounded object.");
  }
  const allowed = new Set(["producer", "producerVersion", "runId", "stepId", "operationId"]);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length) {
    throw new NarrativeV3ArtifactStoreError("invalid_provenance", "Artifact provenance contains an unsupported field.");
  }
  return {
    producer: cleanIdentifier(value.producer, "producer", { required: true }),
    producerVersion: cleanIdentifier(value.producerVersion, "producerVersion", { required: true }),
    ...(value.runId ? { runId: cleanIdentifier(value.runId, "runId") } : {}),
    ...(value.stepId ? { stepId: cleanIdentifier(value.stepId, "stepId") } : {}),
    ...(value.operationId ? { operationId: cleanIdentifier(value.operationId, "operationId") } : {}),
  };
}

function normalizeParents(parents = []) {
  if (!Array.isArray(parents)) {
    throw new NarrativeV3ArtifactStoreError("invalid_parents", "Artifact parents must be an ordered array.");
  }
  const normalized = parents.map((parent) => ({
    artifactId: String(parent?.artifactId || "").trim(),
    artifactType: String(parent?.artifactType || "").trim(),
    payloadDigest: String(parent?.payloadDigest || "").trim(),
  }));
  if (normalized.some((parent) => !UUID_RE.test(parent.artifactId) || !ARTIFACT_DEFINITIONS[parent.artifactType] || !DIGEST_RE.test(parent.payloadDigest))) {
    throw new NarrativeV3ArtifactStoreError("invalid_parents", "Every artifact parent needs a known type, id and canonical digest.");
  }
  if (new Set(normalized.map((parent) => parent.artifactId)).size !== normalized.length) {
    throw new NarrativeV3ArtifactStoreError("invalid_parents", "An artifact parent may be linked only once.");
  }
  return normalized;
}

function validateArtifactInput(input = {}) {
  const projectId = String(input.projectId || "").trim();
  const artifactType = String(input.artifactType || "").trim();
  const definition = ARTIFACT_DEFINITIONS[artifactType];
  if (!UUID_RE.test(projectId)) throw new NarrativeV3ArtifactStoreError("project_required", "A canonical project UUID is required.");
  if (!definition) throw new NarrativeV3ArtifactStoreError("artifact_type_unsupported", "This artifact type has no strict V3 loader.");
  const payload = definition.load(input.payload);
  if (payload.contractId !== definition.contractId || payload.schemaVersion !== definition.schemaVersion) {
    throw new NarrativeV3ArtifactStoreError("artifact_schema_mismatch", "The artifact type and canonical payload contract do not match.");
  }
  const payloadDigest = definition.digest(payload);
  const parents = normalizeParents(input.parents);
  const expectedParentTypes = definition.parentTypes;
  if (
    parents.length !== expectedParentTypes.length
    || parents.some((parent, index) => parent.artifactType !== expectedParentTypes[index])
  ) {
    throw new NarrativeV3ArtifactStoreError("artifact_parent_contract_invalid", "The artifact does not have its exact ordered parent contract.");
  }
  if (
    artifactType === "canonical_story_graph"
    && parents[0]?.payloadDigest !== payload.sourceConcept.artifactDigest
  ) {
    throw new NarrativeV3ArtifactStoreError("artifact_parent_digest_mismatch", "The graph parent does not match its declared source concept digest.");
  }
  const state = String(input.state || "sealed");
  if (!ARTIFACT_STATES.has(state)) {
    throw new NarrativeV3ArtifactStoreError("artifact_state_invalid", "The artifact state is not supported.");
  }
  const id = String(input.id || crypto.randomUUID());
  if (!UUID_RE.test(id)) throw new NarrativeV3ArtifactStoreError("artifact_id_invalid", "A canonical artifact UUID is required.");
  return {
    id,
    projectId,
    artifactType,
    schemaVersion: definition.schemaVersion,
    payload: clone(payload),
    payloadDigest,
    parents,
    state,
    provenance: normalizeProvenance(input.provenance),
  };
}

function assertStoredParents(input, storedParents) {
  if (storedParents.length !== input.parents.length) {
    throw new NarrativeV3ArtifactStoreError("artifact_parent_missing", "A direct parent is missing from this project ledger.");
  }
  input.parents.forEach((parent, index) => {
    const stored = storedParents[index];
    if (
      (stored.id || stored.artifactId) !== parent.artifactId
      || stored.artifactType !== parent.artifactType
      || stored.payloadDigest !== parent.payloadDigest
      || stored.projectId !== input.projectId
    ) {
      throw new NarrativeV3ArtifactStoreError("artifact_parent_mismatch", "A direct parent id, type, project or digest does not match.");
    }
  });
}

function loadStoredArtifact(record) {
  if (!record) return null;
  const validated = validateArtifactInput({
    id: record.id,
    projectId: record.projectId,
    artifactType: record.artifactType,
    payload: record.payload,
    parents: record.parents,
    state: record.state,
    provenance: record.provenance,
  });
  const revision = Number(record.revision);
  if (
    validated.schemaVersion !== Number(record.schemaVersion)
    || validated.payloadDigest !== record.payloadDigest
    || !Number.isSafeInteger(revision)
    || revision < 1
  ) {
    throw new NarrativeV3ArtifactStoreError("stored_artifact_invalid", "The persisted artifact metadata does not match its canonical payload.");
  }
  return frozenClone({
    ...validated,
    revision,
    createdAt: dateValue(record.createdAt),
  });
}

function loadJsonArtifact(ledger, record) {
  const artifact = loadStoredArtifact(record);
  if (!artifact) return null;
  const storedParents = artifact.parents.map((parent) => ledger.artifacts[parent.artifactId]).filter(Boolean);
  assertStoredParents(artifact, storedParents);
  return artifact;
}

function artifactFromRow(row, parents = []) {
  if (!row) return null;
  return loadStoredArtifact({
    id: row.id,
    projectId: row.project_id,
    artifactType: row.artifact_type,
    schemaVersion: Number(row.schema_version),
    revision: Number(row.revision),
    payload: row.payload,
    payloadDigest: row.payload_digest,
    parents,
    state: row.state,
    provenance: row.provenance || {},
    createdAt: dateValue(row.created_at),
  });
}

function pointerFromRow(row) {
  if (!row) return null;
  return frozenClone({
    projectId: row.project_id,
    artifactType: row.artifact_type,
    artifactId: row.artifact_id,
    artifactDigest: row.artifact_digest,
    artifactRevision: Number(row.artifact_revision),
    pointerRevision: Number(row.pointer_revision),
    updatedAt: dateValue(row.updated_at),
  });
}

export class NarrativeV3ArtifactStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "NarrativeV3ArtifactStoreError";
    this.code = code;
  }
}

export class JsonNarrativeV3ArtifactStore {
  constructor(filePath = LOCAL_PATH) {
    this.filePath = path.resolve(filePath);
  }

  async initialize() {
    return { backend: "json", version: 1 };
  }

  read() {
    try {
      const value = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return { ...emptyLedger(), ...value };
    } catch {
      return emptyLedger();
    }
  }

  write(ledger) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(ledger, null, 2), "utf8");
    fs.renameSync(temporary, this.filePath);
  }

  async createArtifact(rawInput) {
    const input = validateArtifactInput(rawInput);
    const ledger = this.read();
    const existing = Object.values(ledger.artifacts).find((artifact) => (
      artifact.projectId === input.projectId
      && artifact.artifactType === input.artifactType
      && artifact.payloadDigest === input.payloadDigest
    ));
    if (existing) return { artifact: loadJsonArtifact(ledger, existing), created: false };
    if (ledger.artifacts[input.id]) {
      throw new NarrativeV3ArtifactStoreError("artifact_id_conflict", "The requested artifact id already belongs to another immutable payload.");
    }
    const storedParents = input.parents.map((parent) => ledger.artifacts[parent.artifactId]).filter(Boolean);
    assertStoredParents(input, storedParents);
    const revision = Object.values(ledger.artifacts)
      .filter((artifact) => artifact.projectId === input.projectId && artifact.artifactType === input.artifactType)
      .reduce((maximum, artifact) => Math.max(maximum, Number(artifact.revision) || 0), 0) + 1;
    const artifact = {
      ...input,
      revision,
      createdAt: new Date().toISOString(),
    };
    ledger.artifacts[artifact.id] = artifact;
    this.write(ledger);
    return { artifact: loadJsonArtifact(ledger, artifact), created: true };
  }

  async getArtifact(id) {
    const ledger = this.read();
    return loadJsonArtifact(ledger, ledger.artifacts[String(id)] || null);
  }

  async listArtifacts(projectId, artifactType) {
    const ledger = this.read();
    return Object.values(ledger.artifacts)
      .filter((artifact) => artifact.projectId === projectId && (!artifactType || artifact.artifactType === artifactType))
      .sort((left, right) => Number(left.revision) - Number(right.revision))
      .map((artifact) => loadJsonArtifact(ledger, artifact));
  }

  async getCurrentPointer(projectId, artifactType) {
    return frozenClone(this.read().pointers[pointerKey(projectId, artifactType)] || null);
  }

  async promoteArtifact({ projectId, artifactType, artifactId, expectedPointerRevision = 0 } = {}) {
    const ledger = this.read();
    const rawArtifact = ledger.artifacts[String(artifactId)];
    const artifact = loadJsonArtifact(ledger, rawArtifact);
    if (!artifact || artifact.projectId !== projectId || artifact.artifactType !== artifactType) {
      throw new NarrativeV3ArtifactStoreError("artifact_not_promotable", "The artifact does not belong to this project pointer.");
    }
    if (!PROMOTABLE_ARTIFACT_STATES.has(artifact.state)) {
      throw new NarrativeV3ArtifactStoreError("artifact_not_promotable", "A rejected or quarantined artifact cannot become current.");
    }
    const key = pointerKey(projectId, artifactType);
    const current = ledger.pointers[key] || null;
    if (current?.artifactId === artifact.id) {
      return { promoted: true, idempotent: true, pointer: frozenClone(current) };
    }
    const actualRevision = Number(current?.pointerRevision || 0);
    if (!Number.isSafeInteger(expectedPointerRevision) || expectedPointerRevision < 0 || actualRevision !== expectedPointerRevision) {
      return { promoted: false, idempotent: false, pointer: frozenClone(current), reason: "cas_mismatch" };
    }
    if (current && artifact.revision <= current.artifactRevision) {
      return { promoted: false, idempotent: false, pointer: frozenClone(current), reason: "non_monotonic_artifact" };
    }
    const pointer = {
      projectId,
      artifactType,
      artifactId: artifact.id,
      artifactDigest: artifact.payloadDigest,
      artifactRevision: artifact.revision,
      pointerRevision: actualRevision + 1,
      updatedAt: new Date().toISOString(),
    };
    ledger.pointers[key] = pointer;
    this.write(ledger);
    return { promoted: true, idempotent: false, pointer: frozenClone(pointer) };
  }
}

export class PostgresNarrativeV3ArtifactStore {
  constructor(database = getDatabasePool()) {
    this.database = database;
  }

  async initialize() {
    return { backend: "postgres", version: 1 };
  }

  async parentsFor(client, artifactId) {
    const { rows } = await client.query(
      `SELECT parent.id,parent.project_id,parent.artifact_type,parent.payload_digest
       FROM narrative_artifact_parents AS link
       JOIN narrative_artifacts AS parent ON parent.id=link.parent_artifact_id
       WHERE link.child_artifact_id=$1 ORDER BY link.ordinal ASC`,
      [artifactId],
    );
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      artifactType: row.artifact_type,
      payloadDigest: row.payload_digest,
    }));
  }

  async hydrate(client, row) {
    if (!row) return null;
    const storedParents = await this.parentsFor(client, row.id);
    const parents = storedParents.map((parent) => ({
      artifactId: parent.id,
      artifactType: parent.artifactType,
      payloadDigest: parent.payloadDigest,
    }));
    const artifact = artifactFromRow(row, parents);
    assertStoredParents(artifact, storedParents);
    return artifact;
  }

  async createArtifact(rawInput) {
    const input = validateArtifactInput(rawInput);
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const project = await client.query("SELECT id FROM book_projects WHERE id=$1 FOR UPDATE", [input.projectId]);
      if (!project.rows[0]) throw new NarrativeV3ArtifactStoreError("project_not_found", "The artifact project does not exist.");
      const duplicate = await client.query(
        `SELECT * FROM narrative_artifacts
         WHERE project_id=$1 AND artifact_type=$2 AND payload_digest=$3`,
        [input.projectId, input.artifactType, input.payloadDigest],
      );
      if (duplicate.rows[0]) {
        const artifact = await this.hydrate(client, duplicate.rows[0]);
        await client.query("COMMIT");
        return { artifact, created: false };
      }
      const parentResult = input.parents.length
        ? await client.query(
          `SELECT id,project_id,artifact_type,payload_digest FROM narrative_artifacts
           WHERE project_id=$1 AND id=ANY($2::uuid[]) FOR SHARE`,
          [input.projectId, input.parents.map((parent) => parent.artifactId)],
        )
        : { rows: [] };
      const parentsById = new Map(parentResult.rows.map((row) => [row.id, {
        id: row.id,
        projectId: row.project_id,
        artifactType: row.artifact_type,
        payloadDigest: row.payload_digest,
      }]));
      assertStoredParents(input, input.parents.map((parent) => parentsById.get(parent.artifactId)).filter(Boolean));
      const revisionResult = await client.query(
        `SELECT COALESCE(MAX(revision),0)+1 AS revision FROM narrative_artifacts
         WHERE project_id=$1 AND artifact_type=$2`,
        [input.projectId, input.artifactType],
      );
      const revision = Number(revisionResult.rows[0].revision);
      const inserted = await client.query(
        `INSERT INTO narrative_artifacts
         (id,project_id,artifact_type,schema_version,revision,payload,payload_digest,state,provenance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [input.id, input.projectId, input.artifactType, input.schemaVersion, revision,
          JSON.stringify(input.payload), input.payloadDigest, input.state, JSON.stringify(input.provenance)],
      );
      for (const [ordinal, parent] of input.parents.entries()) {
        await client.query(
          `INSERT INTO narrative_artifact_parents
           (child_artifact_id,project_id,ordinal,parent_artifact_id,parent_digest)
           VALUES ($1,$2,$3,$4,$5)`,
          [input.id, input.projectId, ordinal, parent.artifactId, parent.payloadDigest],
        );
      }
      const artifact = await this.hydrate(client, inserted.rows[0]);
      await client.query("COMMIT");
      return { artifact, created: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getArtifact(id) {
    const { rows } = await this.database.query("SELECT * FROM narrative_artifacts WHERE id=$1", [id]);
    return this.hydrate(this.database, rows[0]);
  }

  async listArtifacts(projectId, artifactType) {
    const values = [projectId];
    const typeClause = artifactType ? " AND artifact_type=$2" : "";
    if (artifactType) values.push(artifactType);
    const { rows } = await this.database.query(
      `SELECT * FROM narrative_artifacts WHERE project_id=$1${typeClause} ORDER BY artifact_type,revision ASC`,
      values,
    );
    return Promise.all(rows.map((row) => this.hydrate(this.database, row)));
  }

  async getCurrentPointer(projectId, artifactType) {
    const { rows } = await this.database.query(
      "SELECT * FROM narrative_project_pointers WHERE project_id=$1 AND artifact_type=$2",
      [projectId, artifactType],
    );
    return pointerFromRow(rows[0]);
  }

  async promoteArtifact({ projectId, artifactType, artifactId, expectedPointerRevision = 0 } = {}) {
    if (!Number.isSafeInteger(expectedPointerRevision) || expectedPointerRevision < 0) {
      throw new NarrativeV3ArtifactStoreError("pointer_revision_invalid", "The expected pointer revision must be a non-negative integer.");
    }
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const project = await client.query("SELECT id FROM book_projects WHERE id=$1 FOR UPDATE", [projectId]);
      if (!project.rows[0]) throw new NarrativeV3ArtifactStoreError("project_not_found", "The pointer project does not exist.");
      const artifactResult = await client.query(
        `SELECT * FROM narrative_artifacts
         WHERE id=$1 AND project_id=$2 AND artifact_type=$3`,
        [artifactId, projectId, artifactType],
      );
      const artifact = artifactResult.rows[0];
      if (!artifact) throw new NarrativeV3ArtifactStoreError("artifact_not_promotable", "The artifact does not belong to this project pointer.");
      if (!PROMOTABLE_ARTIFACT_STATES.has(artifact.state)) {
        throw new NarrativeV3ArtifactStoreError("artifact_not_promotable", "A rejected or quarantined artifact cannot become current.");
      }
      const pointerResult = await client.query(
        `SELECT * FROM narrative_project_pointers
         WHERE project_id=$1 AND artifact_type=$2 FOR UPDATE`,
        [projectId, artifactType],
      );
      const current = pointerResult.rows[0] || null;
      if (current?.artifact_id === artifact.id) {
        await client.query("COMMIT");
        return { promoted: true, idempotent: true, pointer: pointerFromRow(current) };
      }
      const actualRevision = Number(current?.pointer_revision || 0);
      if (actualRevision !== expectedPointerRevision) {
        await client.query("COMMIT");
        return { promoted: false, idempotent: false, pointer: pointerFromRow(current), reason: "cas_mismatch" };
      }
      if (current && Number(artifact.revision) <= Number(current.artifact_revision)) {
        await client.query("COMMIT");
        return { promoted: false, idempotent: false, pointer: pointerFromRow(current), reason: "non_monotonic_artifact" };
      }
      const promoted = current
        ? await client.query(
          `UPDATE narrative_project_pointers
           SET artifact_id=$3,artifact_digest=$4,artifact_revision=$5,
               pointer_revision=pointer_revision+1,updated_at=now()
           WHERE project_id=$1 AND artifact_type=$2 AND pointer_revision=$6 RETURNING *`,
          [projectId, artifactType, artifact.id, artifact.payload_digest, Number(artifact.revision), expectedPointerRevision],
        )
        : await client.query(
          `INSERT INTO narrative_project_pointers
           (project_id,artifact_type,artifact_id,artifact_digest,artifact_revision,pointer_revision)
           VALUES ($1,$2,$3,$4,$5,1) ON CONFLICT (project_id,artifact_type) DO NOTHING RETURNING *`,
          [projectId, artifactType, artifact.id, artifact.payload_digest, Number(artifact.revision)],
        );
      if (!promoted.rows[0]) {
        const latest = await client.query(
          "SELECT * FROM narrative_project_pointers WHERE project_id=$1 AND artifact_type=$2",
          [projectId, artifactType],
        );
        await client.query("COMMIT");
        return { promoted: false, idempotent: false, pointer: pointerFromRow(latest.rows[0]), reason: "cas_mismatch" };
      }
      await client.query("COMMIT");
      return { promoted: true, idempotent: false, pointer: pointerFromRow(promoted.rows[0]) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export function createNarrativeV3ArtifactStore(options = {}) {
  return databaseEnabled()
    ? new PostgresNarrativeV3ArtifactStore(options.database)
    : new JsonNarrativeV3ArtifactStore(options.filePath);
}

export const narrativeV3ArtifactStore = createNarrativeV3ArtifactStore();

export { ARTIFACT_DEFINITIONS };
