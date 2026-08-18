import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseStoryConceptWire } from "../src/contracts/narrativeV3Canonical.js";
import { buildCreationIntent } from "../src/contracts/creationIntent.js";
import { JsonNarrativeV3ArtifactStore } from "../src/services/narrativeV3ArtifactStore.js";
import {
  JsonNarrativeV3RunStore,
  NarrativeV3StateError,
  NarrativeV3StateMachine,
} from "../src/services/narrativeV3StateMachine.js";

function concept() {
  return parseStoryConceptWire({
    schema_version: 1,
    contract_id: "calitiki.story-concept-wire.v1",
    language: "FR",
    title: "Le sentier des lucioles",
    premise: "Noa apprend à essayer sans devoir réussir immédiatement.",
    theme_proof: "Deux essais différents lui permettent de choisir sa propre méthode.",
    hero_arc: {
      desire: "Trouver le sentier lumineux.",
      initial_doubt: "Elle craint de se tromper.",
      decisive_choice: "Elle observe puis choisit elle-même.",
      earned_change: "Elle sait essayer et ajuster.",
    },
    beats: [
      { beat_key: "opening", purpose: "opening", summary: "Noa voit une lumière.", emotional_shift: "curiosité", distinctive_image: "une luciole à la fenêtre", participant_keys: ["hero"] },
      { beat_key: "crossing", purpose: "crossing", summary: "Noa franchit une arche.", emotional_shift: "élan", distinctive_image: "une arche de feuilles", participant_keys: ["hero"] },
      { beat_key: "attempt", purpose: "attempt", summary: "Noa compare deux pistes.", emotional_shift: "attention", distinctive_image: "deux chemins lumineux", participant_keys: ["hero"] },
      { beat_key: "return", purpose: "return", summary: "Noa revient chez elle.", emotional_shift: "confiance", distinctive_image: "la lumière revient", participant_keys: ["hero"] },
      { beat_key: "resolution", purpose: "resolution", summary: "Noa prépare son prochain essai.", emotional_shift: "fierté", distinctive_image: "une petite carte", participant_keys: ["hero"] },
    ],
  });
}

async function withMachine(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-state-"));
  const runPath = path.join(directory, "runs.json");
  const artifactPath = path.join(directory, "artifacts.json");
  try {
    const runStore = new JsonNarrativeV3RunStore(runPath);
    const artifactStore = new JsonNarrativeV3ArtifactStore(artifactPath);
    const machine = new NarrativeV3StateMachine({ runStore, artifactStore });
    return await run({ machine, runStore, artifactStore, runPath });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function creationIntent() {
  return buildCreationIntent({
    language: "FR",
    audienceAge: 8,
    pageCount: 24,
    universeId: "luminous_valley",
    intentionId: "learn_by_trying",
    approachId: "two_paths",
    sensitivityLevel: 1,
    castRefs: [{ characterKey: "hero", profileRef: "profile:hero", role: "hero", kind: "human" }],
    seriesRef: null,
    previousCanonDigest: null,
    questionnaireDigest: "a".repeat(64),
    safetyAssessmentDigest: "b".repeat(64),
  });
}

function artifactRef(artifact) {
  return { artifactId: artifact.id, artifactType: artifact.artifactType, artifactDigest: artifact.payloadDigest };
}

async function ensureIntent(artifactStore, projectId) {
  return (await artifactStore.createArtifact({
    projectId,
    artifactType: "creation_intent",
    payload: creationIntent(),
    provenance: { producer: "server_intent_builder", producerVersion: "v1" },
  })).artifact;
}

function parseRun(projectId, intentArtifact, runKey = "concept-v1") {
  return {
    projectId,
    runKey,
    steps: [{
      stepKey: "parse-concept",
      stepType: "parse_story_concept",
      expectedPointerRevision: 0,
      inputs: [artifactRef(intentArtifact)],
      maxAttempts: 2,
    }],
  };
}

function conceptArtifact(payload, intentArtifact, id = crypto.randomUUID()) {
  return {
    id,
    payload,
    parents: [{
      artifactId: intentArtifact.id,
      artifactType: intentArtifact.artifactType,
      payloadDigest: intentArtifact.payloadDigest,
    }],
    provenance: {
      producer: "server_parser",
      producerVersion: "v1",
      runId: "synthetic-run",
      stepId: "parse-concept",
    },
  };
}

test("enqueue and claim are idempotent and expose only the first runnable step", async () => {
  await withMachine(async ({ machine, runStore, artifactStore }) => {
    const projectId = crypto.randomUUID();
    const intentArtifact = await ensureIntent(artifactStore, projectId);
    const first = await machine.enqueue(parseRun(projectId, intentArtifact));
    const replay = await machine.enqueue(parseRun(projectId, intentArtifact));
    const [left, right] = await Promise.all([
      runStore.claimNext({ workerId: "worker-a" }),
      runStore.claimNext({ workerId: "worker-b" }),
    ]);

    assert.equal(first.created, true);
    assert.equal(replay.created, false);
    assert.equal([left, right].filter(Boolean).length, 1);
    assert.equal([left, right].filter(Boolean)[0].attemptCount, 1);
  });
});

test("one logical model step persists exactly one provider response id", async () => {
  await withMachine(async ({ machine, runStore, artifactStore }) => {
    const projectId = crypto.randomUUID();
    const intentArtifact = await ensureIntent(artifactStore, projectId);
    await machine.enqueue(parseRun(projectId, intentArtifact));
    const step = await runStore.claimNext({ workerId: "worker-a" });
    const saved = await runStore.checkpointProvider(step.id, "worker-a", "response-1");
    const repeated = await runStore.checkpointProvider(step.id, "worker-a", "response-1");

    assert.equal(saved.providerResponseId, "response-1");
    assert.equal(repeated.providerResponseId, "response-1");
    await assert.rejects(
      runStore.checkpointProvider(step.id, "worker-a", "response-2"),
      (error) => error instanceof NarrativeV3StateError && error.code === "provider_response_conflict",
    );
  });
});

test("only the active worker can renew a running step lease", async () => {
  await withMachine(async ({ machine, runStore, artifactStore }) => {
    const projectId = crypto.randomUUID();
    const intentArtifact = await ensureIntent(artifactStore, projectId);
    await machine.enqueue(parseRun(projectId, intentArtifact));
    const step = await runStore.claimNext({ workerId: "worker-a", leaseMs: 30000 });
    const before = Date.parse(step.leaseExpiresAt);
    const renewed = await runStore.heartbeat(step.id, "worker-a", 60000);

    assert.ok(Date.parse(renewed.leaseExpiresAt) > before);
    assert.equal(await runStore.heartbeat(step.id, "worker-b", 60000), null);
    assert.equal(await runStore.claimNext({ workerId: "worker-b" }), null);
  });
});

test("a restart after artifact promotion resumes without a second artifact or pointer advance", async () => {
  await withMachine(async ({ machine, runStore, artifactStore, runPath }) => {
    const projectId = crypto.randomUUID();
    const payload = concept();
    const intentArtifact = await ensureIntent(artifactStore, projectId);
    const artifactInput = conceptArtifact(payload, intentArtifact);
    const queued = await machine.enqueue(parseRun(projectId, intentArtifact));
    const firstLease = await runStore.claimNext({ workerId: "worker-a" });
    const created = await artifactStore.createArtifact({
      ...artifactInput,
      projectId,
      artifactType: "story_concept",
    });
    const promoted = await artifactStore.promoteArtifact({
      projectId,
      artifactType: "story_concept",
      artifactId: created.artifact.id,
      expectedPointerRevision: 0,
    });
    assert.equal(promoted.promoted, true);

    const persisted = JSON.parse(await fs.readFile(runPath, "utf8"));
    persisted.steps[firstLease.id].leaseExpiresAt = new Date(0).toISOString();
    await fs.writeFile(runPath, JSON.stringify(persisted), "utf8");
    const restartedStore = new JsonNarrativeV3RunStore(runPath);
    const restarted = new NarrativeV3StateMachine({ runStore: restartedStore, artifactStore });
    const secondLease = await restartedStore.claimNext({ workerId: "worker-b" });
    const completion = await restarted.commitArtifact({
      stepId: secondLease.id,
      workerId: "worker-b",
      artifact: artifactInput,
    });

    assert.equal(secondLease.attemptCount, 2);
    assert.equal(completion.completed, true);
    assert.equal(completion.commit.artifactId, created.artifact.id);
    assert.equal((await artifactStore.listArtifacts(projectId, "story_concept")).length, 1);
    assert.equal((await artifactStore.getCurrentPointer(projectId, "story_concept")).pointerRevision, 1);
    assert.equal((await restartedStore.getRun(queued.run.id)).status, "completed");
  });
});

test("a compile step refuses an input that is not the exact immutable project artifact", async () => {
  await withMachine(async ({ machine, artifactStore }) => {
    const projectId = crypto.randomUUID();
    const intentArtifact = await ensureIntent(artifactStore, projectId);
    const stored = (await artifactStore.createArtifact({
      ...conceptArtifact(concept(), intentArtifact),
      projectId,
      artifactType: "story_concept",
    })).artifact;
    await assert.rejects(
      machine.enqueue({
        projectId,
        runKey: "graph-v1",
        steps: [{
          stepKey: "compile-graph",
          stepType: "compile_story_graph",
          expectedPointerRevision: 0,
          inputs: [{ artifactId: stored.id, artifactType: stored.artifactType, artifactDigest: "f".repeat(64) }],
        }],
      }),
      (error) => error instanceof NarrativeV3StateError && error.code === "step_input_mismatch",
    );
  });
});

test("PostgreSQL state schema and claims are ordered, leased and artifact-bound", async () => {
  const migration = await fs.readFile("db/migrations/017_narrative_v3_state_machine.sql", "utf8");
  const implementation = await fs.readFile("src/services/narrativeV3StateMachine.js", "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS narrative_v3_runs/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS narrative_v3_steps/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS narrative_v3_step_inputs/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS narrative_v3_step_commits/);
  assert.match(migration, /FOREIGN KEY \(artifact_id, project_id, artifact_type, artifact_digest, artifact_revision\)/);
  assert.match(implementation, /FOR UPDATE SKIP LOCKED LIMIT 1/);
  assert.match(implementation, /prior\.sequence<step\.sequence AND prior\.status<>'completed'/);
  assert.match(implementation, /provider_response_id='' OR provider_response_id=\$3/);
  assert.match(implementation, /SET lease_expires_at=now\(\)\+\(\$3 \* interval '1 millisecond'\)/);
  assert.match(implementation, /A completed step cannot point to a second artifact/);
});
