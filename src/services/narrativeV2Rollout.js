import crypto from "node:crypto";

export const NARRATIVE_V2_ROLLOUT_VERSION = 1;
const MODES = new Set(["off", "canary", "on"]);

function modeValue(value = process.env.NARRATIVE_V2_ROLLOUT_MODE) {
  const normalized = String(value || "off").trim().toLowerCase();
  return MODES.has(normalized) ? normalized : "off";
}

function percentValue(value = process.env.NARRATIVE_V2_ROLLOUT_PERCENT) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
}

export function narrativeV2RolloutBucket(projectId = "") {
  const digest = crypto.createHash("sha256").update(String(projectId)).digest();
  return digest.readUInt32BE(0) % 100;
}

export function createNarrativeV2RolloutAssignment(projectId, {
  mode = process.env.NARRATIVE_V2_ROLLOUT_MODE,
  percent = process.env.NARRATIVE_V2_ROLLOUT_PERCENT,
  now = () => new Date().toISOString(),
} = {}) {
  const selectedMode = modeValue(mode);
  const selectedPercent = percentValue(percent);
  const bucket = narrativeV2RolloutBucket(projectId);
  const enabled = selectedMode === "on"
    || (selectedMode === "canary" && selectedPercent > bucket);
  return {
    version: NARRATIVE_V2_ROLLOUT_VERSION,
    mode: selectedMode,
    percent: selectedMode === "canary" ? selectedPercent : selectedMode === "on" ? 100 : 0,
    bucket,
    enabled,
    assignedAt: now(),
  };
}

export function narrativeV2RolloutAssignment(project = {}, options = {}) {
  const existing = project?.continuitySnapshot?.narrativeV2Rollout;
  if (Number(existing?.version) === NARRATIVE_V2_ROLLOUT_VERSION) return existing;
  return createNarrativeV2RolloutAssignment(project?.id, options);
}
