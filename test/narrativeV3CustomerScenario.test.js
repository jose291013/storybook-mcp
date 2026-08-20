import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { normalizeBookRequest } from "../src/services/normalizeBookRequest.js";
import {
  createNarrativeEngineAssignment,
  narrativeEngineAssignment,
  projectUsesNarrativeV3,
} from "../src/services/narrativeEngineAssignment.js";
import { JsonNarrativeV3ArtifactStore } from "../src/services/narrativeV3ArtifactStore.js";
import {
  generateNarrativeV3Scenario,
} from "../src/services/narrativeV3Scenario.js";
import { validateStoryScenario } from "../src/services/storyScenario.js";
import { compileSpecDrivenIllustrationPlan } from "../src/services/specDrivenIllustrationPlan.js";
import { narrativeBookSpecForPreview } from "../src/services/narrativeBookSpecLifecycle.js";

function project() {
  return {
    id: crypto.randomUUID(),
    customerId: crypto.randomUUID(),
    createdAt: "2026-08-19T10:00:00.000Z",
    questionnaire: {
      hero_name: "Lina",
      age: 8,
      favorite_activities: "observer les dinosaures",
      personality: "curieuse et calme",
      dream: "oser essayer",
      challenge: "elle hésite après une erreur",
      message: "observer puis ajuster permet d'avancer",
      creator_situation: "une situation quotidienne",
      story_intent_id: "confidence",
      story_seed_id: "observe_and_adjust",
      universe_id: "dinosaur_valley",
      style_id: "soft_watercolor",
      language: "FR",
      page_count: 32,
      product_type: "ebook",
      font_style: "rounded",
      child_safety_profile: { version: 2, category: "general", action: "allow", restricted: false },
      story_sensitivity_profile: { version: 2, level: 1, category: "everyday_challenge", restricted: false },
    },
    photoRefs: [{ id: "lina-photo", role: "child", story_role: "hero", name: "Lina" }],
    continuitySnapshot: { narrativeEngine: createNarrativeEngineAssignment({ assignedAt: "2026-08-19T10:00:00.000Z" }) },
  };
}

function conceptWire(source) {
  const purposes = Array.from({ length: source.sceneCount }, () => "attempt");
  purposes[0] = "opening";
  purposes[1] = "desire";
  purposes[source.requiredStructure.crossingSceneRange[0] - 2] = "preparation";
  purposes[source.requiredStructure.crossingSceneRange[0] - 1] = "crossing";
  purposes[source.requiredStructure.climaxScene - 1] = "climax";
  purposes[source.requiredStructure.returnScene - 1] = "return";
  purposes[source.requiredStructure.resolutionScene - 1] = "resolution";
  return {
    schema_version: 1,
    contract_id: "calitiki.story-concept-wire.v1",
    language: source.language,
    title: "Lina et la vallée des traces",
    premise: "Lina apprend à comparer les traces avant de choisir son chemin.",
    theme_proof: "Son observation lui permet de corriger son premier choix.",
    hero_arc: {
      desire: "Trouver un chemin par elle-même.",
      initial_doubt: "Craindre qu'une erreur ferme toute possibilité.",
      decisive_choice: "Observer les empreintes avant de repartir.",
      earned_change: "Comprendre qu'un essai peut être ajusté.",
    },
    beats: purposes.map((purpose, index) => ({
      beat_key: `beat_${String(index + 1).padStart(2, "0")}`,
      purpose,
      summary: `Lina accomplit une action distincte dans la vallée, étape ${index + 1}.`,
      emotional_shift: `Sa confiance évolue à l'étape ${index + 1}.`,
      distinctive_image: `Les traces de dinosaures de l'étape ${index + 1}`,
      participant_keys: ["hero"],
    })),
  };
}

test("new assignments select V3 while unassigned legacy projects stay on V2", () => {
  assert.equal(createNarrativeEngineAssignment().engine, 3);
  assert.equal(projectUsesNarrativeV3({ continuitySnapshot: { narrativeEngine: createNarrativeEngineAssignment() } }), true);
  assert.equal(narrativeEngineAssignment({ createdAt: "2026-08-01T00:00:00.000Z" }).engine, 2);
});

test("a real customer source compiles once into a reviewable immutable V3 scenario", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-customer-"));
  try {
    const artifactStore = new JsonNarrativeV3ArtifactStore(path.join(directory, "artifacts.json"));
    const sourceProject = project();
    const normalized = normalizeBookRequest({
      questionnaire: sourceProject.questionnaire,
      photos: sourceProject.photoRefs,
    });
    const input = {
      project: sourceProject,
      normalized,
      artifactStore,
      conceptAgent: async (source) => conceptWire(source),
      onStep: async () => {},
      runId: crypto.randomUUID(),
    };
    const first = await generateNarrativeV3Scenario(input);
    assert.equal(first.validation.valid, true);
    assert.equal(validateStoryScenario(first.scenario).valid, true);
    assert.equal(first.scenario.scenes.length, 15);
    assert.ok(first.scenario.scenes.every((scene) => !/\bthe established\b|\bthe fully\b/iu.test(
      `${scene.locationBefore || ""} ${scene.locationAfter || ""}`,
    )));
    assert.ok(
      first.scenario.scenes.some((scene) => (
        scene.locationBefore === "La vallée des dinosaures"
        || scene.locationAfter === "La vallée des dinosaures"
      )),
      JSON.stringify(first.scenario.scenes.map((scene) => [scene.locationBefore, scene.locationAfter])),
    );
    assert.equal(first.canonicalCandidateEvidence.version, 3);
    assert.equal((await artifactStore.listArtifacts(sourceProject.id)).length, 8);
    assert.equal(first.narrativeV3Artifacts.visualIntent.characters[0].outfitPreference, "preserve_photo");
    const blueprint = {
      pages: first.narrativeV3Artifacts.spec.scenes.flatMap((scene) => ([{
        page_number: scene.pageBinding.textPageNumber,
        page_type: "text",
        scene_number: scene.sceneNumber,
      }, {
        page_number: scene.pageBinding.imagePageNumber,
        page_type: "image",
        scene_number: scene.sceneNumber,
      }])),
    };
    const visualPlan = compileSpecDrivenIllustrationPlan({
      spec: first.narrativeV3Artifacts.spec,
      blueprint,
      approvedScenario: first.scenario,
    });
    assert.equal(visualPlan.sceneContracts.length, 15);
    assert.equal(visualPlan.sceneContracts[0].named_characters[0].name, "Lina");
    assert.ok(visualPlan.sceneContracts.every((contract) => contract.main_action.verb));
    assert.ok(visualPlan.sceneContracts.every((contract) => contract.wardrobe_states.length > 0));
    assert.ok(visualPlan.sceneContracts.every((contract) => (
      contract.visible_character_ids.length + contract.forbidden_character_ids.length
      === contract.character_registry.length
    )));
    const approvedProject = {
      ...sourceProject,
      continuitySnapshot: {
        ...sourceProject.continuitySnapshot,
        narrativeV3PipelineVersion: 3,
        narrativeBookSpecV3: first.narrativeV3Artifacts.spec,
        narrativeV3Approval: {
          version: 1,
          scenarioAuditDigest: first.scenario.auditEvidence.digest,
          artifactDigest: first.canonicalCandidateEvidence.artifactDigest,
        },
      },
    };
    assert.equal(
      narrativeBookSpecForPreview(approvedProject, first.scenario).validation.artifactDigest,
      first.canonicalCandidateEvidence.artifactDigest,
    );
    assert.throws(
      () => narrativeBookSpecForPreview(approvedProject, {
        ...first.scenario,
        auditEvidence: { ...first.scenario.auditEvidence, digest: "f".repeat(64) },
      }),
      (error) => error.code === "narrative_v3_spec_stale",
    );
    for (const scene of first.scenario.scenes) {
      const names = scene.characterPresences.map((presence) => presence.name);
      assert.equal(new Set(names).size, names.length);
    }
    const crossing = first.scenario.scenes.find((scene) => scene.transition.kind === "cross_passage");
    const returning = first.scenario.scenes.find((scene) => scene.transition.kind === "return_travel");
    assert.ok(crossing);
    assert.ok(returning);
    assert.equal(crossing.transition.from, returning.transition.to);
    assert.equal(crossing.transition.to, returning.transition.from);

    const replay = await generateNarrativeV3Scenario(input);
    assert.equal(replay.canonicalCandidateEvidence.artifactDigest, first.canonicalCandidateEvidence.artifactDigest);
    assert.equal((await artifactStore.listArtifacts(sourceProject.id)).length, 8);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("one invalid semantic response is corrected before any immutable artifact is written", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-correction-"));
  try {
    const artifactStore = new JsonNarrativeV3ArtifactStore(path.join(directory, "artifacts.json"));
    const sourceProject = project();
    const normalized = normalizeBookRequest({ questionnaire: sourceProject.questionnaire, photos: sourceProject.photoRefs });
    let calls = 0;
    const result = await generateNarrativeV3Scenario({
      project: sourceProject,
      normalized,
      artifactStore,
      conceptAgent: async (source) => {
        calls += 1;
        const wire = conceptWire(source);
        if (calls === 1) wire.beats[0].purpose = "attempt";
        return wire;
      },
    });
    assert.equal(result.validation.valid, true);
    assert.equal(calls, 2);
    assert.equal((await artifactStore.listArtifacts(sourceProject.id)).length, 8);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
