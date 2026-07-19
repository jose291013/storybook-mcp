const DEFAULT_LEGACY_RECOVERY_CUTOFF = "2026-07-19T13:00:00.000Z";

function recoveryCutoff() {
  const configured = String(process.env.REFERENCE_PHOTO_RECOVERY_CUTOFF || DEFAULT_LEGACY_RECOVERY_CUTOFF);
  const parsed = Date.parse(configured);
  return Number.isFinite(parsed) ? parsed : Date.parse(DEFAULT_LEGACY_RECOVERY_CUTOFF);
}

export function referencePhotoRecoveryAvailable(project) {
  if (!project?.previewResult || project.status !== "preview_ready") return false;
  if (!project.createdAt || Date.parse(project.createdAt) > recoveryCutoff()) return false;
  const recovery = project.continuitySnapshot?.referenceRecovery;
  if (recovery?.requestedAt || recovery?.consumedAt || recovery?.completedAt) return false;

  const photoRefs = Array.isArray(project.photoRefs) ? project.photoRefs : [];
  const canons = Array.isArray(project.continuitySnapshot?.characterCanons)
    ? project.continuitySnapshot.characterCanons
    : [];
  const missingDurableReference = photoRefs.some((photo) => !photo?.storageKey);
  const missingCanon = !canons.length || photoRefs.some((photo) => (
    !canons.some((canon) => String(canon?.photoId || "") === String(photo?.id || ""))
  ));
  return missingDurableReference || missingCanon;
}

export function technicalReferenceRetryAvailable(project) {
  return project?.continuitySnapshot?.referenceRecovery?.available === true;
}
