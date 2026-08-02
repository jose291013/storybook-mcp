import { generationCostPolicy } from "./generationCostPolicy.js";
import { currentBookCostUsdMicros } from "./openaiCostLedger.js";

export const PREVIEW_ECONOMIC_GOVERNOR_VERSION = 2;

export function previewEconomicDecision(
  spentUsdMicros = 0,
  policy = generationCostPolicy(),
  projection = {},
) {
  const target = Math.round(policy.previewTargetUsd * 1_000_000);
  const stretchTarget = Math.round(
    Number(policy.previewStretchTargetUsd || policy.previewTargetUsd) * 1_000_000,
  );
  const hard = Math.round(policy.previewHardLimitUsd * 1_000_000);
  const spent = Math.max(0, Number(spentUsdMicros || 0));
  const mandatoryRemaining = Math.max(
    0,
    Number(projection.estimatedMandatoryRemainingUsdMicros || 0),
  );
  const optionalRetry = Math.max(
    0,
    Number(projection.estimatedOptionalRetryUsdMicros || 0),
  );
  const projectedWithOptionalRetry = spent + mandatoryRemaining + optionalRetry;
  const projectionRequiresContainment = mandatoryRemaining > 0
    && projectedWithOptionalRetry > stretchTarget;
  const mode = spent >= hard
    ? "completion_first"
    : spent >= target || projectionRequiresContainment
      ? "containment"
      : "normal";
  const reason = spent >= hard
    ? "hard_limit"
    : spent >= target
      ? "soft_target"
      : projectionRequiresContainment
        ? "projected_stretch_target"
        : "within_target";
  return {
    version: PREVIEW_ECONOMIC_GOVERNOR_VERSION,
    mode,
    reason,
    optionalVisualRetry: mode === "normal",
    optionalNarrativeAudit: mode === "normal",
    mustCompleteRequiredPages: true,
    customerBlocking: false,
  };
}

export async function evaluatePreviewEconomicGovernor(projectId, options = {}) {
  const readCost = options.readCost || currentBookCostUsdMicros;
  const policy = options.policy || generationCostPolicy();
  const spent = await readCost(projectId);
  return previewEconomicDecision(spent, policy, options.projection);
}
