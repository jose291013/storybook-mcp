import { sanitizeBrandSensitiveText } from "./imageVisualContract.js";

export const PROVIDER_SAFE_IMAGE_PROJECTION_VERSION = 1;

function clean(value, maximum = 240) {
  return sanitizeBrandSensitiveText(String(value || ""))
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maximum);
}

function unique(values = [], maximum = 16) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => clean(value, 180))
    .filter(Boolean))]
    .slice(0, maximum);
}

function snapshotList(snapshot = {}, key, fallback = [], maximum = 16) {
  return Object.prototype.hasOwnProperty.call(snapshot, key)
    ? unique(snapshot[key], maximum)
    : unique(fallback, maximum);
}

function replaceAliases(value, aliasEntries = []) {
  let result = clean(value, 260);
  for (const [name, alias] of aliasEntries) {
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    result = result.replace(new RegExp(`\\b${escaped}\\b`, "giu"), alias);
  }
  return result;
}

function projectedCast(sceneFidelityContract = {}) {
  const renderCast = Array.isArray(sceneFidelityContract?.scene_render_contract?.cast?.required)
    ? sceneFidelityContract.scene_render_contract.cast.required
    : [];
  const namedByName = new Map((Array.isArray(sceneFidelityContract?.named_characters)
    ? sceneFidelityContract.named_characters
    : []).map((character) => [clean(character?.name, 120), character]));
  const snapshot = sceneFidelityContract?.render_snapshot || {};
  const hasSnapshotEquipment = Object.prototype.hasOwnProperty.call(snapshot, "equipment");
  const snapshotEquipment = Array.isArray(snapshot?.equipment) ? snapshot.equipment : [];
  const aliasEntries = renderCast.map((character, index) => [
    clean(character?.name, 120),
    `traveler_${index + 1}`,
  ]);
  const cast = renderCast.map((character, index) => {
    const name = clean(character?.name, 120);
    const named = namedByName.get(name) || {};
    return {
      name: `traveler_${index + 1}`,
      kind: clean(character?.kind || named?.entity_type, 80),
      species: clean(named?.species, 80),
      exactQuantity: Math.max(1, Number(character?.exact_quantity || 1)),
      action: replaceAliases(named?.action, aliasEntries),
      outfitStateId: clean(character?.outfit?.state_id, 120),
      outfit: clean(character?.outfit?.description, 260),
      equipment: hasSnapshotEquipment
        ? unique(snapshotEquipment.filter((item) => (
            clean(item?.owner, 120).toLocaleLowerCase() === name.toLocaleLowerCase()
            && clean(item?.state, 80).toLocaleLowerCase() !== "absent"
            && Number(item?.quantity ?? 1) > 0
          )).map((item) => `${Math.max(1, Number(item?.quantity || 1))} ${item?.name}${item?.state ? `, ${item.state}` : ""}`), 8)
        : unique((Array.isArray(character?.equipment) ? character.equipment : [])
            .map((item) => item?.description || item?.name || item?.state_id), 8),
    };
  }).filter((character) => character.name);
  return { cast, aliasEntries };
}

function projectedObjects(sceneFidelityContract = {}, aliasEntries = []) {
  const canonicalObjects = Array.isArray(sceneFidelityContract?.visual_entity_states)
    ? sceneFidelityContract.visual_entity_states
    : [];
  const snapshot = sceneFidelityContract?.render_snapshot || {};
  const hasSnapshotObjects = Object.prototype.hasOwnProperty.call(snapshot, "visible_object_states");
  const visibleObjects = hasSnapshotObjects
    ? (Array.isArray(snapshot.visible_object_states) ? snapshot.visible_object_states : [])
    : canonicalObjects.filter((object) => object?.visibility === "required");
  return visibleObjects.filter((object) => Number(object?.quantity ?? object?.exact_quantity ?? 0) > 0)
    .map((object) => ({
      name: clean(object?.name, 160),
      state: clean(object?.state, 180),
      owner: replaceAliases(object?.owner, aliasEntries),
      location: replaceAliases(object?.location || canonicalObjects.find((candidate) => (
        clean(candidate?.name, 160).toLocaleLowerCase() === clean(object?.name, 160).toLocaleLowerCase()
        && clean(candidate?.owner, 120).toLocaleLowerCase() === clean(object?.owner, 120).toLocaleLowerCase()
      ))?.location, aliasEntries),
      exactQuantity: Math.max(1, Number(object?.quantity ?? object?.exact_quantity ?? 1)),
    }))
    .filter((object) => object.name)
    .slice(0, 12);
}

/**
 * Compile a genuinely smaller provider request from an already-authoritative
 * private QA contract. It retains the exact visible instant but deliberately
 * excludes reader prose, customer names, photo fingerprints, forbidden lists,
 * causal history and rejected pixels. The complete source contract remains the
 * independent acceptance authority after generation.
 */
export function buildProviderSafeImageProjection({
  sceneFidelityContract = {},
  stylePrompt = "",
} = {}) {
  const render = sceneFidelityContract?.scene_render_contract || {};
  const physical = render?.physical_world || {};
  const snapshot = sceneFidelityContract?.render_snapshot || {};
  const cameraEnvironment = snapshot?.camera_environment || {};
  const action = snapshot?.main_action || sceneFidelityContract?.main_action || render?.main_action || {};
  const { cast, aliasEntries } = projectedCast(sceneFidelityContract);
  const objects = projectedObjects(sceneFidelityContract, aliasEntries);
  const projection = {
    version: PROVIDER_SAFE_IMAGE_PROJECTION_VERSION,
    setting: {
      // The render snapshot is the exact camera-side instant. The broader
      // physical-world contract describes the destination universe and may
      // legitimately disagree before a passage is crossed or after return.
      location: clean(snapshot?.location || physical?.location, 200),
      medium: clean(snapshot?.physical_medium || cameraEnvironment?.ambient_medium || physical?.physical_medium, 120),
      gravity: clean(snapshot?.gravity_model || physical?.gravity_model, 120),
      locomotion: snapshotList(snapshot, "allowed_locomotion", physical?.allowed_locomotion, 8),
      posture: snapshotList(snapshot, "allowed_postures", physical?.allowed_postures, 8),
      survivalMechanisms: snapshotList(
        snapshot,
        "required_survival_mechanisms",
        physical?.required_survival_mechanisms,
        8,
      ),
      cameraEnvironment: {
        cameraSide: clean(cameraEnvironment?.camera_side, 100),
        cameraZone: clean(cameraEnvironment?.camera_zone, 160),
        ambientMedium: clean(cameraEnvironment?.ambient_medium, 120),
        otherSideZone: clean(cameraEnvironment?.other_side_zone, 160),
        otherSideMedium: clean(cameraEnvironment?.other_side_medium, 120),
        boundaryRule: clean(cameraEnvironment?.boundary_rule, 260),
      },
    },
    action: {
      subject: replaceAliases(action?.subject, aliasEntries),
      verb: clean(action?.verb, 180),
      target: replaceAliases(action?.target, aliasEntries),
    },
    cast,
    objects,
    style: clean(stylePrompt, 300),
  };
  const sceneContract = [
    `PROVIDER-SAFE MINIMAL SCENE CONTRACT V${PROVIDER_SAFE_IMAGE_PROJECTION_VERSION}.`,
    "Show one calm, age-appropriate illustrated instant. Every figure wears the declared outfit, remains complete and keeps respectful personal space.",
    `SETTING: ${projection.setting.location || "the declared story location"}; medium ${projection.setting.medium || "the declared physical medium"}; gravity ${projection.setting.gravity || "the declared gravity"}.`,
    projection.setting.cameraEnvironment.cameraZone
      ? `CAMERA-SIDE ENVIRONMENT: ${projection.setting.cameraEnvironment.cameraZone}; ambient medium ${projection.setting.cameraEnvironment.ambientMedium || projection.setting.medium || "declared medium"}${projection.setting.cameraEnvironment.boundaryRule ? `; boundary rule ${projection.setting.cameraEnvironment.boundaryRule}` : ""}.`
      : "",
    projection.setting.locomotion.length ? `ALLOWED MOVEMENT: ${projection.setting.locomotion.join(", ")}.` : "",
    projection.setting.posture.length ? `ALLOWED POSTURE: ${projection.setting.posture.join(", ")}.` : "",
    projection.setting.survivalMechanisms.length ? `REQUIRED SAFETY MECHANISMS: ${projection.setting.survivalMechanisms.join(", ")}.` : "",
    `EXACT VISIBLE CAST (${cast.reduce((total, character) => total + character.exactQuantity, 0)}): ${cast.map((character) => (
      `${character.exactQuantity} ${character.name}${character.kind ? ` (${character.kind}${character.species ? ` ${character.species}` : ""})` : ""}; action ${character.action || "participates in the declared instant"}; outfit ${character.outfitStateId || "declared state"}: ${character.outfit || "declared outfit"}${character.equipment.length ? `; equipment ${character.equipment.join(", ")}` : ""}`
    )).join(" | ") || "no recurring character"}.`,
    `EXACT MAIN ACTION: ${[projection.action.subject, projection.action.verb, projection.action.target].filter(Boolean).join(" ") || "the declared calm story action"}.`,
    objects.length ? `REQUIRED OBJECTS: ${objects.map((object) => `${object.exactQuantity} ${object.name}; ${object.state}; ${object.owner ? `owner ${object.owner}; ` : ""}${object.location}`).join(" | ")}.` : "",
    projection.style ? `ARTISTIC MEDIUM: ${projection.style}.` : "",
    "No text, captions, symbols standing in for people, extra figures, duplicated subjects or additional story events.",
  ].filter(Boolean).join("\n");
  const prompt = [
    "Create a gentle premium storybook illustration of the single instant below.",
    "Use a clear medium or wide composition with calm expressions and readable body language.",
    sceneContract,
  ].join("\n");
  return Object.freeze({
    version: PROVIDER_SAFE_IMAGE_PROJECTION_VERSION,
    projection: Object.freeze(structuredClone(projection)),
    prompt,
    sceneContract,
  });
}
