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
