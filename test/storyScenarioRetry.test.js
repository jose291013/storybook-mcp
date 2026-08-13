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

test("a private semantic checkpoint opens exactly one targeted recovery", () => {
  const recoverable = project({
    status: "failed",
    retryAvailable: false,
    retryExhausted: true,
    retryPolicyVersion: STORY_SCENARIO_RETRY_POLICY_VERSION,
    request: { feedback: "" },
    semanticAuditCheckpoint: {
      version: 1,
      runId: "run-1",
      stepKey: "semantic-audit-checkpoint:v1",
      candidateNumber: 1,
    },
  });
  assert.equal(technicalStoryScenarioRetryAvailable(recoverable), true);
  recoverable.continuitySnapshot.storyScenarioGeneration.request.semanticAuditRecovery = true;
  assert.equal(technicalStoryScenarioRetryAvailable(recoverable), false);
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
  assert.equal(STORY_SCENARIO_RETRY_POLICY_VERSION, 4);
  assert.equal(technicalStoryScenarioRetryAvailable(exhausted), true);
});
