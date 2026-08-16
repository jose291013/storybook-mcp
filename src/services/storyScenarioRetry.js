export const STORY_SCENARIO_RETRY_POLICY_VERSION = 8;
export const STORY_SCENARIO_CANONICAL_LIFECYCLE_RECOVERY_VERSION = 2;
export const STORY_SCENARIO_REPAIR_TRANSACTION_RECOVERY_VERSION = 1;

export function storyScenarioRepairTransactionRecoveryAvailable(project = {}) {
  const checkpoint = project?.continuitySnapshot?.storyScenarioGeneration;
  const failure = checkpoint?.rejectedCandidateFailure;
  const categories = Array.isArray(failure?.categories) ? failure.categories : [];
  const sceneNumbers = Array.isArray(failure?.sceneNumbers) ? failure.sceneNumbers : [];
  return checkpoint?.status === "failed"
    && Boolean(checkpoint?.request)
    && Number(checkpoint?.semanticAuditCheckpoint?.version) === 1
    && checkpoint.request?.semanticAuditRecovery === true
    && Number(checkpoint.request?.repairTransactionRecoveryVersion || 0)
      < STORY_SCENARIO_REPAIR_TRANSACTION_RECOVERY_VERSION
    && categories.length === 1
    && categories[0] === "object"
    && sceneNumbers.some((number) => Number(number) > 0);
}

export function technicalStoryScenarioRetryAvailable(project = {}) {
  const checkpoint = project?.continuitySnapshot?.storyScenarioGeneration;
  if (checkpoint?.status !== "failed" || !checkpoint?.request) return false;
  if (checkpoint.retryAvailable === true) return true;
  if (Number(checkpoint.semanticAuditCheckpoint?.version) === 1
    && checkpoint.request?.semanticAuditRecovery !== true) return true;
  if (storyScenarioRepairTransactionRecoveryAvailable(project)) return true;
  if (Number(checkpoint.canonicalCandidateCheckpoint?.version) === 1
    && checkpoint.request?.canonicalCheckpointRecovery !== true) return true;
  if (Number(checkpoint.canonicalCandidateCheckpoint?.version) === 1
    && Number(checkpoint.request?.canonicalLifecycleRecoveryVersion || 0)
      < STORY_SCENARIO_CANONICAL_LIFECYCLE_RECOVERY_VERSION) return true;
  return false;
}

export function technicalStoryScenarioRetryExhausted(project = {}) {
  const checkpoint = project?.continuitySnapshot?.storyScenarioGeneration;
  return checkpoint?.retryExhausted === true && !technicalStoryScenarioRetryAvailable(project);
}
