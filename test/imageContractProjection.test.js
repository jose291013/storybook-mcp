import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { compileSpecDrivenIllustrationPlan } from "../src/services/specDrivenIllustrationPlan.js";
import {
  compactImageSceneContract,
  imageContractProjectionIssues,
} from "../src/services/imageVisualContract.js";

const spec = JSON.parse(fs.readFileSync(
  new URL("../src/contracts/narrativeBookSpec.v1.example.json", import.meta.url),
  "utf8",
));

function blueprintFromSpec() {
  return {
    pages: spec.scenes.flatMap((scene) => ([
      { page_number: scene.pageBinding.textPageNumber, page_type: "text", scene_number: scene.sceneNumber },
      { page_number: scene.pageBinding.imagePageNumber, page_type: "image", scene_number: scene.sceneNumber },
    ])),
  };
}

test("every signed beat projects losslessly into its compact image contract", () => {
  const plan = compileSpecDrivenIllustrationPlan({ spec, blueprint: blueprintFromSpec() });
  for (const contract of plan.sceneContracts) {
    assert.deepEqual(imageContractProjectionIssues(contract), [], `scene ${contract.scene_number}`);
  }
});

test("zero-quantity absent objects remain zero in the image contract", () => {
  const compact = compactImageSceneContract({
    main_action: { subject: "Noa", verb: "looks", target: "the empty pedestal" },
    object_states: [{ name: "the pearl", owner: "", state: "absent", quantity: 0, instruction: "must remain absent" }],
  });
  assert.equal(compact.object_states[0].quantity, 0);
});

test("projection preflight catches contract arrays that would be truncated", () => {
  const contract = {
    main_action: { subject: "Noa", verb: "observes", target: "the gathering" },
    named_characters: Array.from({ length: 11 }, (_, index) => ({
      name: `Person ${index + 1}`,
      action: "stands separately",
    })),
  };
  assert.ok(imageContractProjectionIssues(contract).includes("image contract projection loses named cast"));
});

test("V27.1 transports the exact scene boundary and every blocking prohibition", () => {
  const forbiddenElements = Array.from({ length: 19 }, (_, index) => `blocking prohibition ${index + 1}`);
  const stateBoundary = {
    version: 1,
    sourceJourneyLifecycleDigest: "journey-digest",
    journeyPhase: "journey_preparation",
    visiblePhase: "end",
    cameraSide: "origin",
    passageMode: "required_closed",
    destinationEnvironmentAllowed: false,
    travelerOutfitMode: "adventure",
    travelerCharacterIds: ["character_hero", "character_companion"],
    originWitnessCharacterIds: ["character_parent"],
    requiredStateIds: ["origin_environment", "adventure_outfits_worn"],
    forbiddenStateIds: ["destination_environment_as_surroundings", "ordinary_outfits_worn"],
    digest: "boundary-digest",
  };
  const contract = {
    main_action: { subject: "Noa", verb: "prepares", target: "the passage" },
    state_boundary: stateBoundary,
    forbidden_elements: forbiddenElements,
  };

  const compact = compactImageSceneContract(contract);
  assert.equal(compact.forbidden_elements.length, forbiddenElements.length);
  assert.deepEqual(compact.forbidden_elements, forbiddenElements);
  assert.deepEqual(compact.state_boundary, {
    version: 1,
    source_journey_lifecycle_digest: "journey-digest",
    journey_phase: "journey_preparation",
    visible_phase: "end",
    camera_side: "origin",
    passage_mode: "required_closed",
    destination_environment_allowed: false,
    traveler_outfit_mode: "adventure",
    traveler_character_ids: ["character_hero", "character_companion"],
    origin_witness_character_ids: ["character_parent"],
    required_state_ids: ["origin_environment", "adventure_outfits_worn"],
    forbidden_state_ids: ["destination_environment_as_surroundings", "ordinary_outfits_worn"],
    digest: "boundary-digest",
  });
  assert.deepEqual(imageContractProjectionIssues(contract), []);
});
