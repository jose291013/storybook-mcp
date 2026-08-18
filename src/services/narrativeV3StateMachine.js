import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalDigest } from "../contracts/narrativeV3Canonical.js";
import { databaseEnabled, getDatabasePool } from "./database.js";
import { narrativeV3ArtifactStore } from "./narrativeV3ArtifactStore.js";

const LOCAL_PATH = path.resolve("data/narrative-v3-runs.json");
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const DIGEST_RE = /^[a-f0-9]{64}$/;
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STEP_TYPES = Object.freeze({
  parse_story_concept: "story_concept",
  compile_story_graph: "canonical_story_graph",
  compile_object_lifecycle: "object_lifecycle_projection",
  release_narrative_book_spec: "narrative_book_spec",
  release_narrative_book_spec_v3: "narrative_book_spec_v3",
  write_manuscript: "manuscript",
  compile_visual_storyboard: "visual_storyboard",
});
const STEP_INPUT_TYPES = Object.freeze({
  parse_story_concept: Object.freeze(["creation_intent"]),
  compile_story_graph: Object.freeze(["story_concept"]),
  compile_object_lifecycle: Object.freeze(["canonical_story_graph"]),
  release_narrative_book_spec: Object.freeze(["creation_intent", "canonical_story_graph"]),
  release_narrative_book_spec_v3: Object.freeze(["creation_intent", "canonical_story_graph", "object_lifecycle_projection"]),
  write_manuscript: Object.freeze(["narrative_book_spec_v3"]),
  compile_visual_storyboard: Object.freeze(["narrative_book_spec_v3", "manuscript"]),
});

function now() {
  return new Date().toISOString();
}

function frozenClone(value) {
  const copy = structuredClone(value);
  const freeze = (entry) => {
    if (!entry || typeof entry !== "object" || Object.isFrozen(entry)) return entry;
    Object.freeze(entry);
    Object.values(entry).forEach(freeze);
    return entry;
  };
  return freeze(copy);
}

function emptyState() {
  return { version: 1, runs: {}, steps: {}, commits: {} };
}

function validateKey(value, label) {
  const result = String(value || "").trim();
  if (!KEY_RE.test(result)) throw new NarrativeV3StateError("invalid_identifier", `${label} is not a bounded operational identifier.`);
  return result;
}

function normalizeInputs(inputs = []) {
  if (!Array.isArray(inputs)) throw new NarrativeV3StateError("invalid_step_inputs", "Step inputs must be ordered.");
  const normalized = inputs.map((entry) => ({
    artifactId: String(entry?.artifactId || ""),
    artifactType: String(entry?.artifactType || ""),
    artifactDigest: String(entry?.artifactDigest || ""),
  }));
  if (normalized.some((entry) => !UUID_RE.test(entry.artifactId) || !DIGEST_RE.test(entry.artifactDigest))) {
    throw new NarrativeV3StateError("invalid_step_inputs", "Every step input needs one canonical artifact UUID and digest.");
  }
  return normalized;
}

function normalizeRun(input = {}) {
  const projectId = String(input.projectId || "");
  if (!UUID_RE.test(projectId)) throw new NarrativeV3StateError("project_required", "A canonical project UUID is required.");
  const runKey = validateKey(input.runKey, "runKey");
  if (!Array.isArray(input.steps) || !input.steps.length) throw new NarrativeV3StateError("steps_required", "At least one V3 step is required.");
  const runId = String(input.id || crypto.randomUUID());
  if (!UUID_RE.test(runId)) throw new NarrativeV3StateError("run_id_invalid", "A canonical V3 run UUID is required.");
  const steps = input.steps.map((step, index) => {
    const stepType = String(step?.stepType || "");
    if (!STEP_TYPES[stepType]) throw new NarrativeV3StateError("step_type_unsupported", "The step type has no strict artifact output.");
    const inputs = normalizeInputs(step.inputs);
    const expectedInputs = STEP_INPUT_TYPES[stepType];
    if (inputs.length !== expectedInputs.length || inputs.some((entry, inputIndex) => entry.artifactType !== expectedInputs[inputIndex])) {
      throw new NarrativeV3StateError("invalid_step_inputs", "The step does not have its exact ordered artifact inputs.");
    }
    const stepId = String(step.id || crypto.randomUUID());
    const expectedPointerRevision = Number(step.expectedPointerRevision || 0);
    if (!UUID_RE.test(stepId)) throw new NarrativeV3StateError("step_id_invalid", "A canonical V3 step UUID is required.");
    if (!Number.isSafeInteger(expectedPointerRevision) || expectedPointerRevision < 0) {
      throw new NarrativeV3StateError("pointer_revision_invalid", "The expected pointer revision must be a non-negative integer.");
    }
    return {
      id: stepId,
      sequence: index + 1,
      stepKey: validateKey(step.stepKey, "stepKey"),
      stepType,
      outputArtifactType: STEP_TYPES[stepType],
      expectedPointerRevision,
      inputFingerprint: canonicalDigest(inputs),
      inputs,
      maxAttempts: Math.max(1, Math.min(3, Number(step.maxAttempts) || 2)),
    };
  });
  if (new Set(steps.map((step) => step.stepKey)).size !== steps.length) {
    throw new NarrativeV3StateError("duplicate_step_key", "Step keys must be unique within one run.");
  }
  return { id: runId, projectId, runKey, steps };
}

export class NarrativeV3StateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "NarrativeV3StateError";
    this.code = code;
  }
}

export class JsonNarrativeV3RunStore {
  constructor(filePath = LOCAL_PATH) {
    this.filePath = path.resolve(filePath);
  }

  read() {
    try { return { ...emptyState(), ...JSON.parse(fs.readFileSync(this.filePath, "utf8")) }; }
    catch { return emptyState(); }
  }

  write(state) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(temporary, this.filePath);
  }

  async enqueue(rawInput) {
    const input = normalizeRun(rawInput);
    const state = this.read();
    const existing = Object.values(state.runs).find((run) => run.projectId === input.projectId && run.runKey === input.runKey);
    if (existing) return { run: frozenClone(existing), created: false };
    const timestamp = now();
    const run = { id: input.id, projectId: input.projectId, runKey: input.runKey, pipelineVersion: 1, status: "queued", errorCode: "", createdAt: timestamp, updatedAt: timestamp, completedAt: null };
    state.runs[run.id] = run;
    for (const step of input.steps) {
      state.steps[step.id] = { ...step, runId: run.id, projectId: run.projectId, status: "queued", attemptCount: 0, leaseOwner: "", leaseExpiresAt: null, providerResponseId: "", errorCode: "", createdAt: timestamp, updatedAt: timestamp, completedAt: null };
    }
    this.write(state);
    return { run: frozenClone(run), created: true };
  }

  async getRun(id) { return frozenClone(this.read().runs[id] || null); }
  async getStep(id) { return frozenClone(this.read().steps[id] || null); }
  async listSteps(runId) {
    return Object.values(this.read().steps).filter((step) => step.runId === runId).sort((a, b) => a.sequence - b.sequence).map(frozenClone);
  }

  async claimNext({ workerId, leaseMs = 120000 }) {
    const state = this.read();
    const worker = validateKey(workerId, "workerId");
    const timestamp = Date.now();
    const candidates = Object.values(state.steps).filter((step) => {
      if (step.status === "completed" || step.status === "failed" || step.status === "cancelled") return false;
      if (step.attemptCount >= step.maxAttempts) return false;
      if (step.status === "running" && Date.parse(step.leaseExpiresAt || 0) > timestamp) return false;
      return !Object.values(state.steps).some((prior) => prior.runId === step.runId && prior.sequence < step.sequence && prior.status !== "completed");
    }).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.sequence - b.sequence);
    const step = candidates[0];
    if (!step) return null;
    step.status = "running";
    step.leaseOwner = worker;
    step.leaseExpiresAt = new Date(timestamp + Math.max(30000, Number(leaseMs) || 120000)).toISOString();
    step.attemptCount += 1;
    step.updatedAt = now();
    state.runs[step.runId].status = "running";
    state.runs[step.runId].updatedAt = now();
    this.write(state);
    return frozenClone(step);
  }

  async checkpointProvider(stepId, workerId, providerResponseId) {
    const state = this.read();
    const step = state.steps[stepId];
    if (!step || step.status !== "running" || step.leaseOwner !== workerId) return null;
    const providerId = validateKey(providerResponseId, "providerResponseId");
    if (step.providerResponseId && step.providerResponseId !== providerId) {
      throw new NarrativeV3StateError("provider_response_conflict", "A logical step cannot start a second provider response.");
    }
    step.providerResponseId = providerId;
    step.updatedAt = now();
    this.write(state);
    return frozenClone(step);
  }

  async heartbeat(stepId, workerId, leaseMs = 120000) {
    const state = this.read();
    const step = state.steps[stepId];
    if (!step || step.status !== "running" || step.leaseOwner !== workerId) return null;
    step.leaseExpiresAt = new Date(Date.now() + Math.max(30000, Number(leaseMs) || 120000)).toISOString();
    step.updatedAt = now();
    this.write(state);
    return frozenClone(step);
  }

  async complete(stepId, workerId, commit) {
    const state = this.read();
    const step = state.steps[stepId];
    const existing = state.commits[stepId];
    if (existing) {
      if (existing.artifactId !== commit.artifactId || existing.artifactDigest !== commit.artifactDigest) {
        throw new NarrativeV3StateError("step_commit_conflict", "A completed step cannot point to a second artifact.");
      }
      return { step: frozenClone(step), commit: frozenClone(existing), completed: false };
    }
    if (!step || step.status !== "running" || step.leaseOwner !== workerId) return null;
    const saved = { ...commit, stepId, projectId: step.projectId, committedAt: now() };
    state.commits[stepId] = saved;
    step.status = "completed";
    step.completedAt = now();
    step.leaseOwner = "";
    step.leaseExpiresAt = null;
    step.updatedAt = now();
    const remaining = Object.values(state.steps).some((candidate) => candidate.runId === step.runId && candidate.status !== "completed");
    if (!remaining) {
      state.runs[step.runId].status = "completed";
      state.runs[step.runId].completedAt = now();
      state.runs[step.runId].updatedAt = now();
    }
    this.write(state);
    return { step: frozenClone(step), commit: frozenClone(saved), completed: true };
  }
}

export class PostgresNarrativeV3RunStore {
  constructor(database = getDatabasePool()) { this.database = database; }

  async enqueue(rawInput) {
    const input = normalizeRun(rawInput);
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const project = await client.query("SELECT id FROM book_projects WHERE id=$1 FOR UPDATE", [input.projectId]);
      if (!project.rows[0]) throw new NarrativeV3StateError("project_not_found", "The V3 run project does not exist.");
      const inserted = await client.query(
        `INSERT INTO narrative_v3_runs (id,project_id,run_key,pipeline_version)
         VALUES ($1,$2,$3,1) ON CONFLICT (project_id,run_key) DO NOTHING RETURNING *`,
        [input.id, input.projectId, input.runKey],
      );
      if (!inserted.rows[0]) {
        const existing = await client.query("SELECT * FROM narrative_v3_runs WHERE project_id=$1 AND run_key=$2", [input.projectId, input.runKey]);
        await client.query("COMMIT");
        return { run: this.runFromRow(existing.rows[0]), created: false };
      }
      for (const step of input.steps) {
        await client.query(
          `INSERT INTO narrative_v3_steps
           (id,run_id,project_id,sequence,step_key,step_type,output_artifact_type,
            expected_pointer_revision,input_fingerprint,max_attempts)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [step.id, input.id, input.projectId, step.sequence, step.stepKey, step.stepType,
            step.outputArtifactType, step.expectedPointerRevision, step.inputFingerprint, step.maxAttempts],
        );
        for (const [ordinal, artifact] of step.inputs.entries()) {
          await client.query(
            `INSERT INTO narrative_v3_step_inputs
             (step_id,project_id,ordinal,artifact_id,artifact_type,artifact_digest)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [step.id, input.projectId, ordinal, artifact.artifactId, artifact.artifactType, artifact.artifactDigest],
          );
        }
      }
      await client.query("COMMIT");
      return { run: this.runFromRow(inserted.rows[0]), created: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  runFromRow(row) {
    if (!row) return null;
    return frozenClone({ id: row.id, projectId: row.project_id, runKey: row.run_key, pipelineVersion: Number(row.pipeline_version), status: row.status, errorCode: row.error_code || "", createdAt: row.created_at?.toISOString?.() || row.created_at, updatedAt: row.updated_at?.toISOString?.() || row.updated_at, completedAt: row.completed_at?.toISOString?.() || row.completed_at || null });
  }

  async stepFromRow(row) {
    if (!row) return null;
    const { rows } = await this.database.query(
      `SELECT artifact_id,artifact_type,artifact_digest FROM narrative_v3_step_inputs
       WHERE step_id=$1 ORDER BY ordinal`,
      [row.id],
    );
    return frozenClone({ id: row.id, runId: row.run_id, projectId: row.project_id, sequence: Number(row.sequence), stepKey: row.step_key, stepType: row.step_type, outputArtifactType: row.output_artifact_type, expectedPointerRevision: Number(row.expected_pointer_revision), inputFingerprint: row.input_fingerprint, inputs: rows.map((input) => ({ artifactId: input.artifact_id, artifactType: input.artifact_type, artifactDigest: input.artifact_digest })), status: row.status, attemptCount: Number(row.attempt_count), maxAttempts: Number(row.max_attempts), leaseOwner: row.lease_owner || "", leaseExpiresAt: row.lease_expires_at?.toISOString?.() || row.lease_expires_at || null, providerResponseId: row.provider_response_id || "", errorCode: row.error_code || "", createdAt: row.created_at?.toISOString?.() || row.created_at, updatedAt: row.updated_at?.toISOString?.() || row.updated_at, completedAt: row.completed_at?.toISOString?.() || row.completed_at || null });
  }

  async getRun(id) {
    const { rows } = await this.database.query("SELECT * FROM narrative_v3_runs WHERE id=$1", [id]);
    return this.runFromRow(rows[0]);
  }

  async getStep(id) {
    const { rows } = await this.database.query("SELECT * FROM narrative_v3_steps WHERE id=$1", [id]);
    return this.stepFromRow(rows[0]);
  }

  async listSteps(runId) {
    const { rows } = await this.database.query("SELECT * FROM narrative_v3_steps WHERE run_id=$1 ORDER BY sequence", [runId]);
    return Promise.all(rows.map((row) => this.stepFromRow(row)));
  }

  async claimNext({ workerId, leaseMs = 120000 }) {
    const { rows } = await this.database.query(
      `WITH candidate AS (
         SELECT step.id FROM narrative_v3_steps AS step
         WHERE step.status IN ('queued','running','waiting_provider')
           AND (step.status<>'running' OR step.lease_expires_at<=now())
           AND step.attempt_count<step.max_attempts
           AND NOT EXISTS (
             SELECT 1 FROM narrative_v3_steps AS prior
             WHERE prior.run_id=step.run_id AND prior.sequence<step.sequence AND prior.status<>'completed'
           )
         ORDER BY step.created_at,step.sequence FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE narrative_v3_steps AS step
       SET status='running',lease_owner=$1,
           lease_expires_at=now()+($2 * interval '1 millisecond'),
           attempt_count=step.attempt_count+1,updated_at=now()
       FROM candidate WHERE step.id=candidate.id RETURNING step.*`,
      [validateKey(workerId, "workerId"), Math.max(30000, Number(leaseMs) || 120000)],
    );
    if (!rows[0]) return null;
    await this.database.query("UPDATE narrative_v3_runs SET status='running',updated_at=now() WHERE id=$1 AND status='queued'", [rows[0].run_id]);
    return this.stepFromRow(rows[0]);
  }

  async checkpointProvider(stepId, workerId, providerResponseId) {
    const providerId = validateKey(providerResponseId, "providerResponseId");
    const { rows } = await this.database.query(
      `UPDATE narrative_v3_steps SET provider_response_id=$3,updated_at=now()
       WHERE id=$1 AND status='running' AND lease_owner=$2
         AND (provider_response_id='' OR provider_response_id=$3) RETURNING *`,
      [stepId, workerId, providerId],
    );
    if (rows[0]) return this.stepFromRow(rows[0]);
    const current = await this.database.query("SELECT * FROM narrative_v3_steps WHERE id=$1", [stepId]);
    if (
      current.rows[0]?.status === "running"
      && current.rows[0]?.lease_owner === workerId
      && current.rows[0]?.provider_response_id
      && current.rows[0].provider_response_id !== providerId
    ) {
      throw new NarrativeV3StateError("provider_response_conflict", "A logical step cannot start a second provider response.");
    }
    return null;
  }

  async heartbeat(stepId, workerId, leaseMs = 120000) {
    const { rows } = await this.database.query(
      `UPDATE narrative_v3_steps
       SET lease_expires_at=now()+($3 * interval '1 millisecond'),updated_at=now()
       WHERE id=$1 AND status='running' AND lease_owner=$2 RETURNING *`,
      [stepId, workerId, Math.max(30000, Number(leaseMs) || 120000)],
    );
    return this.stepFromRow(rows[0]);
  }

  async complete(stepId, workerId, commit) {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query("SELECT * FROM narrative_v3_steps WHERE id=$1 FOR UPDATE", [stepId]);
      const step = locked.rows[0];
      const prior = await client.query("SELECT * FROM narrative_v3_step_commits WHERE step_id=$1", [stepId]);
      if (prior.rows[0]) {
        if (prior.rows[0].artifact_id !== commit.artifactId || prior.rows[0].artifact_digest !== commit.artifactDigest) {
          throw new NarrativeV3StateError("step_commit_conflict", "A completed step cannot point to a second artifact.");
        }
        await client.query("COMMIT");
        return { step: await this.getStep(stepId), commit: prior.rows[0], completed: false };
      }
      if (!step || step.status !== "running" || step.lease_owner !== workerId) {
        await client.query("ROLLBACK");
        return null;
      }
      const saved = await client.query(
        `INSERT INTO narrative_v3_step_commits
         (step_id,project_id,artifact_id,artifact_type,artifact_digest,artifact_revision,pointer_revision)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [stepId, step.project_id, commit.artifactId, commit.artifactType, commit.artifactDigest, commit.artifactRevision, commit.pointerRevision],
      );
      const completed = await client.query(
        `UPDATE narrative_v3_steps SET status='completed',completed_at=now(),
         lease_owner=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1 RETURNING *`,
        [stepId],
      );
      const remaining = await client.query("SELECT 1 FROM narrative_v3_steps WHERE run_id=$1 AND status<>'completed' LIMIT 1", [step.run_id]);
      if (!remaining.rows[0]) await client.query("UPDATE narrative_v3_runs SET status='completed',completed_at=now(),updated_at=now() WHERE id=$1", [step.run_id]);
      await client.query("COMMIT");
      return { step: await this.stepFromRow(completed.rows[0]), commit: saved.rows[0], completed: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export class NarrativeV3StateMachine {
  constructor({ runStore, artifactStore = narrativeV3ArtifactStore } = {}) {
    this.runStore = runStore || (databaseEnabled() ? new PostgresNarrativeV3RunStore() : new JsonNarrativeV3RunStore());
    this.artifactStore = artifactStore;
  }

  async enqueue(input) {
    for (const step of input.steps || []) {
      for (const expected of step.inputs || []) {
        const artifact = await this.artifactStore.getArtifact(expected.artifactId);
        if (!artifact || artifact.projectId !== input.projectId || artifact.artifactType !== expected.artifactType || artifact.payloadDigest !== expected.artifactDigest) {
          throw new NarrativeV3StateError("step_input_mismatch", "A V3 step input does not match an immutable project artifact.");
        }
      }
    }
    return this.runStore.enqueue(input);
  }

  async commitArtifact({ stepId, workerId, artifact }) {
    const step = await this.runStore.getStep(stepId);
    if (!step || step.status !== "running" || step.leaseOwner !== workerId) {
      throw new NarrativeV3StateError("step_lease_lost", "Only the current step lease owner may commit an artifact.");
    }
    const created = await this.artifactStore.createArtifact({
      ...artifact,
      projectId: step.projectId,
      artifactType: step.outputArtifactType,
      parents: step.inputs.map((input) => ({
        artifactId: input.artifactId,
        artifactType: input.artifactType,
        payloadDigest: input.artifactDigest,
      })),
    });
    const promotion = await this.artifactStore.promoteArtifact({
      projectId: step.projectId,
      artifactType: step.outputArtifactType,
      artifactId: created.artifact.id,
      expectedPointerRevision: step.expectedPointerRevision,
    });
    if (!promotion.promoted) throw new NarrativeV3StateError("artifact_promotion_conflict", promotion.reason || "Artifact promotion failed.");
    return this.runStore.complete(stepId, workerId, {
      artifactId: created.artifact.id,
      artifactType: created.artifact.artifactType,
      artifactDigest: created.artifact.payloadDigest,
      artifactRevision: created.artifact.revision,
      pointerRevision: promotion.pointer.pointerRevision,
    });
  }
}
