import { findIllustrationStyle } from "../config/illustrationStyles.js";

export const VISUAL_BIBLE_VERSION = 1;
export const APPROVED_COVER_REFERENCE_POLICY = "approved_cover_primary_identity_secondary";

function clean(value) {
  return String(value || "").trim();
}

export function createApprovedCoverVisualBible(project, approvedAt = new Date().toISOString()) {
  const coverImageStorageKey = clean(
    project?.previewResult?.coverImageStorageKey
      || project?.previewResult?.coverStorageKey,
  );
  if (!coverImageStorageKey) return null;

  const styleId = clean(
    project?.questionnaire?.style_id
      || project?.productConfiguration?.style_id,
  );
  const style = findIllustrationStyle(styleId);
  return {
    version: VISUAL_BIBLE_VERSION,
    status: "locked",
    lockedAt: approvedAt,
    coverImageStorageKey,
    styleId: style?.id || styleId,
    renderingMode: style?.renderingMode || "illustrated_faithful",
    likenessGoal: style?.likeness || "strong",
    referencePolicy: APPROVED_COVER_REFERENCE_POLICY,
  };
}

export function visualBibleCoverStorageKey(project) {
  return clean(
    project?.continuitySnapshot?.visualBible?.coverImageStorageKey
      || project?.previewResult?.coverImageStorageKey
      || project?.previewResult?.coverStorageKey,
  );
}
