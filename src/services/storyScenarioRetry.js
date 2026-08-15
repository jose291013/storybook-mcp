export const STORY_SCENARIO_RETRY_POLICY_VERSION = 6;
export const STORY_SCENARIO_CANONICAL_LIFECYCLE_RECOVERY_VERSION = 1;

export function technicalStoryScenarioRetryAvailable(project = {}) {
  const checkpoint = project?.continuitySnapshot?.storyScenarioGeneration;
  if (checkpoint?.status !== "failed" || !checkpoint?.request) return false;
  if (checkpoint.retryAvailable === true) return true;
  if (Number(checkpoint.semanticAuditCheckpoint?.version) === 1
    && checkpoint.request?.semanticAuditRecovery !== true) return true;
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
