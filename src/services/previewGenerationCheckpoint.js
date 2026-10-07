import crypto from "crypto";

const VERSION = 1;
export const PREVIEW_RETRY_POLICY_VERSION = 47;
export const ORDINARY_OUTFIT_BINDING_VERSION = 1;

// Fingerprints created before V23 did not contain this optional authority.
// Keep every compatibility projection explicit and append-only: future input
// additions must add their own projection instead of silently invalidating an
// already approved scenario or a resumable generation checkpoint.
const LEGACY_OPTIONAL_ANSWER_PROJECTIONS = Object.freeze([
  Object.freeze(["story_seed_participant_refs"]),
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function previewRequestFingerprint(normalized) {
  const payload = {
    answers: normalized?.answers || {},
    photos: (normalized?.photos || []).map((photo) => ({
      id: photo.id,
      storageKey: photo.storageKey,
      role: photo.role,
      story_role: photo.story_role,
      name: photo.name,
      relationship: photo.relationship,
      ...(photo.outfit_selection_explicit ? {
        outfit_preference: photo.outfit_preference,
        outfit_id: photo.outfit_id,
        outfit_contract: photo.outfit_contract,
      } : {}),
    })),
  };
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(payload))).digest("hex");
}

export function previewRequestFingerprintCandidates(normalized) {
  const candidates = [previewRequestFingerprint(normalized)];
  for (const optionalKeys of LEGACY_OPTIONAL_ANSWER_PROJECTIONS) {
    const answers = { ...(normalized?.answers || {}) };
    let changed = false;
    for (const key of optionalKeys) {
      if (answers[key] === "" || answers[key] == null) {
        delete answers[key];
        changed = true;
      }
    }
    if (!changed) continue;
    candidates.push(previewRequestFingerprint({ ...normalized, answers }));
  }
  return [...new Set(candidates)];
}

export function generationCheckpoint(project, fingerprint = "") {
  const checkpoint = project?.continuitySnapshot?.generationCheckpoint;
  if (!checkpoint || checkpoint.version !== VERSION) return null;
  if (fingerprint && checkpoint.fingerprint !== fingerprint) return null;
  return checkpoint;
}

export function mergeGenerationCheckpoint(snapshot = {}, checkpoint = {}) {
  return {
    ...snapshot,
    generationCheckpoint: {
      version: VERSION,
      ...(snapshot.generationCheckpoint || {}),
      ...checkpoint,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function technicalPreviewRetryAvailable(project) {
  const checkpoint = generationCheckpoint(project);
  if (!checkpoint) return false;
  if (ordinaryOutfitBindingRecoveryAvailable(project)) return true;
  if (checkpoint.causalRecovery?.available === true) return true;
  if (["preview_interrupted", "preview_provider_billing_unavailable"].includes(checkpoint.failureReason)) return true;
  if (checkpoint.retryAvailable === true) return true;
  return checkpoint.retryExhausted === true
    && Number(checkpoint.retryPolicyVersion || 1) < PREVIEW_RETRY_POLICY_VERSION;
}

export function ordinaryOutfitBindingRecoveryAvailable(project) {
  const checkpoint = generationCheckpoint(project);
  if (!checkpoint || project?.status !== "preview_failed" || checkpoint.retryExhausted !== true
    || Number(checkpoint.ordinaryOutfitBindingVersion || 0) >= ORDINARY_OUTFIT_BINDING_VERSION) return false;
  if (checkpoint.failureDetailCode === "scene_render_ordinary_outfit_unbound") return true;
  // Older checkpoints persisted only the public error code. Recognize the
  // narrow boundary after approved text/cover, before any wardrobe asset.
  return checkpoint.failureReason === "preview_generation_failed"
    && checkpoint.phase === "v3-text-authority"
    && checkpoint.visualProof?.status === "approved"
    && !checkpoint.wardrobeVisualAuthority;
}

export function previewContinuationPolicy({ project, checkpoint, visualProofTransition, causalRecoveryAvailable = false }) {
  // A customer's first approve/regenerate decision is part of the original
  // production. Resuming that decision after a failure is a technical retry.
  const freshCoverDecision = Boolean(visualProofTransition && !visualProofTransition.resumed);
  const technicalRetry = Boolean(checkpoint) && !freshCoverDecision
    && (technicalPreviewRetryAvailable(project) || causalRecoveryAvailable
      || (project.status === "preview_generating" && visualProofTransition?.resumed === true));
  return {
    technicalRetry,
    reusesEntitlement: technicalRetry || Boolean(checkpoint && visualProofTransition),
    exhausted: Boolean(checkpoint && project.status === "preview_failed" && !freshCoverDecision && !technicalRetry),
  };
}

export function technicalPreviewRetryExhausted(project) {
  const checkpoint = generationCheckpoint(project);
  return checkpoint?.retryExhausted === true && !technicalPreviewRetryAvailable(project);
}

export function isReusableDraftPage(page) {
  return Boolean(page && Number.isInteger(Number(page.page_number)) && page.storageKey && page.previewUrl);
}
