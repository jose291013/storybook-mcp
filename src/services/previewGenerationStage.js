const PREVIEW_GENERATION_STAGES = new Set(["cover", "regenerate", "interior"]);

/**
 * The persisted cover decision, not the browser action that happened to start
 * this request, owns the customer-visible generation stage.
 */
export function previewGenerationStage({ visualProofStatus = "", visualProofAction = "" } = {}) {
  if (visualProofAction === "regenerate" || visualProofStatus === "regenerating") return "regenerate";
  if (visualProofAction === "approve" || visualProofStatus === "approved") return "interior";
  return "cover";
}

export function isPreviewGenerationStage(value) {
  return PREVIEW_GENERATION_STAGES.has(String(value || ""));
}
