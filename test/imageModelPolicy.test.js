import test from "node:test";
import assert from "node:assert/strict";
import {
  assignImageModelPolicy,
  GPT_IMAGE_25_FLARE_MODEL,
  GPT_IMAGE_25_SUNBURST_MODEL,
  imageModelPolicyForProject,
  selectImageModel,
} from "../src/services/imageModelPolicy.js";

function withRollout(value, callback) {
  const previous = process.env.GPT_IMAGE_25_ROLLOUT_PERCENT;
  process.env.GPT_IMAGE_25_ROLLOUT_PERCENT = String(value);
  try { return callback(); }
  finally {
    if (previous == null) delete process.env.GPT_IMAGE_25_ROLLOUT_PERCENT;
    else process.env.GPT_IMAGE_25_ROLLOUT_PERCENT = previous;
  }
}

test("new canary books route standard work to Flare and precision work to Sunburst", () => {
  withRollout(100, () => {
    const policy = assignImageModelPolicy({ projectId: "new-project" });
    assert.equal(policy.cohort, "gpt_image_25_hybrid");
    assert.equal(selectImageModel({ policy, role: "generation", fallbackModel: "gpt-image-2" }), GPT_IMAGE_25_FLARE_MODEL);
    assert.equal(selectImageModel({ policy, role: "precision", fallbackModel: "gpt-image-2" }), GPT_IMAGE_25_SUNBURST_MODEL);
  });
});

test("rollout assignment is deterministic and the persisted policy is immutable on retry", () => {
  withRollout(100, () => {
    const first = assignImageModelPolicy({ projectId: "stable-project" });
    process.env.GPT_IMAGE_25_ROLLOUT_PERCENT = "0";
    const resumed = assignImageModelPolicy({
      projectId: "stable-project",
      existingCheckpoint: { imageModelPolicy: first },
    });
    assert.deepEqual(resumed, first);
  });
});

test("books started before the policy remain on their legacy route", () => {
  withRollout(100, () => {
    const policy = assignImageModelPolicy({ projectId: "old-project", existingCheckpoint: { phase: "page:7" } });
    assert.equal(policy.cohort, "gpt_image_2_control");
    assert.equal(selectImageModel({ policy, role: "precision", fallbackModel: "gpt-image-2" }), "gpt-image-2");
  });
});

test("repair routes recover the immutable policy stored in the project checkpoint", () => {
  const policy = assignImageModelPolicy({ projectId: "repair-project" });
  const project = { continuitySnapshot: { generationCheckpoint: { version: 1, imageModelPolicy: policy } } };
  assert.deepEqual(imageModelPolicyForProject(project), policy);
});
