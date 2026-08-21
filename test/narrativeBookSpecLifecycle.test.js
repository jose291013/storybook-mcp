import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  approveNarrativeBookSpec,
  manuscriptContractContext,
  manuscriptSceneContract,
  narrativeBookSpecForPreview,
  NARRATIVE_V2_PIPELINE_VERSION,
} from "../src/services/narrativeBookSpecLifecycle.js";
import { manuscriptBatches } from "../src/services/manuscriptBatches.js";
import { compileSpecDrivenIllustrationPlan } from "../src/services/specDrivenIllustrationPlan.js";

const example = JSON.parse(fs.readFileSync(
  new URL("../src/contracts/narrativeBookSpec.v1.example.json", import.meta.url),
  "utf8",
));

test("approval seals semantic evidence on the exact compiled artifact", () => {
  const compiled = structuredClone(example);
  compiled.validation.semanticAudit.status = "pending";
  compiled.validation.semanticAudit.auditedAt = null;
  const approved = approveNarrativeBookSpec({
    project: {
      questionnaire: {
        child_safety_profile: { version: 2, category: "general", action: "allow", restricted: false },
        story_sensitivity_profile: { version: 2, level: 1, category: "everyday_challenge", restricted: false },
      },
    },
    scenario: {},
  }, {
    compile: () => compiled,
    now: () => "2026-08-01T10:00:00.000Z",
  });
  assert.equal(approved.validation.semanticAudit.status, "approved");
  assert.equal(approved.validation.semanticAudit.auditedAt, "2026-08-01T10:00:00.000Z");
  assert.equal(approved.validation.semanticAudit.artifactDigest, approved.validation.artifactDigest);
});

test("preview accepts only the approved spec belonging to the exact scenario", () => {
  const project = {
    continuitySnapshot: {
      narrativeV2PipelineVersion: NARRATIVE_V2_PIPELINE_VERSION,
      narrativeBookSpec: example,
    },
  };
  const scenario = { auditEvidence: { digest: example.sourceScenario.digest } };
  assert.equal(narrativeBookSpecForPreview(project, scenario), example);
  assert.throws(
    () => narrativeBookSpecForPreview(project, { auditEvidence: { digest: "c".repeat(64) } }),
    (error) => error.code === "narrative_book_spec_stale",
  );
  assert.equal(narrativeBookSpecForPreview({ continuitySnapshot: {} }, scenario), null);
});

test("manuscript batches receive only their canonical scene contracts", () => {
  const blueprint = {
    pages: example.scenes.flatMap((scene) => ([{
      page_number: scene.pageBinding.textPageNumber,
      page_type: "text",
      scene_number: scene.sceneNumber,
      story_role: scene.narrative.function,
      text_prompt: "legacy prompt must not override the contract",
    }, {
      page_number: scene.pageBinding.imagePageNumber,
      page_type: "image",
      scene_number: scene.sceneNumber,
      story_role: scene.narrative.function,
    }])),
  };
  const visualStoryboard = compileSpecDrivenIllustrationPlan({ spec: example, blueprint });
  const batches = manuscriptBatches({
    pages: blueprint.pages.filter((page) => page.page_type === "text"),
    approvedScenario: { scenes: example.scenes.map((scene) => ({
      sceneNumber: scene.sceneNumber,
      act: scene.act,
    })) },
    narrativeBookSpec: example,
    visualStoryboard,
    heroAge: example.book.audienceAge,
  });
  const page = batches[0].pages[0];
  assert.equal(page.canonical_scene.artifact_digest, example.validation.artifactDigest);
  assert.equal(page.canonical_scene.scene.sceneNumber, page.scene_number);
  assert.ok(page.canonical_scene.registry.characters.length > 0);
  assert.ok(page.canonical_scene.registry.characters.every((character) => (
    page.canonical_scene.scene.presences.some((presence) => presence.characterId === character.id)
  )));
  assert.deepEqual(
    page.canonical_scene.prose_authority.allowed_character_ids,
    page.canonical_scene.scene.presences.map((presence) => presence.characterId).sort(),
  );
  assert.equal(page.visual_beat.artifact_digest, example.validation.artifactDigest);
  assert.equal(page.visual_beat.scene_number, page.scene_number);
  assert.deepEqual(page.visual_beat.visible_instant.main_action, visualStoryboard.sceneContracts[0].main_action);
});

test("spec-driven manuscript context excludes the mutable approved scenario", () => {
  const context = manuscriptContractContext(example);
  assert.equal(context.artifact_digest, example.validation.artifactDigest);
  assert.equal(Object.hasOwn(context, "scenes"), false);
  const scene = manuscriptSceneContract(example, 1);
  assert.equal(scene.scene.id, "scene-1");
  assert.equal(scene.registry.characters.some((character) => character.id === "forest_fairy"), false);
});
