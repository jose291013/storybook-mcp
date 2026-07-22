import crypto from "crypto";

const VERSION = 1;
export const PREVIEW_RETRY_POLICY_VERSION = 4;

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
    })),
  };
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(payload))).digest("hex");
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
  if (checkpoint.failureReason === "preview_interrupted") return true;
  if (checkpoint.retryAvailable === true) return true;
  return checkpoint.retryExhausted === true
    && Number(checkpoint.retryPolicyVersion || 1) < PREVIEW_RETRY_POLICY_VERSION;
}

export function technicalPreviewRetryExhausted(project) {
  const checkpoint = generationCheckpoint(project);
  return checkpoint?.retryExhausted === true && !technicalPreviewRetryAvailable(project);
}

export function isReusableDraftPage(page) {
  return Boolean(page && Number.isInteger(Number(page.page_number)) && page.storageKey && page.previewUrl);
}
