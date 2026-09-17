import crypto from "node:crypto";
import { generationCheckpoint } from "./previewGenerationCheckpoint.js";

export const IMAGE_MODEL_POLICY_VERSION = 1;
export const GPT_IMAGE_25_FLARE_MODEL = "gpt-image-2.5-flare-2026-09-08";
export const GPT_IMAGE_25_SUNBURST_MODEL = "gpt-image-2.5-sunburst-2026-09-08";

function rolloutPercent(value = process.env.GPT_IMAGE_25_ROLLOUT_PERCENT) {
  const parsed = Number.parseInt(String(value ?? "10"), 10);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 10;
}

function bucketForProject(projectId) {
  const digest = crypto.createHash("sha256").update(String(projectId || "")).digest();
  return digest.readUInt32BE(0) % 100;
}

function configuredFlareModel() {
  return process.env.GPT_IMAGE_25_FLARE_MODEL || GPT_IMAGE_25_FLARE_MODEL;
}

function configuredSunburstModel() {
  return process.env.GPT_IMAGE_25_SUNBURST_MODEL || GPT_IMAGE_25_SUNBURST_MODEL;
}

export function legacyImageModelPolicy({ reason = "legacy_or_control" } = {}) {
  return {
    version: IMAGE_MODEL_POLICY_VERSION,
    cohort: "gpt_image_2_control",
    generationModel: "",
    precisionModel: "",
    reason,
  };
}

export function isImageModelPolicy(value) {
  if (!value || Number(value.version) !== IMAGE_MODEL_POLICY_VERSION) return false;
  if (value.cohort === "gpt_image_2_control") return true;
  return value.cohort === "gpt_image_25_hybrid"
    && String(value.generationModel || "").startsWith("gpt-image-2.5-flare-")
    && String(value.precisionModel || "").startsWith("gpt-image-2.5-sunburst-");
}

export function assignImageModelPolicy({ projectId, existingCheckpoint = null } = {}) {
  if (isImageModelPolicy(existingCheckpoint?.imageModelPolicy)) {
    return existingCheckpoint.imageModelPolicy;
  }
  // A book already started before this brick must retain its former routing.
  if (existingCheckpoint) return legacyImageModelPolicy({ reason: "pre_policy_book" });

  const percent = rolloutPercent();
  const bucket = bucketForProject(projectId);
  if (bucket >= percent) {
    return {
      ...legacyImageModelPolicy({ reason: "rollout_control" }),
      rolloutPercent: percent,
      bucket,
    };
  }
  return {
    version: IMAGE_MODEL_POLICY_VERSION,
    cohort: "gpt_image_25_hybrid",
    generationModel: configuredFlareModel(),
    precisionModel: configuredSunburstModel(),
    rolloutPercent: percent,
    bucket,
    assignedAt: new Date().toISOString(),
  };
}

export function imageModelPolicyForProject(project) {
  const checkpoint = generationCheckpoint(project);
  return isImageModelPolicy(checkpoint?.imageModelPolicy)
    ? checkpoint.imageModelPolicy
    : legacyImageModelPolicy({ reason: "pre_policy_book" });
}

export function selectImageModel({ policy, role = "generation", fallbackModel = "gpt-image-2" } = {}) {
  if (!isImageModelPolicy(policy) || policy.cohort !== "gpt_image_25_hybrid") return fallbackModel;
  return role === "precision" ? policy.precisionModel : policy.generationModel;
}

