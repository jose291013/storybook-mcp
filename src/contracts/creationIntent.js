import {
  canonicalDigest,
  canonicalSerialize,
} from "./narrativeV3Canonical.js";
import {
  assertNarrativeV3Schema,
  NarrativeV3ContractError,
} from "./narrativeV3SchemaRegistry.js";

export const CREATION_INTENT_VERSION = 1;
export const CREATION_INTENT_ID = "calitiki.creation-intent.v1";
export const CREATION_INTENT_BUILDER_VERSION = 1;

const DIGEST_RE = /^[a-f0-9]{64}$/;
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const LANGUAGES = new Set(["FR", "ES", "EN"]);
const PAGE_COUNTS = new Set([24, 28, 32, 36, 40, 44]);
const ROLES = new Set(["hero", "guide", "family", "companion", "peer"]);
const KINDS = new Set(["human", "animal", "fantasy"]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function contractError(code, path, message) {
  throw new NarrativeV3ContractError({
    code,
    artifactType: "creation_intent",
    issues: [{ path, message }],
  });
}

function exactKeys(value, allowed, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    contractError("creation_intent_input_invalid", path, "A strict server input object is required.");
  }
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) {
    contractError("creation_intent_input_unknown_field", path, `Unsupported field ${unexpected[0]}.`);
  }
}

function identifier(value, path) {
  const normalized = String(value || "").trim();
  if (!IDENTIFIER_RE.test(normalized)) contractError("creation_intent_identifier_invalid", path, "A bounded stable identifier is required.");
  return normalized;
}

function reference(value, path, { nullable = false } = {}) {
  if (nullable && value == null) return null;
  const normalized = String(value || "").trim();
  if (!REFERENCE_RE.test(normalized)) contractError("creation_intent_reference_invalid", path, "A bounded private reference is required.");
  return normalized;
}

function digest(value, path, { nullable = false } = {}) {
  if (nullable && value == null) return null;
  const normalized = String(value || "").trim();
  if (!DIGEST_RE.test(normalized)) contractError("creation_intent_digest_invalid", path, "A canonical SHA-256 digest is required.");
  return normalized;
}

function readingBand(age) {
  if (age <= 4) return "read_aloud";
  if (age <= 7) return "emergent";
  if (age <= 10) return "independent";
  return "upper_middle";
}

function digestProjection(value) {
  const projection = structuredClone(value);
  if (projection.validation) delete projection.validation.artifactDigest;
  return projection;
}

export function creationIntentDigest(intent) {
  return canonicalDigest(digestProjection(intent));
}

export function buildCreationIntent(input = {}) {
  exactKeys(input, [
    "language",
    "audienceAge",
    "pageCount",
    "universeId",
    "intentionId",
    "approachId",
    "sensitivityLevel",
    "castRefs",
    "seriesRef",
    "previousCanonDigest",
    "questionnaireDigest",
    "safetyAssessmentDigest",
  ], "/");

  const language = String(input.language || "").trim().toUpperCase();
  if (!LANGUAGES.has(language)) contractError("creation_intent_language_invalid", "/language", "Language must be FR, ES or EN.");
  const age = Number(input.audienceAge);
  if (!Number.isInteger(age) || age < 2 || age > 14) contractError("creation_intent_age_invalid", "/audienceAge", "Audience age must be an integer from 2 to 14.");
  const pageCount = Number(input.pageCount);
  if (!PAGE_COUNTS.has(pageCount)) contractError("creation_intent_page_count_invalid", "/pageCount", "Page count is not supported by the deterministic layout.");
  const sensitivityLevel = Number(input.sensitivityLevel);
  if (!Number.isInteger(sensitivityLevel) || sensitivityLevel < 1 || sensitivityLevel > 3) {
    contractError("creation_intent_sensitivity_invalid", "/sensitivityLevel", "Sensitivity level must be 1, 2 or 3.");
  }
  if (!Array.isArray(input.castRefs) || input.castRefs.length < 1 || input.castRefs.length > 8) {
    contractError("creation_intent_cast_invalid", "/castRefs", "The cast must contain between one and eight profile references.");
  }
  const cast = input.castRefs.map((entry, index) => {
    exactKeys(entry, ["characterKey", "profileRef", "role", "kind"], `/castRefs/${index}`);
    const role = String(entry.role || "");
    const kind = String(entry.kind || "");
    if (!ROLES.has(role)) contractError("creation_intent_role_invalid", `/castRefs/${index}/role`, "The cast role is not supported.");
    if (!KINDS.has(kind)) contractError("creation_intent_kind_invalid", `/castRefs/${index}/kind`, "The character kind is not supported.");
    return {
      characterKey: identifier(entry.characterKey, `/castRefs/${index}/characterKey`),
      profileRef: reference(entry.profileRef, `/castRefs/${index}/profileRef`),
      role,
      kind,
    };
  });
  if (new Set(cast.map((entry) => entry.characterKey)).size !== cast.length) {
    contractError("creation_intent_duplicate_character", "/castRefs", "Every character key must be unique.");
  }
  if (cast.filter((entry) => entry.role === "hero").length !== 1) {
    contractError("creation_intent_hero_cardinality", "/castRefs", "Exactly one cast reference must be the hero.");
  }

  const intent = {
    schemaVersion: CREATION_INTENT_VERSION,
    contractId: CREATION_INTENT_ID,
    language,
    audience: { age, readingBand: readingBand(age) },
    book: {
      pageCount,
      universeId: identifier(input.universeId, "/universeId"),
    },
    narrativeGoal: {
      intentionId: identifier(input.intentionId, "/intentionId"),
      approachId: identifier(input.approachId, "/approachId"),
      sensitivityLevel,
    },
    cast,
    continuity: {
      seriesRef: reference(input.seriesRef, "/seriesRef", { nullable: true }),
      previousCanonDigest: digest(input.previousCanonDigest, "/previousCanonDigest", { nullable: true }),
    },
    sourceRefs: {
      questionnaireDigest: digest(input.questionnaireDigest, "/questionnaireDigest"),
      safetyAssessmentDigest: digest(input.safetyAssessmentDigest, "/safetyAssessmentDigest"),
    },
    validation: {
      builderVersion: CREATION_INTENT_BUILDER_VERSION,
      artifactDigest: "",
    },
  };
  intent.validation.artifactDigest = creationIntentDigest(intent);
  assertNarrativeV3Schema("creation_intent", intent);
  return deepFreeze(structuredClone(intent));
}

export function loadCreationIntent(value) {
  assertNarrativeV3Schema("creation_intent", value);
  const expected = creationIntentDigest(value);
  if (value.validation.artifactDigest !== expected) {
    contractError("creation_intent_digest_mismatch", "/validation/artifactDigest", "The digest does not belong to this exact CreationIntent.");
  }
  return deepFreeze(structuredClone(value));
}

export function creationIntentFingerprint(intent) {
  return canonicalSerialize(loadCreationIntent(intent));
}
