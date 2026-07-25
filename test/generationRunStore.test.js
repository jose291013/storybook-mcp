import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonGenerationRunStore } from "../src/services/generationRunStore.js";

test("generation runs, steps and candidates are idempotent and durable in local development", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-generation-ledger-"));
  try {
    const filePath = path.join(directory, "generation-runs.json");
    const store = new JsonGenerationRunStore(filePath);
    const created = await store.createRun({
      id: "run-1",
      projectId: "project-1",
      kind: "preview",
      inputFingerprint: "fingerprint-1",
    });
    assert.equal(created.created, true);
    assert.equal((await store.createRun({
      id: "run-1",
      projectId: "project-1",
      kind: "preview",
    })).created, false);

    const claimed = await store.claimNextRun({ workerId: "worker-a", leaseMs: 30000 });
    assert.equal(claimed.id, "run-1");
    assert.equal(claimed.status, "running");
    assert.equal(claimed.attemptCount, 1);
    assert.equal(await store.claimNextRun({ workerId: "worker-b", leaseMs: 30000 }), null);
    assert.equal((await store.heartbeatRun("run-1", "worker-a", 30000)).leaseOwner, "worker-a");

    const firstStep = await store.upsertStep("run-1", {
      stepKey: "image:page:3",
      stepType: "image",
      maxAttempts: 2,
      inputFingerprint: "page-3-v1",
    });
    assert.equal(firstStep.created, true);
    assert.equal((await store.upsertStep("run-1", {
      stepKey: "image:page:3",
      stepType: "image",
      maxAttempts: 2,
    })).created, false);

    const claimedStep = await store.claimNextStep({
      runId: "run-1",
      workerId: "worker-a",
      leaseMs: 30000,
    });
    assert.equal(claimedStep.stepKey, "image:page:3");
    assert.equal(claimedStep.attemptCount, 1);

    const firstCandidate = await store.recordCandidate({
      runId: "run-1",
      stepId: claimedStep.id,
      projectId: "project-1",
      pageNumber: 3,
      candidateNumber: 1,
      status: "quarantined",
      storageKey: "previews/project-1/page-3-attempt-1.png",
      rejectionKind: "scene",
      issues: ["Required named character Maïté is missing."],
    });
    assert.equal(firstCandidate.created, true);
    assert.equal((await store.recordCandidate({
      runId: "run-1",
      stepId: claimedStep.id,
      projectId: "project-1",
      pageNumber: 3,
      candidateNumber: 1,
    })).created, false);
    assert.equal((await store.listCandidates(claimedStep.id)).length, 1);

    const reloaded = new JsonGenerationRunStore(filePath);
    assert.equal((await reloaded.getRun("run-1")).inputFingerprint, "fingerprint-1");
    assert.equal((await reloaded.listSteps("run-1"))[0].stepKey, "image:page:3");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("PostgreSQL orchestration schema supports leases, step isolation and preserved candidates", async () => {
  const migration = await fs.readFile("db/migrations/011_generation_orchestration.sql", "utf8");
  const store = await fs.readFile("src/services/generationRunStore.js", "utf8");
  const preview = await fs.readFile("src/routes/preview.js", "utf8");
  const jobs = await fs.readFile("src/routes/jobs.js", "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS generation_runs/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS generation_steps/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS generation_candidates/);
  assert.match(migration, /lease_expires_at/);
  assert.match(migration, /UNIQUE \(run_id, step_key\)/);
  assert.match(migration, /UNIQUE \(step_id, candidate_number\)/);
  assert.match(store, /FOR UPDATE SKIP LOCKED/);
  assert.match(store, /attempt_count<max_attempts/);
  assert.match(store, /ON CONFLICT \(step_id,candidate_number\) DO NOTHING/);
  assert.match(preview, /generationRunStore\.createRun/);
  assert.match(preview, /startGenerationRunHeartbeat/);
  assert.match(preview, /generationRunStore\.upsertStep/);
  assert.match(preview, /status: "waiting_input"/);
  assert.match(preview, /status: "completed"/);
  assert.match(jobs, /generationRunStore\.getRun/);
  assert.match(jobs, /durable: true/);
});
