import { NarrativeV3ContractError } from "./narrativeV3SchemaRegistry.js";

export const SCENE_PHYSICAL_STATE_VERSION = 1;

const LOCATION_KIND_BY_ID = Object.freeze({
  location_origin: "origin",
  location_adventure: "adventure",
});

function fail(code, path, message) {
  throw new NarrativeV3ContractError({
    code,
    artifactType: "scene_physical_state",
    issues: [{ path, message }],
  });
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function visibleLocationId(timeline) {
  if (timeline.visiblePhase === "start") return timeline.locationBeforeId;
  if (timeline.visiblePhase === "during" && timeline.locationBeforeId !== timeline.locationAfterId) {
    return "location_transition";
  }
  return timeline.locationAfterId;
}

function zoneForVisibleInstant(worldLaw, timeline) {
  const locationId = visibleLocationId(timeline);
  const kind = locationId === "location_transition"
    ? "boundary"
    : LOCATION_KIND_BY_ID[locationId];
  const zone = worldLaw.zones.find((entry) => entry.kind === kind);
  if (!zone) {
    fail(
      "scene_physical_zone_missing",
      "/timeline",
      `The visible location ${locationId} has no exact world-law zone.`,
    );
  }
  return { locationId, zone };
}

function activeMechanismStates(worldLaw, mechanismIds) {
  return mechanismIds.map((mechanismId) => {
    const mechanism = worldLaw.survivalMechanisms.find((entry) => entry.mechanismId === mechanismId);
    if (!mechanism) {
      fail(
        "scene_physical_mechanism_unknown",
        "/requiredSurvivalMechanismIds",
        `World-law mechanism ${mechanismId} has no active equipment state.`,
      );
    }
    return mechanism.activeStateId;
  });
}

export function compileScenePhysicalStateV1({
  worldLaw,
  timeline,
  wardrobeStates = [],
  visibleCharacterIds = [],
  path = "/scene",
} = {}) {
  if (!worldLaw || !timeline) {
    fail("scene_physical_sources_required", path, "World law and the exact scene timeline are required.");
  }
  const { locationId, zone } = zoneForVisibleInstant(worldLaw, timeline);
  const requiredMechanismIds = [...zone.requiredSurvivalMechanismIds];
  const requiredEquipmentStateIds = activeMechanismStates(worldLaw, requiredMechanismIds);
  const visible = new Set(visibleCharacterIds);
  const stateByCharacter = new Map(wardrobeStates.map((entry) => [entry.characterId, entry]));

  for (const characterId of visible) {
    const wardrobe = stateByCharacter.get(characterId);
    if (!wardrobe) {
      fail(
        "scene_physical_wardrobe_missing",
        `${path}/wardrobeStates`,
        `${characterId} has no state at the visible physical instant.`,
      );
    }
    const equipment = new Set(wardrobe.equipmentStateIds || []);
    const missing = requiredEquipmentStateIds.find((stateId) => !equipment.has(stateId));
    if (missing) {
      fail(
        "scene_physical_survival_equipment_missing",
        `${path}/wardrobeStates`,
        `${characterId} enters ${zone.mediumId} without required equipment state ${missing}.`,
      );
    }
  }

  return Object.freeze({
    version: SCENE_PHYSICAL_STATE_VERSION,
    worldLawDigest: worldLaw.validation.artifactDigest,
    visibleLocationId: locationId,
    zoneId: zone.zoneId,
    mediumId: zone.mediumId,
    gravityModelId: zone.gravityModelId,
    locomotionIds: unique(zone.locomotionIds),
    allowedPostureIds: unique(zone.allowedPostureIds),
    requiredSurvivalMechanismIds: unique(requiredMechanismIds),
    forbiddenElementIds: unique(worldLaw.forbiddenElementIds),
  });
}

export function physicalStateRenderRules(state = {}) {
  const rules = [];
  if (state.gravityModelId === "underwater_buoyancy") {
    rules.push(
      "Bodies are visibly buoyant: use swimming, floating, kneeling on the seabed or an explicitly assisted underwater walk; never depict an ordinary dry-land standing or walking pose.",
      "Loose hair, fabric and unsecured light elements drift with the water; released air bubbles rise.",
      "Feet touch the seabed only when the selected allowed posture explicitly supports that contact.",
    );
  } else if (state.gravityModelId === "vessel_defined_gravity") {
    rules.push("Inside the protected habitat, posture follows the vessel's declared gravity; outside it, no unprotected person may appear in vacuum.");
  } else if (state.gravityModelId === "ordinary_gravity_with_declared_flight") {
    rules.push("Every elevated or flying body is visibly supported by a protected route, secured vehicle or previously introduced flight capability.");
  } else if (state.gravityModelId === "ordinary_gravity") {
    rules.push("Bodies, clothing and loose objects obey ordinary gravity unless one previously introduced capability explicitly overrides it.");
  }
  if (state.locomotionIds?.length) rules.push(`Allowed locomotion only: ${state.locomotionIds.join(", ")}.`);
  if (state.allowedPostureIds?.length) rules.push(`Allowed postures only: ${state.allowedPostureIds.join(", ")}.`);
  if (state.requiredSurvivalMechanismIds?.length) {
    rules.push(`Every visible physical traveler has their own complete required mechanism: ${state.requiredSurvivalMechanismIds.join(", ")}.`);
  }
  if (state.forbiddenElementIds?.length) rules.push(`Forbidden world elements: ${state.forbiddenElementIds.join(", ")}.`);
  return rules;
}
