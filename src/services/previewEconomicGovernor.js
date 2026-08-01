import { generationCostPolicy } from "./generationCostPolicy.js";
import { currentBookCostUsdMicros } from "./openaiCostLedger.js";

export const PREVIEW_ECONOMIC_GOVERNOR_VERSION = 1;

export function previewEconomicDecision(spentUsdMicros = 0, policy = generationCostPolicy()) {
  const target = Math.round(policy.previewTargetUsd * 1_000_000);
  const hard = Math.round(policy.previewHardLimitUsd * 1_000_000);
  const spent = Math.max(0, Number(spentUsdMicros || 0));
  const mode = spent >= hard ? "completion_first" : spent >= target ? "containment" : "normal";
  return {
    version: PREVIEW_ECONOMIC_GOVERNOR_VERSION,
    mode,
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
  return previewEconomicDecision(spent, policy);
}
