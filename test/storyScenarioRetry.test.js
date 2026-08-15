import assert from "node:assert/strict";
import test from "node:test";

import {
  STORY_SCENARIO_CANONICAL_LIFECYCLE_RECOVERY_VERSION,
  STORY_SCENARIO_RETRY_POLICY_VERSION,
  technicalStoryScenarioRetryAvailable,
  technicalStoryScenarioRetryExhausted,
} from "../src/services/storyScenarioRetry.js";

function project(checkpoint) {
  return { continuitySnapshot: { storyScenarioGeneration: checkpoint } };
}

test("an exhausted older failure without a private candidate stays closed", () => {
  const legacy = project({
    status: "failed",
    request: { feedback: "" },
    retryAvailable: false,
    retryExhausted: true,
    retryPolicyVersion: STORY_SCENARIO_RETRY_POLICY_VERSION - 1,
  });
  assert.equal(technicalStoryScenarioRetryAvailable(legacy), false);
  assert.equal(technicalStoryScenarioRetryExhausted(legacy), true);
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

test("a private canonical checkpoint opens exactly one targeted recovery", () => {
  const recoverable = project({
    status: "failed",
    retryAvailable: false,
    retryExhausted: true,
    retryPolicyVersion: STORY_SCENARIO_RETRY_POLICY_VERSION,
    request: { feedback: "" },
    canonicalCandidateCheckpoint: {
      version: 1,
      runId: "run-1",
      stepKey: "canonical-candidate-checkpoint:v1",
      candidateNumber: 1,
    },
  });
  assert.equal(technicalStoryScenarioRetryAvailable(recoverable), true);
  recoverable.continuitySnapshot.storyScenarioGeneration.request.canonicalCheckpointRecovery = true;
  assert.equal(technicalStoryScenarioRetryAvailable(recoverable), true);
  recoverable.continuitySnapshot.storyScenarioGeneration.request.canonicalLifecycleRecoveryVersion = 1;
  assert.equal(technicalStoryScenarioRetryAvailable(recoverable), true);
  recoverable.continuitySnapshot.storyScenarioGeneration.request.canonicalLifecycleRecoveryVersion =
    STORY_SCENARIO_CANONICAL_LIFECYCLE_RECOVERY_VERSION;
  assert.equal(technicalStoryScenarioRetryAvailable(recoverable), false);
});

test("a version-two exhausted failure without a candidate is not replayed", () => {
  const exhausted = project({
    status: "failed",
    request: { feedback: "" },
    retryAvailable: false,
    retryExhausted: true,
    retryPolicyVersion: 2,
    errorCode: "scenario_contract_invalid",
  });
  assert.equal(STORY_SCENARIO_RETRY_POLICY_VERSION, 7);
  assert.equal(technicalStoryScenarioRetryAvailable(exhausted), false);
});
