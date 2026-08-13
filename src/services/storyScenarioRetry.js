export const STORY_SCENARIO_RETRY_POLICY_VERSION = 4;

export function technicalStoryScenarioRetryAvailable(project = {}) {
  const checkpoint = project?.continuitySnapshot?.storyScenarioGeneration;
  if (checkpoint?.status !== "failed" || !checkpoint?.request) return false;
  if (checkpoint.retryAvailable === true) return true;
  if (Number(checkpoint.semanticAuditCheckpoint?.version) === 1
    && checkpoint.request?.semanticAuditRecovery !== true) return true;
  return checkpoint.retryExhausted === true
    && Number(checkpoint.retryPolicyVersion || 1) < STORY_SCENARIO_RETRY_POLICY_VERSION;
}

export function technicalStoryScenarioRetryExhausted(project = {}) {
  const checkpoint = project?.continuitySnapshot?.storyScenarioGeneration;
  return checkpoint?.retryExhausted === true && !technicalStoryScenarioRetryAvailable(project);
}
