import assert from "node:assert/strict";
import test from "node:test";

import { createPagePlan } from "../src/config/bookStructure.js";
import {
  compileVisualComposition,
  wholeBookVisualRhythmIssues,
  visualCompositionPlanIssues,
  VISUAL_COMPOSITION_PLAN_VERSION,
} from "../src/services/visualCompositionPlan.js";

function compositionsFor(pageCount) {
  let previousCompositionId = "";
  return createPagePlan(pageCount)
    .filter((page) => page.page_type === "image")
    .map((page) => {
      const composition = compileVisualComposition({
        sceneNumber: page.scene_number,
        storyRole: page.story_role,
        visibleCharacterCount: page.scene_number % 4,
        previousCompositionId,
      });
      previousCompositionId = composition.composition_id;
      return { scene_number: page.scene_number, visual_composition: composition };
    });
}

test("every sellable length receives a complete non-repeating composition rhythm", () => {
  for (const pageCount of [24, 28, 32, 36, 40, 44]) {
    const contracts = compositionsFor(pageCount);
    assert.deepEqual(visualCompositionPlanIssues(contracts), [], `page count ${pageCount}`);
    assert.ok(new Set(contracts.map((contract) => contract.visual_composition.composition_id)).size >= 7);
    assert.ok(contracts.every((contract) => (
      contract.visual_composition.version === VISUAL_COMPOSITION_PLAN_VERSION
    )));
    assert.deepEqual(wholeBookVisualRhythmIssues(contracts), [], `whole-book rhythm ${pageCount}`);
  }
});

test("whole-book rhythm rejects a flattened climax and four identical scales", () => {
  const contracts = compositionsFor(44);
  const climax = contracts.find((contract) => contract.visual_composition.story_role === "climax");
  climax.visual_composition.energy_level = 2;
  climax.visual_composition.composition_id = "relational_two_shot";
  for (const contract of contracts.slice(0, 4)) contract.visual_composition.scale_family = "medium";
  const issues = wholeBookVisualRhythmIssues(contracts);
  assert.ok(issues.includes("whole-book visual climax does not carry the unique peak composition"));
  assert.ok(issues.some((issue) => /repeats one scale family four times/u.test(issue)));
});

test("a real world crossing overlays threshold topology without erasing narrative energy", () => {
  const composition = compileVisualComposition({
    sceneNumber: 5,
    storyRole: "first_attempt",
    transitionKind: "cross_passage",
    visibleCharacterCount: 3,
  });
  assert.equal(composition.composition_id, "diagonal_action");
  assert.equal(composition.energy_level, 4);
  assert.match(composition.depth_plan, /departure side.*passage.*destination side/iu);
  assert.equal(composition.invariant_engine.topologyOverlayRequired, true);
  assert.match(composition.cast_readability, /never crop or merge/iu);

  const adjacentReturn = compileVisualComposition({
    sceneNumber: 6,
    storyRole: "return_home_and_moral",
    transitionKind: "return_travel",
    visiblePhase: "during",
    visibleCharacterCount: 3,
    previousCompositionId: composition.composition_id,
  });
  assert.equal(adjacentReturn.composition_id, "intimate_reflection");
  assert.equal(adjacentReturn.energy_level, 1);
  assert.match(adjacentReturn.depth_plan, /departure side.*passage.*destination side/iu);
});

test("a completed final return illustrates the settled moral rather than the crossing", () => {
  const settledReturn = compileVisualComposition({
    sceneNumber: 15,
    storyRole: "return_home_and_moral",
    transitionKind: "return_travel",
    visiblePhase: "end",
    visibleCharacterCount: 2,
  });
  assert.equal(settledReturn.composition_id, "intimate_reflection");
  assert.ok(settledReturn.energy_level <= 2);
  assert.deepEqual(wholeBookVisualRhythmIssues([{
    scene_number: 15,
    visual_composition: settledReturn,
  }]), []);

  const crossingReturn = compileVisualComposition({
    sceneNumber: 15,
    storyRole: "return_home_and_moral",
    transitionKind: "return_travel",
    visiblePhase: "during",
    visibleCharacterCount: 2,
  });
  assert.equal(crossingReturn.composition_id, "intimate_reflection");
  assert.equal(crossingReturn.energy_level, 1);
  assert.match(crossingReturn.depth_plan, /departure side.*passage.*destination side/iu);

  const settledAfterReflection = compileVisualComposition({
    sceneNumber: 15,
    storyRole: "return_home_and_moral",
    transitionKind: "return_travel",
    visiblePhase: "end",
    visibleCharacterCount: 2,
    previousCompositionId: "intimate_reflection",
  });
  assert.equal(settledAfterReflection.composition_id, "layered_resolution");
  assert.ok(settledAfterReflection.energy_level <= 2);
});

test("adjacent repeated roles still receive different deterministic layouts", () => {
  const first = compileVisualComposition({ sceneNumber: 6, storyRole: "meeting_the_guide" });
  const second = compileVisualComposition({
    sceneNumber: 7,
    storyRole: "bond_with_the_guide",
    previousCompositionId: first.composition_id,
  });
  assert.notEqual(second.composition_id, first.composition_id);
});
