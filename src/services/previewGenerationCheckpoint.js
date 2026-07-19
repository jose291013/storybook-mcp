import crypto from "crypto";

const VERSION = 1;

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
  return generationCheckpoint(project)?.retryAvailable === true;
}

export function technicalPreviewRetryExhausted(project) {
  return generationCheckpoint(project)?.retryExhausted === true;
}

export function isReusableDraftPage(page) {
  return Boolean(page && Number.isInteger(Number(page.page_number)) && page.storageKey && page.previewUrl);
}
