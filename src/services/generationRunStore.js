import crypto from "crypto";
import fs from "fs";
import path from "path";
import { databaseEnabled, getDatabasePool } from "./database.js";

const LOCAL_PATH = path.resolve("data/generation-runs.json");
const now = () => new Date().toISOString();
const ACTIVE_RUN_STATUSES = new Set(["queued", "running"]);
const CLAIMABLE_STEP_STATUSES = new Set(["queued", "running", "retry_pending", "repair_pending"]);

function emptyStore() {
  return { runs: {}, steps: {}, candidates: {} };
}

function safeJson(value, fallback) {
  if (value == null) return fallback;
  return value;
}

function runFromRow(row) {
  if (!row) return null;
  const date = (value) => value?.toISOString?.() || value || null;
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    status: row.status,
    currentStep: row.current_step || "",
    inputFingerprint: row.input_fingerprint || "",
    attemptCount: Number(row.attempt_count || 0),
    leaseOwner: row.lease_owner || "",
    leaseExpiresAt: date(row.lease_expires_at),
    heartbeatAt: date(row.heartbeat_at),
    errorCode: row.error_code || "",
    errorMessage: row.error_message || "",
    metadata: row.metadata || {},
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
    completedAt: date(row.completed_at),
  };
}

function stepFromRow(row) {
  if (!row) return null;
  const date = (value) => value?.toISOString?.() || value || null;
  return {
    id: row.id,
    runId: row.run_id,
    stepKey: row.step_key,
    stepType: row.step_type,
    status: row.status,
    attemptCount: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || 1),
    inputFingerprint: row.input_fingerprint || "",
    leaseOwner: row.lease_owner || "",
    leaseExpiresAt: date(row.lease_expires_at),
    heartbeatAt: date(row.heartbeat_at),
    nextAttemptAt: date(row.next_attempt_at),
    output: row.output || {},
    diagnostics: row.diagnostics || {},
    errorCode: row.error_code || "",
    errorMessage: row.error_message || "",
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
    completedAt: date(row.completed_at),
  };
}

function candidateFromRow(row) {
  if (!row) return null;
  const date = (value) => value?.toISOString?.() || value || null;
  return {
    id: row.id,
    runId: row.run_id,
    stepId: row.step_id,
    projectId: row.project_id,
    pageNumber: row.page_number == null ? null : Number(row.page_number),
    candidateNumber: Number(row.candidate_number),
    status: row.status,
    storageKey: row.storage_key || "",
    previewUrl: row.preview_url || "",
    rejectionKind: row.rejection_kind || "",
    issues: row.issues || [],
    metadata: row.metadata || {},
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
  };
}

export class JsonGenerationRunStore {
  constructor(filePath = LOCAL_PATH) {
    this.filePath = path.resolve(filePath);
  }

  async initialize() {
    return { backend: "json" };
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

  async createRun(input) {
    const store = this.read();
    const id = String(input.id || crypto.randomUUID());
    if (store.runs[id]) return { run: store.runs[id], created: false };
    const timestamp = now();
    const run = {
      id,
      projectId: input.projectId,
      kind: input.kind || "preview",
      status: input.status || "queued",
      currentStep: input.currentStep || "",
      inputFingerprint: input.inputFingerprint || "",
      attemptCount: 0,
      leaseOwner: "",
      leaseExpiresAt: null,
      heartbeatAt: null,
      errorCode: "",
      errorMessage: "",
      metadata: input.metadata || {},
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
    };
    store.runs[id] = run;
    this.write(store);
    return { run, created: true };
  }

  async getRun(id) {
    return this.read().runs[id] || null;
  }

  async latestForProject(projectId) {
    return Object.values(this.read().runs)
      .filter((run) => run.projectId === projectId)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))[0] || null;
  }

  async updateRun(id, patch) {
    const store = this.read();
    const current = store.runs[id];
    if (!current) return null;
    const allowed = [
      "status", "currentStep", "inputFingerprint", "leaseOwner", "leaseExpiresAt",
      "heartbeatAt", "errorCode", "errorMessage", "metadata", "completedAt",
    ];
    const safe = Object.fromEntries(Object.entries(patch).filter(([key, value]) => allowed.includes(key) && value !== undefined));
    store.runs[id] = { ...current, ...safe, updatedAt: now() };
    this.write(store);
    return store.runs[id];
  }

  async claimNextRun({ workerId, leaseMs = 120000, kinds = [] }) {
    const store = this.read();
    const timestamp = Date.now();
    const run = Object.values(store.runs)
      .filter((item) => (!kinds.length || kinds.includes(item.kind)))
      .filter((item) => item.status === "queued"
        || (item.status === "running" && Date.parse(item.leaseExpiresAt || 0) <= timestamp))
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))[0];
    if (!run) return null;
    run.status = "running";
    run.leaseOwner = workerId;
    run.leaseExpiresAt = new Date(timestamp + Math.max(30000, Number(leaseMs) || 120000)).toISOString();
    run.heartbeatAt = now();
    run.attemptCount = Number(run.attemptCount || 0) + 1;
    run.updatedAt = now();
    this.write(store);
    return run;
  }

  async heartbeatRun(id, workerId, leaseMs = 120000) {
    const store = this.read();
    const run = store.runs[id];
    if (!run || run.status !== "running" || run.leaseOwner !== workerId) return null;
    run.heartbeatAt = now();
    run.leaseExpiresAt = new Date(Date.now() + Math.max(30000, Number(leaseMs) || 120000)).toISOString();
    run.updatedAt = now();
    this.write(store);
    return run;
  }

  async claimAbandonedRuns({ limit = 10 } = {}) {
    const store = this.read();
    const timestamp = Date.now();
    const abandoned = Object.values(store.runs)
      .filter((run) => run.kind === "preview" && run.status === "running" && Date.parse(run.leaseExpiresAt || 0) <= timestamp)
      .sort((left, right) => String(left.leaseExpiresAt || "").localeCompare(String(right.leaseExpiresAt || "")))
      .slice(0, Math.max(1, Math.min(50, Number(limit) || 10)));
    for (const run of abandoned) {
      run.status = "failed";
      run.errorCode = "preview_interrupted";
      run.errorMessage = "The generation worker lease expired before completion.";
      run.completedAt = now();
      run.leaseOwner = "";
      run.leaseExpiresAt = null;
      run.updatedAt = now();
    }
    if (abandoned.length) this.write(store);
    return abandoned;
  }

  async upsertStep(runId, input) {
    const store = this.read();
    const existing = Object.values(store.steps).find((step) => step.runId === runId && step.stepKey === input.stepKey);
    if (existing) return { step: existing, created: false };
    const timestamp = now();
    const step = {
      id: crypto.randomUUID(),
      runId,
      stepKey: input.stepKey,
      stepType: input.stepType || "task",
      status: input.status || "queued",
      attemptCount: 0,
      maxAttempts: Math.max(1, Number(input.maxAttempts) || 1),
      inputFingerprint: input.inputFingerprint || "",
      leaseOwner: "",
      leaseExpiresAt: null,
      heartbeatAt: null,
      nextAttemptAt: input.nextAttemptAt || timestamp,
      output: input.output || {},
      diagnostics: input.diagnostics || {},
      errorCode: "",
      errorMessage: "",
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
    };
    store.steps[step.id] = step;
    this.write(store);
    return { step, created: true };
  }

  async getStep(runId, stepKey) {
    return Object.values(this.read().steps).find((step) => step.runId === runId && step.stepKey === stepKey) || null;
  }

  async listSteps(runId) {
    return Object.values(this.read().steps)
      .filter((step) => step.runId === runId)
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
  }

  async updateStep(id, patch) {
    const store = this.read();
    const current = store.steps[id];
    if (!current) return null;
    const allowed = [
      "status", "maxAttempts", "inputFingerprint", "leaseOwner", "leaseExpiresAt",
      "heartbeatAt", "nextAttemptAt", "output", "diagnostics", "errorCode",
      "errorMessage", "completedAt",
    ];
    const safe = Object.fromEntries(Object.entries(patch).filter(([key, value]) => allowed.includes(key) && value !== undefined));
    store.steps[id] = { ...current, ...safe, updatedAt: now() };
    this.write(store);
    return store.steps[id];
  }

  async claimNextStep({ runId, workerId, leaseMs = 120000 }) {
    const store = this.read();
    const timestamp = Date.now();
    const step = Object.values(store.steps)
      .filter((item) => item.runId === runId && CLAIMABLE_STEP_STATUSES.has(item.status))
      .filter((item) => Date.parse(item.nextAttemptAt || 0) <= timestamp)
      .filter((item) => item.status !== "running" || Date.parse(item.leaseExpiresAt || 0) <= timestamp)
      .filter((item) => Number(item.attemptCount || 0) < Number(item.maxAttempts || 1))
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))[0];
    if (!step) return null;
    step.status = "running";
    step.leaseOwner = workerId;
    step.leaseExpiresAt = new Date(timestamp + Math.max(30000, Number(leaseMs) || 120000)).toISOString();
    step.heartbeatAt = now();
    step.attemptCount = Number(step.attemptCount || 0) + 1;
    step.updatedAt = now();
    this.write(store);
    return step;
  }

  async recordCandidate(input) {
    const store = this.read();
    const existing = Object.values(store.candidates).find((candidate) => (
      candidate.stepId === input.stepId && Number(candidate.candidateNumber) === Number(input.candidateNumber)
    ));
    if (existing) return { candidate: existing, created: false };
    const timestamp = now();
    const candidate = {
      id: crypto.randomUUID(),
      runId: input.runId,
      stepId: input.stepId,
      projectId: input.projectId,
      pageNumber: input.pageNumber == null ? null : Number(input.pageNumber),
      candidateNumber: Number(input.candidateNumber),
      status: input.status || "pending",
      storageKey: input.storageKey || "",
      previewUrl: input.previewUrl || "",
      rejectionKind: input.rejectionKind || "",
      issues: input.issues || [],
      metadata: input.metadata || {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    store.candidates[candidate.id] = candidate;
    this.write(store);
    return { candidate, created: true };
  }

  async listCandidates(stepId) {
    return Object.values(this.read().candidates)
      .filter((candidate) => candidate.stepId === stepId)
      .sort((left, right) => Number(left.candidateNumber) - Number(right.candidateNumber));
  }

  async listCandidatesForProject(projectId) {
    return Object.values(this.read().candidates)
      .filter((candidate) => candidate.projectId === projectId)
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
  }
}

export class PostgresGenerationRunStore {
  constructor(database = getDatabasePool()) {
    this.database = database;
  }

  async initialize() {
    return { backend: "postgres" };
  }

  async createRun(input) {
    const id = String(input.id || crypto.randomUUID());
    const { rows } = await this.database.query(
      `INSERT INTO generation_runs
       (id,project_id,kind,status,current_step,input_fingerprint,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING
       RETURNING *`,
      [id, input.projectId, input.kind || "preview", input.status || "queued",
        input.currentStep || "", input.inputFingerprint || "", JSON.stringify(input.metadata || {})],
    );
    if (rows[0]) return { run: runFromRow(rows[0]), created: true };
    return { run: await this.getRun(id), created: false };
  }

  async getRun(id) {
    const { rows } = await this.database.query("SELECT * FROM generation_runs WHERE id=$1", [id]);
    return runFromRow(rows[0]);
  }

  async latestForProject(projectId) {
    const { rows } = await this.database.query(
      "SELECT * FROM generation_runs WHERE project_id=$1 ORDER BY created_at DESC LIMIT 1",
      [projectId],
    );
    return runFromRow(rows[0]);
  }

  async updateRun(id, patch) {
    const fields = {
      status: "status",
      currentStep: "current_step",
      inputFingerprint: "input_fingerprint",
      leaseOwner: "lease_owner",
      leaseExpiresAt: "lease_expires_at",
      heartbeatAt: "heartbeat_at",
      errorCode: "error_code",
      errorMessage: "error_message",
      metadata: "metadata",
      completedAt: "completed_at",
    };
    const jsonFields = new Set(["metadata"]);
    const entries = Object.entries(patch).filter(([key, value]) => fields[key] && value !== undefined);
    if (!entries.length) return this.getRun(id);
    const values = [id];
    const setters = entries.map(([key, value], index) => {
      values.push(jsonFields.has(key) && value != null ? JSON.stringify(value) : value);
      return `${fields[key]}=$${index + 2}`;
    });
    const { rows } = await this.database.query(
      `UPDATE generation_runs SET ${setters.join(",")},updated_at=now() WHERE id=$1 RETURNING *`,
      values,
    );
    return runFromRow(rows[0]);
  }

  async claimNextRun({ workerId, leaseMs = 120000, kinds = [] }) {
    const boundedLease = Math.max(30000, Number(leaseMs) || 120000);
    const { rows } = await this.database.query(
      `WITH candidate AS (
         SELECT id FROM generation_runs
         WHERE (status='queued' OR (status='running' AND lease_expires_at<=now()))
           AND (cardinality($3::text[])=0 OR kind=ANY($3::text[]))
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE generation_runs AS run
       SET status='running',lease_owner=$1,
           lease_expires_at=now()+($2 * interval '1 millisecond'),
           heartbeat_at=now(),attempt_count=run.attempt_count+1,updated_at=now()
       FROM candidate WHERE run.id=candidate.id
       RETURNING run.*`,
      [workerId, boundedLease, kinds],
    );
    return runFromRow(rows[0]);
  }

  async heartbeatRun(id, workerId, leaseMs = 120000) {
    const boundedLease = Math.max(30000, Number(leaseMs) || 120000);
    const { rows } = await this.database.query(
      `UPDATE generation_runs
       SET heartbeat_at=now(),lease_expires_at=now()+($3 * interval '1 millisecond'),updated_at=now()
       WHERE id=$1 AND status='running' AND lease_owner=$2
       RETURNING *`,
      [id, workerId, boundedLease],
    );
    return runFromRow(rows[0]);
  }

  async claimAbandonedRuns({ limit = 10 } = {}) {
    const boundedLimit = Math.max(1, Math.min(50, Number(limit) || 10));
    const { rows } = await this.database.query(
      `WITH abandoned AS (
         SELECT id FROM generation_runs
         WHERE kind='preview' AND status='running' AND lease_expires_at<=now()
         ORDER BY lease_expires_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE generation_runs AS run
       SET status='failed',error_code='preview_interrupted',
           error_message='The generation worker lease expired before completion.',
           completed_at=now(),lease_owner=NULL,lease_expires_at=NULL,updated_at=now()
       FROM abandoned WHERE run.id=abandoned.id
       RETURNING run.*`,
      [boundedLimit],
    );
    return rows.map(runFromRow);
  }

  async upsertStep(runId, input) {
    const id = crypto.randomUUID();
    const { rows } = await this.database.query(
      `INSERT INTO generation_steps
       (id,run_id,step_key,step_type,status,max_attempts,input_fingerprint,next_attempt_at,output,diagnostics)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,now()),$9,$10)
       ON CONFLICT (run_id,step_key) DO NOTHING
       RETURNING *`,
      [id, runId, input.stepKey, input.stepType || "task", input.status || "queued",
        Math.max(1, Number(input.maxAttempts) || 1), input.inputFingerprint || "",
        input.nextAttemptAt || null, JSON.stringify(input.output || {}), JSON.stringify(input.diagnostics || {})],
    );
    if (rows[0]) return { step: stepFromRow(rows[0]), created: true };
    return { step: await this.getStep(runId, input.stepKey), created: false };
  }

  async getStep(runId, stepKey) {
    const { rows } = await this.database.query(
      "SELECT * FROM generation_steps WHERE run_id=$1 AND step_key=$2",
      [runId, stepKey],
    );
    return stepFromRow(rows[0]);
  }

  async listSteps(runId) {
    const { rows } = await this.database.query(
      "SELECT * FROM generation_steps WHERE run_id=$1 ORDER BY created_at ASC",
      [runId],
    );
    return rows.map(stepFromRow);
  }

  async updateStep(id, patch) {
    const fields = {
      status: "status",
      maxAttempts: "max_attempts",
      inputFingerprint: "input_fingerprint",
      leaseOwner: "lease_owner",
      leaseExpiresAt: "lease_expires_at",
      heartbeatAt: "heartbeat_at",
      nextAttemptAt: "next_attempt_at",
      output: "output",
      diagnostics: "diagnostics",
      errorCode: "error_code",
      errorMessage: "error_message",
      completedAt: "completed_at",
    };
    const jsonFields = new Set(["output", "diagnostics"]);
    const entries = Object.entries(patch).filter(([key, value]) => fields[key] && value !== undefined);
    if (!entries.length) {
      const { rows } = await this.database.query("SELECT * FROM generation_steps WHERE id=$1", [id]);
      return stepFromRow(rows[0]);
    }
    const values = [id];
    const setters = entries.map(([key, value], index) => {
      values.push(jsonFields.has(key) && value != null ? JSON.stringify(value) : value);
      return `${fields[key]}=$${index + 2}`;
    });
    const { rows } = await this.database.query(
      `UPDATE generation_steps SET ${setters.join(",")},updated_at=now() WHERE id=$1 RETURNING *`,
      values,
    );
    return stepFromRow(rows[0]);
  }

  async claimNextStep({ runId, workerId, leaseMs = 120000 }) {
    const boundedLease = Math.max(30000, Number(leaseMs) || 120000);
    const { rows } = await this.database.query(
      `WITH candidate AS (
         SELECT id FROM generation_steps
         WHERE run_id=$1
           AND status IN ('queued','running','retry_pending','repair_pending')
           AND next_attempt_at<=now()
           AND (status<>'running' OR lease_expires_at<=now())
           AND attempt_count<max_attempts
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE generation_steps AS step
       SET status='running',lease_owner=$2,
           lease_expires_at=now()+($3 * interval '1 millisecond'),
           heartbeat_at=now(),attempt_count=step.attempt_count+1,updated_at=now()
       FROM candidate WHERE step.id=candidate.id
       RETURNING step.*`,
      [runId, workerId, boundedLease],
    );
    return stepFromRow(rows[0]);
  }

  async recordCandidate(input) {
    const id = crypto.randomUUID();
    const { rows } = await this.database.query(
      `INSERT INTO generation_candidates
       (id,run_id,step_id,project_id,page_number,candidate_number,status,storage_key,preview_url,rejection_kind,issues,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (step_id,candidate_number) DO NOTHING
       RETURNING *`,
      [id, input.runId, input.stepId, input.projectId, input.pageNumber ?? null,
        Number(input.candidateNumber), input.status || "pending", input.storageKey || "",
        input.previewUrl || "", input.rejectionKind || "", JSON.stringify(input.issues || []),
        JSON.stringify(input.metadata || {})],
    );
    if (rows[0]) return { candidate: candidateFromRow(rows[0]), created: true };
    const existing = await this.database.query(
      "SELECT * FROM generation_candidates WHERE step_id=$1 AND candidate_number=$2",
      [input.stepId, Number(input.candidateNumber)],
    );
    return { candidate: candidateFromRow(existing.rows[0]), created: false };
  }

  async listCandidates(stepId) {
    const { rows } = await this.database.query(
      "SELECT * FROM generation_candidates WHERE step_id=$1 ORDER BY candidate_number ASC",
      [stepId],
    );
    return rows.map(candidateFromRow);
  }

  async listCandidatesForProject(projectId) {
    const { rows } = await this.database.query(
      "SELECT * FROM generation_candidates WHERE project_id=$1 ORDER BY created_at ASC",
      [projectId],
    );
    return rows.map(candidateFromRow);
  }
}

export function createGenerationRunStore(options = {}) {
  return databaseEnabled()
    ? new PostgresGenerationRunStore(options.database)
    : new JsonGenerationRunStore(options.filePath);
}

export const generationRunStore = createGenerationRunStore();

export { ACTIVE_RUN_STATUSES };
