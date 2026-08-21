export const VISUAL_REFERENCE_ARBITRATION_VERSION = 19;

export const VISUAL_REFERENCE_POLICY_STAGES = Object.freeze({
  FULL_COMPATIBLE: "full_compatible",
  ADJACENT_IDENTITY: "adjacent_identity",
  STYLE_IDENTITY: "style_identity",
  CONTRACT_IDENTITY: "contract_identity",
});

const STATE_AUTHORITY_CODES = new Set([
  "wardrobe_state_mismatch",
  "equipment_state_mismatch",
  "wrong_physical_medium",
  "wrong_location_or_boundary",
  "main_action_mismatch",
  "object_state_mismatch",
  "landmark_cardinality_mismatch",
  "forbidden_character_present",
]);

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function list(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))].sort();
}

function stateByCharacter(page = {}) {
  return new Map((page.scene_contract?.wardrobe_states || []).map((entry) => [
    text(entry?.character_id),
    {
      outfit: text(entry?.outfit_state_id),
      equipment: list(entry?.equipment_state_ids),
    },
  ]).filter(([characterId]) => characterId));
}

export function visualReferenceStateProfile(page = {}) {
  const contract = page.scene_contract || {};
  const snapshot = contract.render_snapshot || {};
  const camera = snapshot.camera_environment || {};
  const states = stateByCharacter(page);
  return {
    version: VISUAL_REFERENCE_ARBITRATION_VERSION,
    strict: contract.contract_source === "narrative_book_spec_v3_scene_render_contract_v1",
    physicalMedium: text(snapshot.physical_medium),
    location: text(snapshot.location),
    cameraZone: text(camera.camera_zone),
    ambientMedium: text(camera.ambient_medium),
    visiblePhase: text(snapshot.visible_phase),
    cast: list(contract.visible_character_ids),
    wardrobe: Object.fromEntries([...states].map(([characterId, state]) => [characterId, state])),
  };
}

export function visualReferenceCompatibility(sourcePage = {}, targetPage = {}) {
  const source = visualReferenceStateProfile(sourcePage);
  const target = visualReferenceStateProfile(targetPage);
  // Legacy books do not carry enough typed evidence to prove incompatibility.
  // Preserve their existing bounded continuity behavior.
  if (!source.strict || !target.strict) {
    return { compatible: true, reasons: [], source, target, compatibility: "legacy_unknown" };
  }
  const reasons = [];
  if (source.physicalMedium && target.physicalMedium && source.physicalMedium !== target.physicalMedium) {
    reasons.push("physical_medium");
  }
  if (source.ambientMedium && target.ambientMedium && source.ambientMedium !== target.ambientMedium) {
    reasons.push("ambient_medium");
  }
  if (source.cameraZone && target.cameraZone && source.cameraZone !== target.cameraZone) {
    reasons.push("camera_zone");
  }
  if (source.location && target.location && source.location !== target.location) {
    reasons.push("location");
  }
  const sourceWardrobe = source.wardrobe || {};
  const targetWardrobe = target.wardrobe || {};
  for (const characterId of Object.keys(sourceWardrobe).filter((id) => targetWardrobe[id])) {
    if (sourceWardrobe[characterId].outfit !== targetWardrobe[characterId].outfit) {
      reasons.push(`wardrobe:${characterId}`);
    }
    if (sourceWardrobe[characterId].equipment.join("|") !== targetWardrobe[characterId].equipment.join("|")) {
      reasons.push(`equipment:${characterId}`);
    }
  }
  return {
    compatible: reasons.length === 0,
    reasons: [...new Set(reasons)],
    source,
    target,
    compatibility: reasons.length ? "state_conflict" : "same_render_state",
  };
}

function kinds(references = []) {
  return new Set((Array.isArray(references) ? references : []).map((reference) => reference?.kind));
}

export function referencesForVisualPolicy(referenceImages = [], stage = VISUAL_REFERENCE_POLICY_STAGES.FULL_COMPATIBLE) {
  const references = (Array.isArray(referenceImages) ? referenceImages : []).filter(Boolean);
  if (stage === VISUAL_REFERENCE_POLICY_STAGES.ADJACENT_IDENTITY) {
    return references.filter((reference) => ["adjacent_scene", "identity"].includes(reference?.kind));
  }
  if (stage === VISUAL_REFERENCE_POLICY_STAGES.STYLE_IDENTITY) {
    return references.filter((reference) => ["continuity", "identity"].includes(reference?.kind));
  }
  if (stage === VISUAL_REFERENCE_POLICY_STAGES.CONTRACT_IDENTITY) {
    return references.filter((reference) => reference?.kind === "identity");
  }
  return references;
}

export function nextVisualReferencePolicyStage(referenceImages = [], currentStage, issueCodes = []) {
  const availableKinds = kinds(referenceImages);
  const codes = new Set((Array.isArray(issueCodes) ? issueCodes : []).map(text).filter(Boolean));
  const stateConflict = [...codes].some((code) => STATE_AUTHORITY_CODES.has(code));
  const styleConflict = codes.has("style_continuity_mismatch");
  const identityConflict = [...codes].some((code) => code.startsWith("identity_") || code === "required_cast_missing");
  if (!stateConflict && !styleConflict && !identityConflict) return null;

  if (!currentStage || currentStage === VISUAL_REFERENCE_POLICY_STAGES.FULL_COMPATIBLE) {
    if (stateConflict && availableKinds.has("adjacent_scene")) {
      return VISUAL_REFERENCE_POLICY_STAGES.ADJACENT_IDENTITY;
    }
    return VISUAL_REFERENCE_POLICY_STAGES.STYLE_IDENTITY;
  }
  if (currentStage === VISUAL_REFERENCE_POLICY_STAGES.ADJACENT_IDENTITY) {
    return stateConflict
      ? VISUAL_REFERENCE_POLICY_STAGES.CONTRACT_IDENTITY
      : VISUAL_REFERENCE_POLICY_STAGES.STYLE_IDENTITY;
  }
  if (currentStage === VISUAL_REFERENCE_POLICY_STAGES.STYLE_IDENTITY && stateConflict) {
    return VISUAL_REFERENCE_POLICY_STAGES.CONTRACT_IDENTITY;
  }
  return null;
}

export function visualReferencePolicyKinds(referenceImages = [], stage) {
  return referencesForVisualPolicy(referenceImages, stage).map((reference) => String(reference?.kind || "reference"));
}
