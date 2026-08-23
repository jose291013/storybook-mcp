import { canonicalDigest } from "./narrativeV3Canonical.js";

export const SCENE_STATE_BOUNDARY_VERSION = 1;

const PHASE_POLICY = Object.freeze({
  origin_ordinary: {
    visiblePhase: "end",
    cameraSide: "origin",
    passageMode: "forbidden",
    destinationEnvironmentAllowed: false,
    travelerOutfitMode: "ordinary",
    requiredStateIds: ["origin_environment", "ordinary_outfits_worn"],
    forbiddenStateIds: ["destination_environment", "passage_visible", "adventure_outfits_worn", "journey_equipment_worn"],
  },
  passage_discovery: {
    visiblePhase: "end",
    cameraSide: "origin",
    passageMode: "required_closed",
    destinationEnvironmentAllowed: false,
    travelerOutfitMode: "ordinary",
    requiredStateIds: ["origin_environment", "passage_visible", "adventure_outfits_beside_passage", "ordinary_outfits_worn"],
    forbiddenStateIds: ["destination_environment_as_surroundings", "traveler_beyond_passage", "adventure_outfits_worn"],
  },
  journey_preparation: {
    visiblePhase: "end",
    cameraSide: "origin",
    passageMode: "required_closed",
    destinationEnvironmentAllowed: false,
    travelerOutfitMode: "adventure",
    requiredStateIds: ["origin_environment", "passage_visible", "adventure_outfits_worn", "ordinary_clothes_stored_at_boundary"],
    forbiddenStateIds: ["destination_environment_as_surroundings", "traveler_beyond_passage", "ordinary_outfits_worn"],
  },
  outbound_crossing: {
    visiblePhase: "during",
    cameraSide: "boundary",
    passageMode: "required_open",
    destinationEnvironmentAllowed: true,
    travelerOutfitMode: "adventure",
    requiredStateIds: ["passage_visible", "outbound_crossing_visible", "adventure_outfits_worn"],
    forbiddenStateIds: ["ordinary_outfits_worn", "origin_witness_beyond_passage"],
  },
  adventure: {
    visiblePhase: "end",
    cameraSide: "adventure",
    passageMode: "not_required",
    destinationEnvironmentAllowed: true,
    travelerOutfitMode: "adventure",
    requiredStateIds: ["destination_environment", "adventure_outfits_worn", "adventure_world_physics"],
    forbiddenStateIds: ["origin_environment_as_surroundings", "ordinary_outfits_worn", "origin_witness_in_adventure"],
  },
  inbound_crossing: {
    visiblePhase: "during",
    cameraSide: "boundary",
    passageMode: "required_return",
    destinationEnvironmentAllowed: true,
    travelerOutfitMode: "adventure",
    requiredStateIds: ["passage_visible", "inbound_crossing_visible", "adventure_outfits_worn"],
    forbiddenStateIds: ["ordinary_outfits_worn", "origin_witness_in_adventure"],
  },
  restoration_and_storage: {
    visiblePhase: "end",
    cameraSide: "origin",
    passageMode: "required_settled",
    destinationEnvironmentAllowed: false,
    travelerOutfitMode: "ordinary",
    requiredStateIds: ["origin_environment", "ordinary_outfits_worn", "adventure_outfits_stored_at_boundary", "journey_equipment_stored"],
    forbiddenStateIds: ["destination_environment_as_surroundings", "adventure_outfits_worn", "journey_equipment_worn"],
  },
});

function policyFor(sceneState) {
  const policy = PHASE_POLICY[sceneState?.phase];
  if (!policy) throw new Error(`Unknown journey lifecycle phase ${sceneState?.phase || "(empty)"}.`);
  return policy;
}

export function sceneTimelineForJourneyPhase(sceneState) {
  const policy = policyFor(sceneState);
  if (policy.cameraSide === "boundary") {
    return sceneState.phase === "outbound_crossing"
      ? { locationBeforeId: "location_origin", locationAfterId: "location_adventure", visiblePhase: "during" }
      : { locationBeforeId: "location_adventure", locationAfterId: "location_origin", visiblePhase: "during" };
  }
  const locationId = policy.cameraSide === "adventure" ? "location_adventure" : "location_origin";
  return { locationBeforeId: locationId, locationAfterId: locationId, visiblePhase: policy.visiblePhase };
}

export function buildSceneStateBoundaryV1({ journeyLifecycle, sceneState, characterIdsByKey = new Map() } = {}) {
  const policy = policyFor(sceneState);
  const travelerCharacterIds = (journeyLifecycle?.travelerKeys || []).map((key) => characterIdsByKey.get(key)).filter(Boolean);
  const allCharacterIds = [...characterIdsByKey.values()];
  const travelerSet = new Set(travelerCharacterIds);
  const originWitnessCharacterIds = allCharacterIds.filter((id) => !travelerSet.has(id));
  const value = {
    version: SCENE_STATE_BOUNDARY_VERSION,
    sourceJourneyLifecycleDigest: String(journeyLifecycle?.validation?.artifactDigest || ""),
    journeyPhase: sceneState.phase,
    visiblePhase: policy.visiblePhase,
    cameraSide: policy.cameraSide,
    passageMode: policy.passageMode,
    destinationEnvironmentAllowed: policy.destinationEnvironmentAllowed,
    travelerOutfitMode: policy.travelerOutfitMode,
    travelerCharacterIds,
    originWitnessCharacterIds,
    requiredStateIds: [...policy.requiredStateIds],
    forbiddenStateIds: [
      ...policy.forbiddenStateIds,
      "cover_location_inherited",
      "cover_wardrobe_inherited",
      "cover_cast_inherited",
    ],
    digest: "",
  };
  const digestSource = structuredClone(value);
  delete digestSource.digest;
  value.digest = canonicalDigest(digestSource);
  return Object.freeze(structuredClone(value));
}

export function sceneStateBoundaryRenderRules(boundary = {}) {
  const phase = String(boundary.journeyPhase || "");
  const rules = [
    `Journey phase is exactly ${phase}; do not illustrate an earlier or later phase.`,
    `Camera side is exactly ${boundary.cameraSide}; the destination may${boundary.destinationEnvironmentAllowed ? "" : " not"} be the surrounding environment.`,
    `Passage mode is exactly ${boundary.passageMode}.`,
    `Traveler outfit mode is exactly ${boundary.travelerOutfitMode}.`,
    "The approved cover supplies identity and rendering style only; never copy its location, cast, wardrobe, equipment or portal state.",
  ];
  if (boundary.cameraSide === "boundary") rules.push("Show the crossing itself at the boundary; do not replace it with a completed arrival or departure tableau.");
  if (boundary.cameraSide === "adventure" && boundary.originWitnessCharacterIds?.length) {
    rules.push(`Origin witnesses remain absent from the adventure side: ${boundary.originWitnessCharacterIds.join(", ")}.`);
  }
  rules.push(...(boundary.forbiddenStateIds || []).map((id) => `Forbidden scene state: ${id}.`));
  return [...new Set(rules)];
}
