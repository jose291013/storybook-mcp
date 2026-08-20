import { outfitOptionsForUniverse } from "../config/outfitOptions.js";
import { loadCreationIntent } from "./creationIntent.js";
import { canonicalDigest } from "./narrativeV3Canonical.js";
import { assertNarrativeV3Schema, NarrativeV3ContractError } from "./narrativeV3SchemaRegistry.js";

export const VISUAL_INTENT_VERSION = 1;
export const VISUAL_INTENT_ID = "calitiki.visual-intent.v1";
export const VISUAL_INTENT_BUILDER_VERSION = 1;

function fail(code, path, message) {
  throw new NarrativeV3ContractError({ code, artifactType: "visual_intent", issues: [{ path, message }] });
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function projection(value) {
  const copy = structuredClone(value);
  delete copy.validation.artifactDigest;
  return copy;
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

function outfit({ stateId, description, evidence }, path) {
  const normalizedState = text(stateId);
  const normalizedDescription = text(description);
  if (!normalizedState || !normalizedDescription) fail("visual_intent_outfit_incomplete", path, "Every outfit needs one state id and concrete description.");
  return {
    stateId: normalizedState,
    description: normalizedDescription,
    evidenceDigest: canonicalDigest(evidence ?? { stateId: normalizedState, description: normalizedDescription }),
  };
}

export function visualIntentDigest(value) {
  return canonicalDigest(projection(value));
}

export function buildVisualIntentV1({ creationIntent: rawIntent, characters = [] } = {}) {
  const intent = loadCreationIntent(rawIntent);
  if (!Array.isArray(characters) || characters.length !== intent.cast.length) {
    fail("visual_intent_cast_cardinality", "/characters", "Visual intent must bind every creation-intent character exactly once.");
  }
  const inputByKey = new Map(characters.map((entry) => [text(entry?.characterKey), entry]));
  if (inputByKey.size !== characters.length) fail("visual_intent_cast_duplicate", "/characters", "Visual character keys must be unique.");
  const universeOutfits = new Map(outfitOptionsForUniverse(intent.book.universeId).map((entry) => [entry.id, entry.prompt]));
  const sealedCharacters = intent.cast.map((castEntry, index) => {
    const entry = inputByKey.get(castEntry.characterKey);
    if (!entry || text(entry.profileRef) !== castEntry.profileRef || text(entry.kind) !== castEntry.kind) {
      fail("visual_intent_identity_mismatch", `/characters/${index}`, "Visual identity must match the exact creation-intent cast entry.");
    }
    if (castEntry.kind !== "human") {
      const natural = outfit({
        stateId: "natural_appearance",
        description: text(entry.naturalAppearanceDescription) || "the exact canonical natural appearance with no invented human clothing",
        evidence: { profileRef: castEntry.profileRef, identityDigest: entry.identityDigest || null },
      }, `/characters/${index}`);
      return { ...castEntry, outfitPreference: "natural_appearance", ordinaryOutfit: natural, adventureOutfit: natural, accommodationIds: [] };
    }
    const preference = text(entry.outfitPreference);
    if (!["preserve_photo", "auto_universe", "selected"].includes(preference)) {
      fail("visual_intent_preference_invalid", `/characters/${index}/outfitPreference`, "Human wardrobe preference must be explicit and supported.");
    }
    const ordinary = outfit({
      stateId: "ordinary_outfit",
      description: entry.ordinaryOutfitDescription,
      evidence: { profileRef: castEntry.profileRef, ordinaryOutfitDigest: entry.ordinaryOutfitDigest || null },
    }, `/characters/${index}/ordinaryOutfit`);
    let adventure = ordinary;
    if (preference !== "preserve_photo") {
      const requestedId = text(entry.adventureOutfitId);
      const description = universeOutfits.get(requestedId);
      if (!description) fail("visual_intent_universe_outfit_unknown", `/characters/${index}/adventureOutfitId`, "The selected outfit does not belong to this universe registry.");
      adventure = outfit({ stateId: requestedId, description, evidence: { universeId: intent.book.universeId, requestedId } }, `/characters/${index}/adventureOutfit`);
    }
    const accommodationIds = [...new Set((Array.isArray(entry.accommodationIds) ? entry.accommodationIds : []).map(text).filter(Boolean))].sort();
    return { ...castEntry, outfitPreference: preference, ordinaryOutfit: ordinary, adventureOutfit: adventure, accommodationIds };
  });
  const value = {
    schemaVersion: VISUAL_INTENT_VERSION,
    contractId: VISUAL_INTENT_ID,
    sourceCreationIntent: {
      contractId: intent.contractId,
      schemaVersion: intent.schemaVersion,
      artifactDigest: intent.validation.artifactDigest,
    },
    universeId: intent.book.universeId,
    characters: sealedCharacters,
    validation: { builderVersion: VISUAL_INTENT_BUILDER_VERSION, artifactDigest: "" },
  };
  value.validation.artifactDigest = visualIntentDigest(value);
  assertNarrativeV3Schema("visual_intent", value);
  return freeze(structuredClone(value));
}

export function loadVisualIntentV1(value) {
  assertNarrativeV3Schema("visual_intent", value);
  if (value.validation.artifactDigest !== visualIntentDigest(value)) fail("visual_intent_digest_mismatch", "/validation/artifactDigest", "Visual intent digest mismatch.");
  return freeze(structuredClone(value));
}
