import assert from "node:assert/strict";
import test from "node:test";

import {
  STORY_SCENARIO_RETRY_POLICY_VERSION,
  technicalStoryScenarioRetryAvailable,
  technicalStoryScenarioRetryExhausted,
} from "../src/services/storyScenarioRetry.js";

function project(checkpoint) {
  return { continuitySnapshot: { storyScenarioGeneration: checkpoint } };
}

test("the new scenario retry policy restores one recovery to an exhausted older failure", () => {
  const legacy = project({
    status: "failed",
    request: { feedback: "" },
    retryAvailable: false,
    retryExhausted: true,
    retryPolicyVersion: STORY_SCENARIO_RETRY_POLICY_VERSION - 1,
  });
  assert.equal(technicalStoryScenarioRetryAvailable(legacy), true);
  assert.equal(technicalStoryScenarioRetryExhausted(legacy), false);
});

test("the current scenario retry policy does not reopen an exhausted failure", () => {
  const current = project({
    status: "failed",
    request: { feedback: "" },
    retryAvailable: false,
    retryExhausted: true,
    retryPolicyVersion: STORY_SCENARIO_RETRY_POLICY_VERSION,
  });
  assert.equal(technicalStoryScenarioRetryAvailable(current), false);
  assert.equal(technicalStoryScenarioRetryExhausted(current), true);
});

test("the passage-budget checkpoint reopens one version-two exhausted failure", () => {
  const exhausted = project({
    status: "failed",
    request: { feedback: "" },
    retryAvailable: false,
    retryExhausted: true,
    retryPolicyVersion: 2,
    errorCode: "scenario_contract_invalid",
  });
  assert.equal(STORY_SCENARIO_RETRY_POLICY_VERSION, 3);
  assert.equal(technicalStoryScenarioRetryAvailable(exhausted), true);
});
