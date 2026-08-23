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
  const brief = source.narrativeBrief;
  return {
    schema_version: 1,
    contract_id: "calitiki.story-concept-wire.v1",
    language: brief.language,
    title: "Lina et la vallée des traces",
    premise: "Lina apprend à comparer les traces avant de choisir son chemin.",
    theme_proof: "Son observation lui permet de corriger son premier choix.",
    hero_arc: {
      desire: brief.narrative_authority.desiredChange,
      initial_doubt: brief.narrative_authority.protectiveDoubt,
      decisive_choice: brief.narrative_authority.childOwnedAction,
      earned_change: brief.narrative_authority.transformation,
    },
    beats: brief.scene_plan.map((planned, index) => ({
      beat_key: planned.beatKey,
      purpose: planned.purpose,
      summary: `Lina accomplit une action distincte dans la vallée, étape ${index + 1}.`,
      emotional_shift: `Sa confiance évolue à l'étape ${index + 1}.`,
      distinctive_image: `Les traces de dinosaures de l'étape ${index + 1}`,
      participant_keys: planned.participantKeys,
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
    assert.equal((await artifactStore.listArtifacts(sourceProject.id)).length, 10);
    assert.equal(first.narrativeV3Artifacts.narrativeBrief.scenePlan.length, 15);
    assert.equal(first.narrativeV3Artifacts.journeyLifecycle.sceneStates.length, 15);
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
    assert.ok(visualPlan.sceneContracts.every((contract) => contract.state_boundary?.version === 1));
    assert.ok(visualPlan.sceneContracts.every((contract) => contract.render_snapshot?.state_boundary?.digest === contract.state_boundary.digest));
    assert.ok(visualPlan.sceneContracts.some((contract) => contract.required_elements.some((element) => (
      element.description === "The accidental or magical cause that reveals the passage is visibly happening."
    ))));
    assert.ok(visualPlan.sceneContracts.some((contract) => contract.required_elements.some((element) => (
      element.description === "Every traveler has retrieved and wears the same ordinary clothes as before departure."
    ))));
    assert.ok(visualPlan.sceneContracts.every((contract) => (
      contract.visible_character_ids.length + contract.forbidden_character_ids.length
      === contract.character_registry.length
    )));
    const phases = visualPlan.sceneContracts.map((contract) => contract.state_boundary.journeyPhase);
    const discoveryIndex = phases.indexOf("passage_discovery");
    const preparationIndex = phases.indexOf("journey_preparation");
    const outboundIndex = phases.indexOf("outbound_crossing");
    const inboundIndex = phases.indexOf("inbound_crossing");
    const restorationIndex = phases.indexOf("restoration_and_storage");
    assert.deepEqual(
      [preparationIndex, outboundIndex, restorationIndex],
      [discoveryIndex + 1, preparationIndex + 1, inboundIndex + 1],
    );
    assert.ok(visualPlan.sceneContracts.slice(0, discoveryIndex).every((contract) => (
      contract.state_boundary.cameraSide === "origin"
      && contract.state_boundary.destinationEnvironmentAllowed === false
      && contract.state_boundary.passageMode === "forbidden"
      && contract.forbidden_elements.some((rule) => rule.includes("cover_location_inherited"))
    )));
    assert.equal(visualPlan.sceneContracts[discoveryIndex].state_boundary.passageMode, "required_closed");
    assert.equal(visualPlan.sceneContracts[preparationIndex].state_boundary.cameraSide, "origin");
    assert.equal(visualPlan.sceneContracts[outboundIndex].causal_frame.visible_phase, "during");
    assert.equal(visualPlan.sceneContracts[outboundIndex].render_snapshot.location, "location_transition");
    assert.equal(visualPlan.sceneContracts[inboundIndex].causal_frame.visible_phase, "during");
    assert.equal(visualPlan.sceneContracts[restorationIndex].state_boundary.travelerOutfitMode, "ordinary");
    const adventureContracts = visualPlan.sceneContracts.filter((contract) => contract.state_boundary.cameraSide === "adventure");
    assert.ok(adventureContracts.length > 0);
    assert.ok(adventureContracts.every((contract) => contract.state_boundary.originWitnessCharacterIds.every((id) => (
      contract.forbidden_character_ids.includes(id)
    ))));
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
    assert.equal((await artifactStore.listArtifacts(sourceProject.id)).length, 10);
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
    assert.equal((await artifactStore.listArtifacts(sourceProject.id)).length, 10);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("the scenario refuses questionnaire data that differs from the project authority", async () => {
  const sourceProject = project();
  const normalized = normalizeBookRequest({ questionnaire: sourceProject.questionnaire, photos: sourceProject.photoRefs });
  await assert.rejects(
    generateNarrativeV3Scenario({
      project: sourceProject,
      normalized: {
        ...normalized,
        answers: { ...normalized.answers, story_intent_message: "une autre intention" },
      },
      conceptAgent: async (source) => conceptWire(source),
    }),
    (error) => error.code === "narrative_v3_questionnaire_source_mismatch",
  );
});
