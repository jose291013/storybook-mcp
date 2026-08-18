import assert from "node:assert/strict";
import test from "node:test";

import {
  STORY_SCENARIO_CANONICAL_LIFECYCLE_RECOVERY_VERSION,
  STORY_SCENARIO_OBJECT_RENDER_RECOVERY_VERSION,
  STORY_SCENARIO_REPAIR_TRANSACTION_RECOVERY_VERSION,
  STORY_SCENARIO_RETRY_POLICY_VERSION,
  storyScenarioRepairTransactionRecoveryAvailable,
  storyScenarioObjectRenderRecoveryAvailable,
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

test("an exhausted object-only semantic checkpoint opens one transactional recovery", () => {
  const recoverable = project({
    status: "failed",
    retryAvailable: false,
    retryExhausted: true,
    request: { semanticAuditRecovery: true },
    semanticAuditCheckpoint: { version: 1 },
    rejectedCandidateFailure: {
      version: 1,
      categories: ["object"],
      sceneNumbers: [7, 8, 9],
    },
  });
  assert.equal(storyScenarioRepairTransactionRecoveryAvailable(recoverable), true);
  assert.equal(technicalStoryScenarioRetryAvailable(recoverable), true);
  recoverable.continuitySnapshot.storyScenarioGeneration.request.repairTransactionRecoveryVersion =
    STORY_SCENARIO_REPAIR_TRANSACTION_RECOVERY_VERSION;
  assert.equal(storyScenarioRepairTransactionRecoveryAvailable(recoverable), false);
  assert.equal(storyScenarioObjectRenderRecoveryAvailable(recoverable), true);
  assert.equal(technicalStoryScenarioRetryAvailable(recoverable), true);
});

test("transactional recovery stays closed for mixed semantic categories", () => {
  const mixed = project({
    status: "failed",
    request: { semanticAuditRecovery: true },
    semanticAuditCheckpoint: { version: 1 },
    rejectedCandidateFailure: {
      categories: ["object", "travel"],
      sceneNumbers: [7],
    },
  });
  assert.equal(storyScenarioRepairTransactionRecoveryAvailable(mixed), false);
});

test("an exhausted object-only checkpoint gets one deterministic render-ledger recovery", () => {
  const recoverable = project({
    status: "failed",
    retryAvailable: false,
    retryExhausted: true,
    request: {
      semanticAuditRecovery: true,
      repairTransactionRecoveryVersion: STORY_SCENARIO_REPAIR_TRANSACTION_RECOVERY_VERSION,
      objectRenderRecoveryVersion: 2,
    },
    semanticAuditCheckpoint: { version: 1 },
    rejectedCandidateFailure: {
      categories: ["object"],
      sceneNumbers: [7, 8, 9, 10, 11, 12, 13],
    },
  });
  assert.equal(STORY_SCENARIO_OBJECT_RENDER_RECOVERY_VERSION, 3);
  assert.equal(storyScenarioObjectRenderRecoveryAvailable(recoverable), true);
  assert.equal(technicalStoryScenarioRetryAvailable(recoverable), true);
  recoverable.continuitySnapshot.storyScenarioGeneration.request.objectRenderRecoveryVersion =
    STORY_SCENARIO_OBJECT_RENDER_RECOVERY_VERSION;
  assert.equal(storyScenarioObjectRenderRecoveryAvailable(recoverable), false);
  assert.equal(technicalStoryScenarioRetryAvailable(recoverable), false);
});

test("an object-only recovery survives when its semantic checkpoint is preserved in the retry request", () => {
  const recoverable = project({
    status: "failed",
    retryAvailable: false,
    retryExhausted: true,
    request: {
      semanticAuditRecovery: true,
      repairTransactionRecoveryVersion: STORY_SCENARIO_REPAIR_TRANSACTION_RECOVERY_VERSION,
      semanticAuditCheckpoint: {
        version: 1,
        runId: "run-preserved",
        stepKey: "semantic-audit-checkpoint:v1",
        candidateNumber: 1,
      },
    },
    rejectedCandidateFailure: {
      categories: ["object"],
      sceneNumbers: [7, 8, 9, 10, 11, 12, 13],
    },
  });
  assert.equal(storyScenarioObjectRenderRecoveryAvailable(recoverable), true);
  assert.equal(technicalStoryScenarioRetryAvailable(recoverable), true);
  recoverable.continuitySnapshot.storyScenarioGeneration.request.objectRenderRecoveryVersion =
    STORY_SCENARIO_OBJECT_RENDER_RECOVERY_VERSION;
  assert.equal(storyScenarioObjectRenderRecoveryAvailable(recoverable), false);
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
  assert.equal(STORY_SCENARIO_RETRY_POLICY_VERSION, 9);
  assert.equal(technicalStoryScenarioRetryAvailable(exhausted), false);
});
