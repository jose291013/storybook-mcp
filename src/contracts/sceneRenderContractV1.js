import { outfitOptionsForUniverse } from "../config/outfitOptions.js";
import { canonicalDigest } from "./narrativeV3Canonical.js";
import { resolveAppearanceEquipment } from "../services/appearanceEquipmentResolver.js";

export const SCENE_RENDER_CONTRACT_VERSION = 1;
export const SCENE_RENDER_CONTRACT_ID = "calitiki.scene-render-contract.v1";
export const SCENE_RENDER_CONTRACT_COMPILER_VERSION = 3;

function renderError(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function digestProjection(contract) {
  const projection = structuredClone(contract);
  delete projection.validation.artifact_digest;
  return projection;
}

function resolveOutfit({ stateId, universeId, ordinaryOutfit }) {
  if (stateId === "natural_appearance") {
    return {
      state_id: stateId,
      description: "the character's exact canonical natural appearance; no invented human clothing",
      source: "canonical_natural_appearance",
    };
  }
  if (stateId === "ordinary_outfit") {
    const description = text(ordinaryOutfit);
    if (!description) {
      renderError(
        "scene_render_ordinary_outfit_unbound",
        "An ordinary outfit state needs one concrete immutable visual description.",
      );
    }
    return { state_id: stateId, description, source: "private_identity_binding" };
  }
  const option = outfitOptionsForUniverse(universeId).find((entry) => entry.id === stateId);
  if (!option?.prompt) {
    renderError(
      "scene_render_outfit_state_unknown",
      `Outfit state ${stateId || "(empty)"} has no renderable universe definition.`,
    );
  }
  return { state_id: stateId, description: text(option.prompt), source: "universe_outfit_registry" };
}

function validatePartition(required, forbidden, registryIds) {
  const requiredIds = required.map((entry) => entry.character_id);
  const forbiddenIds = forbidden.map((entry) => entry.character_id);
  if (new Set(requiredIds).size !== requiredIds.length || new Set(forbiddenIds).size !== forbiddenIds.length) {
    renderError("scene_render_cast_duplicate", "A character may appear only once in the render contract partition.");
  }
  if (requiredIds.some((id) => forbiddenIds.includes(id))) {
    renderError("scene_render_cast_partition_overlap", "A character cannot be both required and forbidden.");
  }
  if (registryIds.length && (
    requiredIds.length + forbiddenIds.length !== registryIds.length
    || registryIds.some((id) => !requiredIds.includes(id) && !forbiddenIds.includes(id))
  )) {
    renderError("scene_render_cast_partition_incomplete", "Required and forbidden cast must partition the complete released cast.");
  }
}

export function sceneRenderContractDigest(contract) {
  return canonicalDigest(digestProjection(contract));
}

export function compileSceneRenderContractV1({
  sceneContract,
  aliases = [],
  ordinaryOutfits = new Map(),
} = {}) {
  if (!sceneContract || typeof sceneContract !== "object") {
    renderError("scene_render_source_required", "A structured V3 illustration scene is required.");
  }
  const sourceDigest = text(sceneContract.artifact_digest);
  const universeId = text(sceneContract.universe_id);
  const registry = Array.isArray(sceneContract.character_registry) ? sceneContract.character_registry : [];
  const wardrobeStates = Array.isArray(sceneContract.wardrobe_states) ? sceneContract.wardrobe_states : [];
  const visibleIds = unique(sceneContract.visible_character_ids);
  const forbiddenIds = unique(sceneContract.forbidden_character_ids);
  if (!sourceDigest || !universeId || !registry.length) {
    renderError("scene_render_source_incomplete", "The V3 scene projection is missing its source digest, universe or character registry.");
  }
  const registryById = new Map(registry.map((entry) => [text(entry.character_id), entry]));
  const aliasByName = new Map(aliases.map((entry) => [text(entry.name), text(entry.alias || entry.name)]));
  const wardrobeById = new Map(wardrobeStates.map((entry) => [text(entry.character_id), entry]));
  const required = visibleIds.map((characterId) => {
    const character = registryById.get(characterId);
    const wardrobe = wardrobeById.get(characterId);
    if (!character || !wardrobe) {
      renderError("scene_render_visible_character_unbound", `Visible character ${characterId} has no complete render binding.`);
    }
    const canonicalName = text(character.name);
    const alias = aliasByName.get(canonicalName) || canonicalName;
    const outfit = resolveOutfit({
      stateId: text(wardrobe.outfit_state_id),
      universeId,
      ordinaryOutfit: ordinaryOutfits.get(characterId) || ordinaryOutfits.get(canonicalName),
    });
    const appearance = resolveAppearanceEquipment({
      outfitDescription: outfit.description,
      equipmentStateIds: unique(wardrobe.equipment_state_ids),
      characterName: alias,
    });
    return {
      character_id: characterId,
      name: alias,
      kind: text(character.kind),
      exact_quantity: 1,
      outfit: { ...outfit, description: appearance.outfit_description },
      equipment: appearance.equipment,
      forbidden_equipment: appearance.forbidden_equipment,
    };
  });
  const forbidden = forbiddenIds.map((characterId) => {
    const character = registryById.get(characterId);
    if (!character) renderError("scene_render_forbidden_character_unbound", `Forbidden character ${characterId} is not registered.`);
    const canonicalName = text(character.name);
    return {
      character_id: characterId,
      name: aliasByName.get(canonicalName) || canonicalName,
      kind: text(character.kind),
      exact_quantity: 0,
    };
  });
  validatePartition(required, forbidden, [...registryById.keys()]);

  const contract = {
    schema_version: SCENE_RENDER_CONTRACT_VERSION,
    contract_id: SCENE_RENDER_CONTRACT_ID,
    source: {
      artifact_digest: sourceDigest,
      scene_number: Number(sceneContract.scene_number || 0),
      image_page_number: Number(sceneContract.image_page_number || 0),
      universe_id: universeId,
    },
    physical_world: {
      location: text(sceneContract.render_snapshot?.location),
      physical_medium: text(sceneContract.render_snapshot?.physical_medium),
      world_law_digest: text(sceneContract.render_snapshot?.world_law_digest),
      gravity_model: text(sceneContract.render_snapshot?.gravity_model),
      allowed_locomotion: unique(sceneContract.render_snapshot?.allowed_locomotion),
      allowed_postures: unique(sceneContract.render_snapshot?.allowed_postures),
      required_survival_mechanisms: unique(sceneContract.render_snapshot?.required_survival_mechanisms),
      visible_phase: text(sceneContract.render_snapshot?.visible_phase),
      camera_environment: structuredClone(sceneContract.render_snapshot?.camera_environment || null),
      state_boundary: structuredClone(sceneContract.state_boundary || sceneContract.render_snapshot?.state_boundary || null),
    },
    cast: { required, forbidden },
    main_action: structuredClone(sceneContract.main_action || {}),
    objects: structuredClone(sceneContract.visual_entity_states || []),
    forbidden_elements: unique(sceneContract.forbidden_elements),
    validation: {
      compiler_version: SCENE_RENDER_CONTRACT_COMPILER_VERSION,
      artifact_digest: "",
    },
  };
  contract.validation.artifact_digest = sceneRenderContractDigest(contract);
  return Object.freeze(structuredClone(contract));
}

