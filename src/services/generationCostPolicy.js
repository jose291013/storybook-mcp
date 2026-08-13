function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function generationCostPolicy() {
  const previewTargetUsd = positiveNumber(process.env.PREVIEW_AI_TARGET_USD, 2);
  return {
    previewTargetUsd,
    previewStretchTargetUsd: positiveNumber(process.env.PREVIEW_AI_STRETCH_TARGET_USD, 1.5),
    previewHardLimitUsd: positiveNumber(process.env.PREVIEW_AI_HARD_LIMIT_USD, Math.max(3, previewTargetUsd * 1.5)),
    estimatedInteriorImageUsd: positiveNumber(process.env.PREVIEW_ESTIMATED_INTERIOR_IMAGE_USD, 0.05),
    scenario: {
      architectCalls: 1,
      editorCalls: 1,
      // Structural, canonical and semantic corrections are separate bounded
      // phases. One class of defect must never consume another gate's only
      // chance to correct an otherwise coherent draft.
      maximumRepairCalls: 1,
      maximumEditorialRepairCalls: 1,
      maximumCanonicalRepairCalls: 1,
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
    containment: {
      skipOptionalVisualRetriesAtTarget: true,
      completionFirstAtHardLimit: true,
      customerBlocking: false,
    },
  };
}
