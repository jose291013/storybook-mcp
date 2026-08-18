import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { JsonNarrativeV3ArtifactStore } from "../src/services/narrativeV3ArtifactStore.js";
import {
  JsonNarrativeV3RunStore,
  NarrativeV3StateMachine,
} from "../src/services/narrativeV3StateMachine.js";
import {
  enqueueNarrativeV3ProductionShadow,
  NARRATIVE_V3_APPROVED_RELEASE_GATE_DIGEST,
  narrativeV3ProductionShadowEligibility,
  recoverNarrativeV3ProductionShadow,
  runNextNarrativeV3ProductionShadow,
} from "../src/services/narrativeV3ProductionShadow.js";

function project() {
  return {
    id: crypto.randomUUID(),
    customerId: crypto.randomUUID(),
    locale: "FR",
    questionnaire: {
      hero_name: "Lina",
      age: "8",
      favorite_activities: "observer et dessiner",
      personality: "curieuse et patiente",
      dream: "trouver son propre chemin",
      challenge: "elle hésite après un premier essai",
      message: "observer puis ajuster permet d'avancer",
      creator_situation: "une situation synthétique sans donnée réelle",
      story_intent_id: "confidence",
      universe_id: "enchanted_forest",
      style_id: "soft_watercolor",
      language: "FR",
      page_count: 24,
      product_type: "ebook",
      font_style: "rounded",
      child_safety_profile: { version: 2, category: "general", action: "allow", restricted: false },
      story_sensitivity_profile: { version: 2, level: 1, category: "everyday_challenge", restricted: false },
    },
    photoRefs: [{ id: "synthetic-lina", role: "child", story_role: "hero", name: "Lina", relationship: "hero" }],
    continuitySnapshot: { v2Marker: "must-not-change" },
  };
}

function environment(customerId = "tester-42") {
  return {
    NARRATIVE_V3_ROLLOUT_MODE: "shadow",
    NARRATIVE_V3_RELEASE_GATE_DIGEST: NARRATIVE_V3_APPROVED_RELEASE_GATE_DIGEST,
    NARRATIVE_V3_SHADOW_CUSTOMER_IDS: customerId,
  };
}

function conceptWire(source) {
  const crossing = source.requiredStructure.crossingSceneRange[0];
  const purposes = Array.from({ length: source.sceneCount }, () => "attempt");
  purposes[0] = "opening";
  purposes[1] = "desire";
  purposes[crossing - 1] = "crossing";
  purposes[source.requiredStructure.climaxScene - 1] = "climax";
  purposes[source.requiredStructure.returnScene - 1] = "return";
  purposes[source.requiredStructure.resolutionScene - 1] = "resolution";
  return {
    schema_version: 1,
    contract_id: "calitiki.story-concept-wire.v1",
    language: source.language,
    title: "Le chemin de Lina",
    premise: "Lina observe, choisit puis ajuste une méthode qui lui appartient.",
    theme_proof: "Son choix final réussit parce qu'il applique ce qu'elle a observé.",
    hero_arc: {
      desire: "Avancer par elle-même.",
      initial_doubt: "Craindre qu'un premier échec soit définitif.",
      decisive_choice: "Comparer les indices avant un nouvel essai.",
      earned_change: "Savoir essayer puis ajuster sans perdre confiance.",
    },
    beats: purposes.map((purpose, index) => ({
      beat_key: `beat_${String(index + 1).padStart(2, "0")}`,
      purpose,
      summary: `Lina accomplit une étape distincte ${index + 1}.`,
      emotional_shift: `Une progression mesurable ${index + 1}.`,
      distinctive_image: `Un instant narratif distinct ${index + 1}.`,
      participant_keys: ["hero"],
    })),
  };
}

async function harness(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-real-shadow-"));
  const artifactStore = new JsonNarrativeV3ArtifactStore(path.join(directory, "artifacts.json"));
  const runPath = path.join(directory, "runs.json");
  const runStore = new JsonNarrativeV3RunStore(runPath);
  const machine = new NarrativeV3StateMachine({ artifactStore, runStore });
  try { await callback({ artifactStore, runStore, machine, runPath }); }
  finally { await fs.rm(directory, { recursive: true, force: true }); }
}

test("production shadow requires exact mode, release gate and Woo tester allowlist", () => {
  const source = project();
  const identity = { wooCustomerId: "tester-42" };
  assert.equal(narrativeV3ProductionShadowEligibility({ project: source, identity }, environment()).eligible, true);
  assert.equal(narrativeV3ProductionShadowEligibility({ project: source, identity }, { ...environment(), NARRATIVE_V3_ROLLOUT_MODE: "off" }).reason, "rollout_not_shadow");
  assert.equal(narrativeV3ProductionShadowEligibility({ project: source, identity }, { ...environment(), NARRATIVE_V3_RELEASE_GATE_DIGEST: "f".repeat(64) }).reason, "release_gate_mismatch");
  assert.equal(narrativeV3ProductionShadowEligibility({ project: source, identity: { wooCustomerId: "another" } }, environment()).reason, "customer_not_allowlisted");
  assert.equal(narrativeV3ProductionShadowEligibility({ project: { ...source, seriesId: crypto.randomUUID() }, identity }, environment()).reason, "series_shadow_not_yet_supported");
});

test("an allowlisted real project reaches the immutable V3 release spec without touching V2", async () => {
  await harness(async ({ artifactStore, runStore, machine }) => {
    const source = project();
    const originalSnapshot = structuredClone(source.continuitySnapshot);
    const projects = { get: async (id) => (id === source.id ? source : null) };
    const queued = await enqueueNarrativeV3ProductionShadow({
      project: source,
      identity: { wooCustomerId: "tester-42" },
    }, { env: environment(), artifactStore, machine });
    assert.equal(queued.eligible, true);
    assert.equal(queued.created, true);

    for (let index = 0; index < 4; index += 1) {
      const result = await runNextNarrativeV3ProductionShadow({
        artifactStore,
        runStore,
        machine,
        projects,
        workerId: `worker-${index}`,
        conceptAgent: async (semanticSource) => conceptWire(semanticSource),
      });
      assert.equal(result.status, "completed");
    }

    const release = await artifactStore.getCurrentPointer(source.id, "narrative_book_spec_v3");
    assert.ok(release?.artifactId);
    assert.equal((await artifactStore.listArtifacts(source.id)).length, 5);
    assert.deepEqual(source.continuitySnapshot, originalSnapshot);

    const replay = await enqueueNarrativeV3ProductionShadow({
      project: source,
      identity: { wooCustomerId: "tester-42" },
    }, { env: environment(), artifactStore, machine });
    assert.equal(replay.created, false);
    assert.equal((await artifactStore.getCurrentPointer(source.id, "creation_intent")).pointerRevision, 1);
    assert.equal((await artifactStore.getCurrentPointer(source.id, "narrative_book_spec_v3")).pointerRevision, 1);
  });
});

test("recovery schedules the deterministic successor after a commit-before-enqueue restart", async () => {
  await harness(async ({ artifactStore, runStore, machine, runPath }) => {
    const source = project();
    const projects = { get: async () => source };
    await enqueueNarrativeV3ProductionShadow({ project: source, identity: { wooCustomerId: "tester-42" } }, {
      env: environment(), artifactStore, machine,
    });
    await runNextNarrativeV3ProductionShadow({
      artifactStore, runStore, machine, projects, workerId: "concept-worker", conceptAgent: async (semanticSource) => conceptWire(semanticSource),
    });
    const state = JSON.parse(await fs.readFile(runPath, "utf8"));
    const graphRun = Object.values(state.runs).find((run) => run.runKey.includes(":graph:"));
    delete state.runs[graphRun.id];
    for (const [stepId, step] of Object.entries(state.steps)) {
      if (step.runId === graphRun.id) delete state.steps[stepId];
    }
    await fs.writeFile(runPath, JSON.stringify(state), "utf8");
    const before = await runStore.listRunsByPrefix("production-shadow-v1:");
    assert.equal(before.length, 1);
    const recovered = await recoverNarrativeV3ProductionShadow({ artifactStore, runStore, machine });
    assert.equal(recovered.scheduled, 1);
    assert.equal((await runStore.listRunsByPrefix("production-shadow-v1:")).length, 2);
  });
});

test("a shadow contract failure is internal and does not mutate the customer project", async () => {
  await harness(async ({ artifactStore, runStore, machine }) => {
    const source = project();
    const original = structuredClone(source);
    await enqueueNarrativeV3ProductionShadow({ project: source, identity: { wooCustomerId: "tester-42" } }, {
      env: environment(), artifactStore, machine,
    });
    const result = await runNextNarrativeV3ProductionShadow({
      artifactStore,
      runStore,
      machine,
      projects: { get: async () => source },
      workerId: "failing-worker",
      conceptAgent: async () => ({ schema_version: 1 }),
    });
    assert.equal(result.status, "failed");
    assert.deepEqual(source, original);
    assert.equal(await artifactStore.getCurrentPointer(source.id, "story_concept"), null);
  });
});
