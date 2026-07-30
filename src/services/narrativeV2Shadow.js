import crypto from "node:crypto";

import {
  NarrativeBookSpecCompileError,
  compileNarrativeBookSpec,
} from "../contracts/compileNarrativeBookSpec.js";
import { normalizeBookLanguage } from "../config/bookLanguages.js";
import { normalizePageCount } from "../config/bookOptions.js";

export const NARRATIVE_V2_SHADOW_VERSION = 1;

function clean(value, maximum = 160) {
  return String(value || "").trim().slice(0, maximum);
}

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableJsonValue(entry)]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableJsonValue(value)))
    .digest("hex");
}

function canonicalIdentifier(value, fallback = "") {
  return (clean(value).normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120)) || fallback;
}

function allowedProjectIds(value = process.env.NARRATIVE_V2_SHADOW_PROJECT_IDS) {
  return new Set(String(value || "")
    .split(",")
    .map((entry) => clean(entry, 80))
    .filter(Boolean));
}

export function narrativeV2ShadowEnabled(
  projectId,
  {
    mode = process.env.NARRATIVE_V2_SHADOW_MODE,
    projectIds = process.env.NARRATIVE_V2_SHADOW_PROJECT_IDS,
  } = {},
) {
  if (clean(mode).toLowerCase() !== "observe") return false;
  return allowedProjectIds(projectIds).has(clean(projectId, 80));
}

function canonicalChildSafety(profile) {
  if (!profile || profile.restricted === true || profile.action !== "allow") {
    throw new Error("child_safety_profile_missing_or_restricted");
  }
  const category = profile.category === "protective_education"
    ? "protective_education"
    : "general";
  const result = {
    profileVersion: Math.max(1, Number(profile.version || 1)),
    category,
    action: "allow",
    restricted: false,
  };
  if (category === "protective_education") {
    const contract = {
      id: "body_safety_v1",
      version: 1,
      category,
    };
    result.contractId = contract.id;
    result.contractVersion = contract.version;
    result.contractDigest = digest(contract);
  }
  return result;
}

function canonicalSensitivity(profile) {
  if (!profile || profile.restricted === true) {
    throw new Error("story_sensitivity_profile_missing_or_restricted");
  }
  const level = Math.max(1, Math.min(3, Number(profile.level || 1)));
  const approach = level >= 3
    ? "symbolic_open_ended"
    : level === 2 ? "gentle_action_led" : "light_action_led";
  const contract = {
    profileVersion: Math.max(1, Number(profile.version || 1)),
    level,
    category: canonicalIdentifier(
      profile.category,
      level >= 3 ? "major_life_event" : level === 2 ? "emotional_challenge" : "everyday_challenge",
    ),
    restricted: false,
    approach,
    guidanceVersion: Math.max(0, Number(profile.guidance_version || 0)),
  };
  return {
    profileVersion: contract.profileVersion,
    level: contract.level,
    category: contract.category,
    restricted: false,
    approach,
    contractVersion: 1,
    contractDigest: digest(contract),
  };
}

export function canonicalNarrativeV2Safety(project = {}) {
  const questionnaire = project.questionnaire || {};
  return {
    childSafety: canonicalChildSafety(questionnaire.child_safety_profile),
    sensitivity: canonicalSensitivity(questionnaire.story_sensitivity_profile),
  };
}

export function narrativeV2BookConfiguration(project = {}) {
  const questionnaire = project.questionnaire || {};
  const configuredPages = questionnaire.page_count
    || project.productConfiguration?.page_count
    || project.productConfiguration?.pageCount;
  return {
    language: normalizeBookLanguage(questionnaire.language || project.locale || "FR"),
    audienceAge: Number(questionnaire.age || 0),
    pageCount: normalizePageCount(configuredPages),
    universeId: canonicalIdentifier(questionnaire.universe_id),
  };
}

function boundedIssues(error) {
  if (error instanceof NarrativeBookSpecCompileError) {
    return error.issues.slice(0, 20).map((issue) => ({
      code: clean(issue.code, 80) || "compile_failed",
      path: clean(issue.path, 180),
    }));
  }
  return [{
    code: clean(error?.message, 80) || "shadow_compile_failed",
    path: "",
  }];
}

export function compileNarrativeV2Shadow(
  { project, scenario } = {},
  {
    compile = compileNarrativeBookSpec,
    now = () => new Date().toISOString(),
  } = {},
) {
  const compiledAt = now();
  try {
    const spec = compile({
      projectId: project?.id,
      scenario,
      book: narrativeV2BookConfiguration(project),
      safety: canonicalNarrativeV2Safety(project),
    });
    return {
      version: NARRATIVE_V2_SHADOW_VERSION,
      status: "compiled",
      sourceScenarioDigest: clean(spec?.sourceScenario?.digest, 64),
      artifactDigest: clean(spec?.validation?.artifactDigest, 64),
      compilerVersion: Number(spec?.validation?.compilerVersion || 0),
      mechanicalValidatorVersion: Number(
        spec?.validation?.mechanicalValidatorVersion || 0,
      ),
      comparison: {
        sceneCount: Array.isArray(spec?.scenes) ? spec.scenes.length : 0,
        characterCount: Array.isArray(spec?.registries?.characters)
          ? spec.registries.characters.length : 0,
        objectCount: Array.isArray(spec?.registries?.objects)
          ? spec.registries.objects.length : 0,
        passageCount: Array.isArray(spec?.registries?.passages)
          ? spec.registries.passages.length : 0,
      },
      spec,
      compiledAt,
    };
  } catch (error) {
    return {
      version: NARRATIVE_V2_SHADOW_VERSION,
      status: error instanceof NarrativeBookSpecCompileError ? "rejected" : "error",
      sourceScenarioDigest: clean(scenario?.auditEvidence?.digest, 64),
      issues: boundedIssues(error),
      compiledAt,
    };
  }
}
