function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function generationCostPolicy() {
  return {
    previewTargetUsd: positiveNumber(process.env.PREVIEW_AI_TARGET_USD, 2),
    previewStretchTargetUsd: positiveNumber(process.env.PREVIEW_AI_STRETCH_TARGET_USD, 1.5),
    scenario: {
      architectCalls: 1,
      editorCalls: 1,
      structuralRepairCalls: 1,
      editorialRepairCalls: 1,
      finalAuditCalls: 1,
      canonicalRepairCalls: 1,
      canonicalFinalAuditCalls: 1,
    },
    manuscript: {
      maximumBatches: 3,
    },
    storyPlan: {
      plannerCalls: 1,
      repairCalls: 1,
    },
  };
}
