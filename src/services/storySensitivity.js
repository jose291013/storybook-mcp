import { runAgent } from "./agentRunner.js";
import { loadPrompt } from "./loadPrompt.js";
import { sanitizeChildSafetyProfile } from "./childSafety.js";

export const STORY_SENSITIVITY_PROFILE_VERSION = 2;
const LEGACY_STORY_SENSITIVITY_PROFILE_VERSION = 1;

const ALLOWED_CONFIDENCE = new Set(["low", "medium", "high"]);

const INDICATORS = {
  restricted: [
    /\bsu(?:i)?cid/i,
    /\bself\s*(?:harm|injur)/i,
    /\bauto\s*(?:mutil|lesion|agres)/i,
    /\bscarif/i,
    /\b(?:se|s)\s+(?:blesse|coupe|fait\s+du\s+mal)\s+volontairement\b/i,
    /\b(?:deliberately|intentionally)\s+(?:hurts?|cuts?|injures?)\b/i,
    /\b(?:cuts?|cutting)\s+(?:himself|herself|themself|themselves)\b/i,
    /\bse\s+(?:hace\s+dano|lesiona|corta)\s+(?:a\s+proposito|intencionalmente)\b/i,
    /\b(?:abus|abuso)\s+(?:sex|phys|fisic)/i,
    /\b(?:sexual|physical)\s+abus/i,
    /\babus(?:e|ed)\s+(?:sexually|physically)/i,
    /\bchild\s+abus/i,
    /\bmaltraitance/i,
    /\bmaltrato\s+(?:infantil|fisic|sexual)/i,
    /\b(?:rape|violacion)\b/i,
    /\bviol(?:s)?\b/i,
    /\bviolence\s+(?:immediate|imminente|grave|sexual|sexuelle)/i,
    /\bviolencia\s+(?:inmediata|grave|sexual)/i,
    /\bdanger\s+(?:immediat|imminent|grave)/i,
    /\bimmediate\s+danger\b/i,
    /\bpeligro\s+(?:inmediato|grave)/i,
  ],
  major: [
    /\bdeuil/i,
    /\bdeces/i,
    /\bmort(?:e|es|s)?\b/i,
    /\bperte\s+d(?:e|u|[' ])\s*(?:un|une)?\s*(?:proche|parent|grand)/i,
    /\bmaladie\s+(?:grave|longue|chronique|terminale)/i,
    /\bhospitalisation\s+(?:longue|grave)/i,
    /\bgrief\b/i,
    /\bbereavement\b/i,
    /\bdeath\b/i,
    /\bterminal\s+illness\b/i,
    /\bfallecimiento\b/i,
    /\bduelo\b/i,
    /\bmuerte\b/i,
    /\benfermedad\s+(?:grave|cronica|terminal)/i,
  ],
  emotional: [
    /\bharcelement/i,
    /\b(?:bullying|bulling|bulying)\b/i,
    /\bacoso\b/i,
    /\bexclusion\b/i,
    /\brejet\b/i,
    /\brejection\b/i,
    /\brechazo\b/i,
    /\bseparation\b/i,
    /\bdivorce\b/i,
    /\bdemenagement\b/i,
    /\bmoving\s+(?:home|away)\b/i,
    /\bmudanza\b/i,
    /\banxiet/i,
    /\bansiedad\b/i,
    /\bpeur\s+(?:forte|intense|profonde)/i,
    /\bintense\s+fear\b/i,
    /\bmiedo\s+(?:intenso|profundo)/i,
  ],
};

function clean(value, maximum = 1600) {
  return String(value || "").trim().slice(0, maximum);
}

function searchable(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`´_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

function categoryForLevel(level, restricted = false) {
  if (restricted) return "acute_safety";
  if (level >= 3) return "major_life_event";
  if (level === 2) return "emotional_challenge";
  return "everyday_challenge";
}

function approachFor(level, restricted = false) {
  if (restricted) return "outside_scope";
  if (level >= 3) return "careful_open_ended";
  if (level === 2) return "gentle_action_led";
  return "light_action_led";
}

export function storySensitivityMode(value = process.env.STORY_SENSITIVITY_MODE) {
  return String(value || "off").trim().toLowerCase() === "observe" ? "observe" : "off";
}

export function deterministicStorySensitivity({ creatorSituation } = {}) {
  const text = searchable(creatorSituation);
  const restricted = matchesAny(text, INDICATORS.restricted);
  const level = restricted
    ? 3
    : matchesAny(text, INDICATORS.major)
      ? 3
      : matchesAny(text, INDICATORS.emotional)
        ? 2
        : 1;

  return {
    version: STORY_SENSITIVITY_PROFILE_VERSION,
    level,
    category: categoryForLevel(level, restricted),
    restricted,
    needs_clarification: restricted,
    confidence: restricted || level > 1 ? "high" : "medium",
    recommended_approach: approachFor(level, restricted),
    source: "deterministic",
  };
}

export function normalizeStorySensitivityProfile(
  value,
  floor = deterministicStorySensitivity(),
  { version = STORY_SENSITIVITY_PROFILE_VERSION } = {},
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const suppliedLevel = Number(value.level);
  const restricted = floor.restricted || value.restricted === true;
  const candidateLevel = Math.max(
    floor.level,
    Number.isInteger(suppliedLevel) && suppliedLevel >= 1 && suppliedLevel <= 3 ? suppliedLevel : floor.level,
  );
  const level = restricted ? 3 : candidateLevel;
  const category = categoryForLevel(level, restricted);
  const confidence = ALLOWED_CONFIDENCE.has(String(value.confidence || "").toLowerCase())
    ? String(value.confidence).toLowerCase()
    : floor.confidence;

  return {
    version,
    level,
    category,
    restricted,
    needs_clarification: floor.needs_clarification || value.needs_clarification === true,
    confidence,
    recommended_approach: approachFor(level, restricted),
    source: value.source === "deterministic_fallback" ? "deterministic_fallback" : "hybrid",
  };
}

export function sanitizeSensitivityQuestionnaire(questionnaire = {}) {
  if (!questionnaire || typeof questionnaire !== "object" || Array.isArray(questionnaire)) return {};
  const safe = { ...questionnaire };
  const storedVersion = Number(questionnaire.story_sensitivity_profile?.version);
  const preserveLegacyProfile = storedVersion === LEGACY_STORY_SENSITIVITY_PROFILE_VERSION;
  const floor = preserveLegacyProfile
    ? deterministicStorySensitivity()
    : deterministicStorySensitivity({ creatorSituation: questionnaire.creator_situation });
  const profile = normalizeStorySensitivityProfile(questionnaire.story_sensitivity_profile, floor, {
    version: preserveLegacyProfile
      ? LEGACY_STORY_SENSITIVITY_PROFILE_VERSION
      : STORY_SENSITIVITY_PROFILE_VERSION,
  });
  if (profile) safe.story_sensitivity_profile = profile;
  else delete safe.story_sensitivity_profile;
  const childSafetyProfile = sanitizeChildSafetyProfile(questionnaire.child_safety_profile);
  if (childSafetyProfile) safe.child_safety_profile = childSafetyProfile;
  else delete safe.child_safety_profile;
  return safe;
}

function summarizeClassifierResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const level = Number(value.level);
  return {
    level: Number.isInteger(level) && level >= 1 && level <= 3 ? level : null,
    restricted: value.restricted === true,
  };
}

function observationTrace(floor, classifier, finalProfile) {
  const classifierSummary = summarizeClassifierResult(classifier);
  return {
    deterministicLevel: floor.level,
    deterministicRestricted: floor.restricted,
    classifierLevel: classifierSummary?.level ?? null,
    classifierRestricted: classifierSummary?.restricted ?? null,
    finalLevel: finalProfile.level,
    finalRestricted: finalProfile.restricted,
  };
}

function emitObservationTrace(callback, trace) {
  try {
    callback?.(trace);
  } catch {
    // Observation diagnostics must never affect the customer request.
  }
}

export async function assessStorySensitivity(input = {}, dependencies = {}) {
  const floor = deterministicStorySensitivity(input);
  const runner = dependencies.runAgent || runAgent;
  const result = await runner({
    name: "storySensitivity",
    system: loadPrompt("story_sensitivity.txt"),
    user: (payload) => `SENSITIVITY_INPUT_JSON:\n${JSON.stringify(payload, null, 2)}\n\nReturn ONLY the requested JSON object.`,
    input: {
      child_age: Number(input.childAge),
      locale: ["FR", "ES", "EN"].includes(input.locale) ? input.locale : "FR",
      creator_situation: clean(input.creatorSituation),
      deterministic_minimum_level: floor.level,
      deterministic_restricted: floor.restricted,
    },
  });
  const profile = normalizeStorySensitivityProfile(result, floor);
  emitObservationTrace(dependencies.onTrace, observationTrace(floor, result, profile));
  return profile;
}

export async function observeStorySensitivity(input = {}, dependencies = {}) {
  if (storySensitivityMode(dependencies.mode) !== "observe") return null;
  const floor = deterministicStorySensitivity(input);
  let timeoutId;
  try {
    const configuredTimeout = Number(dependencies.timeoutMs || process.env.STORY_SENSITIVITY_TIMEOUT_MS || 8000);
    const timeoutMs = Number.isFinite(configuredTimeout) ? Math.max(1000, Math.min(configuredTimeout, 30000)) : 8000;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Sensitivity observation timed out")), timeoutMs);
    });
    const profile = await Promise.race([assessStorySensitivity(input, dependencies), timeout]);
    clearTimeout(timeoutId);
    return profile;
  } catch (error) {
    clearTimeout(timeoutId);
    dependencies.onError?.(error);
    const fallback = {
      ...floor,
      source: "deterministic_fallback",
    };
    emitObservationTrace(dependencies.onTrace, observationTrace(floor, null, fallback));
    return fallback;
  }
}
