import { worldLawProfileForUniverse } from "../config/worldLawProfiles.js";

export const APPEARANCE_EQUIPMENT_RESOLVER_VERSION = 1;

const EQUIPMENT_STATES = Object.freeze({
  breathing_voice_bubble_worn: Object.freeze({
    description: "one complete individual transparent breathing and communication bubble enclosing this person's head, with the face and eyes unobstructed",
    functionalGroup: "underwater_head_life_support",
    provides: ["breathing", "communication", "clear_vision", "pressure_protection"],
    forbids: [
      "diving goggles or swimming goggles",
      "a diving mask",
      "a snorkel",
      "a second helmet, head bubble or breathing apparatus",
    ],
  }),
  breathing_voice_bubble_stored: Object.freeze({
    description: "one complete individual transparent breathing and communication bubble stored and not worn",
    functionalGroup: "underwater_head_life_support",
    provides: [],
    forbids: [
      "diving goggles or swimming goggles worn as substitute equipment",
      "a diving mask or snorkel worn as substitute equipment",
      "a second helmet, head bubble or breathing apparatus",
    ],
  }),
});

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

// Old checkpoints may still contain equipment prose inside an outfit lock.
// Strip it at the authority boundary so resumptions get the new semantics too.
export function garmentOnlyDescription(value = "") {
  return text(value)
    .replace(/\s*(?:,|\band\b|\bwith\b)?\s*(?:the\s+)?(?:story-established\s+)?(?:transparent\s+)?(?:breathing(?:\s+and\s+communication)?\s+bubble\s+or\s+helmet|breathing(?:\s+and\s+communication)?\s+(?:bubble|mechanism)|bubble\s+or\s+helmet)(?:\s+whenever\s+[^,.;]+)?/giu, "")
    .replace(/\s*(?:,|\band\b|\bwith\b)?\s*(?:a\s+)?transparent\s+helmet(?:\s+whenever\s+[^,.;]+)?/giu, "")
    .replace(/\s*(?:,|\band\b|\bwith\b)?\s*protective\s+goggles(?:\s+only\s+[^,.;]+)?/giu, "")
    .replace(/\s+,/g, ",")
    .replace(/,\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function resolveAppearanceEquipment({
  outfitDescription = "",
  equipmentStateIds = [],
  characterName = "character",
} = {}) {
  const equipment = unique(equipmentStateIds).map((stateId) => {
    const definition = EQUIPMENT_STATES[stateId];
    return {
      state_id: stateId,
      exact_quantity: 1,
      description: definition?.description || `canonical equipment state ${stateId}`,
      functional_group: definition?.functionalGroup || stateId,
      provides: [...(definition?.provides || [])],
      forbidden_with_this_state: [...(definition?.forbids || [])],
    };
  });
  const groups = equipment.map((entry) => entry.functional_group);
  if (new Set(groups).size !== groups.length) {
    const error = new Error(`More than one equipment state provides the same function for ${characterName}.`);
    error.code = "appearance_equipment_function_duplicated";
    throw error;
  }
  return {
    outfit_description: garmentOnlyDescription(outfitDescription),
    equipment,
    forbidden_equipment: unique(equipment.flatMap((entry) => entry.forbidden_with_this_state)),
  };
}

export function coverEquipmentLocksForWorld({ universeId = "", characterNames = [] } = {}) {
  const profile = worldLawProfileForUniverse(universeId);
  const activeStates = unique((profile?.survival || []).map((mechanism) => mechanism.activeStateId));
  if (!activeStates.length) return [];
  return unique(characterNames).map((name) => ({
    name,
    equipment_state_ids: activeStates,
  }));
}
