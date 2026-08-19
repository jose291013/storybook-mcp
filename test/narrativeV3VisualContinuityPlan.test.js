import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getWordsTargetByAge } from "../src/config/readingGuidance.js";
import { parseManuscriptWire } from "../src/contracts/manuscriptV1.js";
import { compileNarrativeBookSpecV3 } from "../src/contracts/narrativeBookSpecV3.js";
import { compileObjectLifecycleProjection } from "../src/contracts/objectLifecycleProjection.js";
import {
  compileVisualContinuityPlan,
  loadVisualContinuityPlan,
  visualContinuityWindow,
} from "../src/contracts/visualContinuityPlanV1.js";
import { compileVisualStoryboard } from "../src/contracts/visualStoryboardV1.js";
import { buildNarrativeV3ObjectFixture } from "../src/services/narrativeV3ObjectLifecycleMatrix.js";
import { JsonNarrativeV3RunStore } from "../src/services/narrativeV3StateMachine.js";

function fixture(raw = {}) {
  const source = buildNarrativeV3ObjectFixture(raw);
  const projection = compileObjectLifecycleProjection({ graph: source.graph });
  const spec = compileNarrativeBookSpecV3({
    intent: source.intent,
    graph: source.graph,
    objectProjection: projection,
    profileBindings: source.profileBindings,
  });
  const word = { FR: "histoire", ES: "historia", EN: "story" }[spec.book.language];
  const manuscript = parseManuscriptWire({
    spec,
    wire: {
      schema_version: 1,
      contract_id: "calitiki.manuscript-wire.v1",
      source_spec_digest: spec.validation.artifactDigest,
      language: spec.book.language,
      pages: spec.pages.filter((page) => ["opening_text", "scene_text", "closing_text"].includes(page.kind)).map((page) => {
        const guidance = getWordsTargetByAge(spec.book.audienceAge, page.kind === "scene_text" ? "text" : page.kind);
        return { page_number: page.pageNumber, text: Array(guidance.target).fill(word).join(" ") };
      }),
    },
  });
  const storyboard = compileVisualStoryboard({ spec, manuscript });
  const plan = compileVisualContinuityPlan({ spec, storyboard });
  return { spec, storyboard, plan };
}

test("the continuity plan binds canonical identities and every previous-current-next state window", () => {
  const { spec, storyboard, plan } = fixture({ language: "FR", universeId: "coral_ocean" });
  assert.equal(plan.windows.length, storyboard.beats.length);
  assert.deepEqual(
    plan.identityAnchors.map((entry) => entry.characterId),
    spec.registries.characters.map((entry) => entry.id),
  );
  assert.equal(plan.referencePolicy.identityAuthority, "canonical_identity_only");
  assert.equal(plan.referencePolicy.sceneAuthority, "current_state_only");
  assert.equal(plan.referencePolicy.previousAcceptedImageRole, "secondary_continuity_only");
  assert.equal(plan.referencePolicy.nextSceneRole, "prospective_constraints_only");
  assert.ok(plan.referencePolicy.forbiddenPreviousImageDomains.includes("equipment"));
  assert.ok(plan.referencePolicy.forbiddenPreviousImageDomains.includes("cast_cardinality"));
  plan.windows.forEach((window, index) => {
    assert.equal(window.beatDigest, storyboard.beats[index].beatDigest);
    assert.equal(window.incoming?.transitionDigest || null, plan.windows[index - 1]?.outgoing?.transitionDigest || null);
    assert.equal(window.outgoing?.transitionDigest || null, plan.windows[index + 1]?.incoming?.transitionDigest || null);
  });
  assert.equal(Object.isFrozen(plan), true);
});

test("underwater equipment transitions are explicit and cannot be inherited from the previous image", () => {
  const { plan } = fixture({ language: "ES", universeId: "coral_ocean" });
  const equipmentEdges = plan.windows
    .map((window) => window.outgoing)
    .filter((edge) => edge?.changedEquipmentCharacterIds.length);
  assert.ok(equipmentEdges.length >= 2);
  equipmentEdges.forEach((edge) => {
    assert.ok(edge.changedEquipmentCharacterIds.length >= 1);
    assert.match(edge.handoffLocationId, /^[a-z0-9][a-z0-9_-]+$/);
  });
  assert.ok(plan.referencePolicy.forbiddenPreviousImageDomains.includes("wardrobe"));
  assert.ok(plan.referencePolicy.forbiddenPreviousImageDomains.includes("equipment"));
});

test("loading rejects a stale current state or an altered prospective transition", () => {
  const { plan } = fixture({ language: "EN", universeId: "starry_space" });
  assert.deepEqual(loadVisualContinuityPlan(structuredClone(plan)), plan);
  assert.equal(visualContinuityWindow(plan, 2).sceneNumber, 2);
  const changedCurrent = structuredClone(plan);
  changedCurrent.windows[1].current.physical.locationId = "altered_location";
  assert.throws(
    () => loadVisualContinuityPlan(changedCurrent),
    (error) => error.artifactType === "visual_continuity_plan_v1",
  );
  const changedNext = structuredClone(plan);
  changedNext.windows[1].outgoing.changedEquipmentCharacterIds = ["character_hero"];
  assert.throws(
    () => loadVisualContinuityPlan(changedNext),
    (error) => error.artifactType === "visual_continuity_plan_v1",
  );
});

test("the durable continuity step requires exact ordered spec and storyboard parents", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-continuity-step-"));
  try {
    const store = new JsonNarrativeV3RunStore(path.join(directory, "runs.json"));
    await assert.rejects(store.enqueue({
      projectId: crypto.randomUUID(),
      runKey: "invalid-continuity-parent",
      steps: [{
        stepKey: "compile-continuity",
        stepType: "compile_visual_continuity_plan",
        inputs: [
          { artifactId: crypto.randomUUID(), artifactType: "visual_storyboard", artifactDigest: "a".repeat(64) },
          { artifactId: crypto.randomUUID(), artifactType: "narrative_book_spec_v3", artifactDigest: "b".repeat(64) },
        ],
      }],
    }), (error) => error.code === "invalid_step_inputs");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("migration 026 adds only the isolated continuity artifact and step", async () => {
  const migration = await fs.readFile("db/migrations/026_narrative_v3_visual_continuity_plan.sql", "utf8");
  assert.match(migration, /'visual_continuity_plan'/);
  assert.match(migration, /'compile_visual_continuity_plan'/);
  assert.doesNotMatch(migration, /book_projects\s+ADD|UPDATE\s+book_projects/i);
});
