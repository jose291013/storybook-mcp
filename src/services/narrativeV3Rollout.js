import crypto from "node:crypto";

export const NARRATIVE_V3_ROLLOUT_VERSION = 1;
const MODES = new Set(["off", "shadow", "canary", "on"]);
const DIGEST_RE = /^[a-f0-9]{64}$/;

function modeValue(value) {
  const mode = String(value || "off").trim().toLowerCase();
  return MODES.has(mode) ? mode : "off";
}

function percentValue(value) {
  const percent = Number(value);
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
}

export function narrativeV3RolloutBucket(projectId = "") {
  return crypto.createHash("sha256").update(String(projectId)).digest().readUInt32BE(0) % 100;
}

export function createNarrativeV3RolloutAssignment(projectId, {
  mode = process.env.NARRATIVE_V3_ROLLOUT_MODE,
  percent = process.env.NARRATIVE_V3_ROLLOUT_PERCENT,
  releaseGateDigest = process.env.NARRATIVE_V3_RELEASE_GATE_DIGEST,
  now = () => new Date().toISOString(),
} = {}) {
  const selectedMode = modeValue(mode);
  const selectedPercent = percentValue(percent);
  const gateDigest = String(releaseGateDigest || "").trim().toLowerCase();
  const releaseGatePresent = DIGEST_RE.test(gateDigest);
  const bucket = narrativeV3RolloutBucket(projectId);
  const selected = selectedMode === "on" || (selectedMode === "canary" && selectedPercent > bucket);
  return Object.freeze({
    version: NARRATIVE_V3_ROLLOUT_VERSION,
    mode: selectedMode,
    percent: selectedMode === "canary" ? selectedPercent : selectedMode === "on" ? 100 : 0,
    bucket,
    shadow: selectedMode === "shadow",
    enabled: releaseGatePresent && selected,
    releaseGateDigest: releaseGatePresent ? gateDigest : "",
    assignedAt: now(),
  });
}

export function narrativeV3RolloutAssignment(project = {}, options = {}) {
  const existing = project?.continuitySnapshot?.narrativeV3Rollout;
  if (Number(existing?.version) === NARRATIVE_V3_ROLLOUT_VERSION) return existing;
  return createNarrativeV3RolloutAssignment(project?.id, options);
}
