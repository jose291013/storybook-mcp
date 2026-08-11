import { findUniverse } from "../config/bookOptions.js";

export const WORLD_PHYSICAL_TOPOLOGY_VERSION = 1;

function key(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function topologyConfig(worldContract = {}) {
  return worldContract?.physicalTopology
    || findUniverse(worldContract?.id)?.storyContract?.physicalTopology
    || null;
}

function transitionIdentity(scene = {}) {
  return key(scene?.transition?.mechanismId || scene?.transition?.mechanism);
}

function isCrossing(scene = {}) {
  return ["cross_passage", "return_travel"].includes(String(scene?.transition?.kind || ""))
    && Boolean(transitionIdentity(scene));
}

function oppositeSide(side) {
  return side === "adventure" ? "origin" : "adventure";
}

function mediumForSide(side, config) {
  return side === "adventure" ? config.adventureMedium : config.originMedium;
}

export function worldSideForLocation({
  approvedScenario = null,
  worldContract = {},
  location = "",
} = {}) {
  const supplied = topologyConfig(worldContract);
  const scenes = (Array.isArray(approvedScenario?.scenes) ? approvedScenario.scenes : [])
    .slice()
    .sort((left, right) => Number(left?.sceneNumber || 0) - Number(right?.sceneNumber || 0));
  const locationKey = key(location);
  if (!supplied || !scenes.length || !locationKey) return "";
  const entryPassageId = transitionIdentity(scenes.find((scene) => (
    scene?.transition?.kind === "cross_passage" && transitionIdentity(scene)
  )));
  let side = "origin";
  for (const scene of scenes) {
    if (key(scene?.locationBefore) === locationKey) return side;
    const boundaryCrossing = Boolean(
      entryPassageId
      && transitionIdentity(scene) === entryPassageId
      && isCrossing(scene),
    );
    const afterSide = boundaryCrossing ? oppositeSide(side) : side;
    if (key(scene?.locationAfter) === locationKey) return afterSide;
    side = afterSide;
  }
  return "";
}

export function compileWorldPhysicalTopology({
  approvedScenario = null,
  approvedScene = null,
  worldContract = {},
  visiblePhase = "after",
} = {}) {
  const supplied = topologyConfig(worldContract);
  const scenes = (Array.isArray(approvedScenario?.scenes) ? approvedScenario.scenes : [])
    .slice()
    .sort((left, right) => Number(left?.sceneNumber || 0) - Number(right?.sceneNumber || 0));
  if (!supplied || !approvedScene || !scenes.length) return null;
  const config = {
    originMedium: String(supplied.originMedium || "ordinary_environment"),
    adventureMedium: String(supplied.adventureMedium || "ordinary_environment"),
    transitionMedium: String(supplied.transitionMedium || "passage_transition"),
  };
  const entryPassageId = transitionIdentity(scenes.find((scene) => (
    scene?.transition?.kind === "cross_passage" && transitionIdentity(scene)
  )));
  let side = "origin";
  let selected = null;
  for (const scene of scenes) {
    const beforeSide = side;
    const boundaryCrossing = Boolean(
      entryPassageId
      && transitionIdentity(scene) === entryPassageId
      && isCrossing(scene),
    );
    const afterSide = boundaryCrossing ? oppositeSide(beforeSide) : beforeSide;
    if (Number(scene?.sceneNumber) === Number(approvedScene?.sceneNumber)) {
      const phase = ["before", "during", "after"].includes(visiblePhase) ? visiblePhase : "after";
      const cameraSide = phase === "during" && boundaryCrossing
        ? "boundary"
        : phase === "before" ? beforeSide : afterSide;
      const ambientMedium = cameraSide === "boundary"
        ? config.transitionMedium
        : mediumForSide(cameraSide, config);
      const otherSide = cameraSide === "boundary" ? afterSide : oppositeSide(cameraSide);
      selected = {
        version: WORLD_PHYSICAL_TOPOLOGY_VERSION,
        authority: "approved_scenario_entry_passage",
        entry_passage_id: entryPassageId,
        boundary_crossing: boundaryCrossing,
        camera_side: cameraSide,
        ambient_medium: ambientMedium,
        other_side_medium: mediumForSide(otherSide, config),
        before_side: beforeSide,
        after_side: afterSide,
      };
      break;
    }
    side = afterSide;
  }
  return selected;
}

export function cameraBoundaryRule(topology = null) {
  if (!topology) return "";
  if (topology.camera_side === "boundary") {
    return "Show one readable instant inside the established passage boundary; do not merge both complete environments around the characters.";
  }
  if (topology.ambient_medium === "breathable_air" && topology.other_side_medium === "fully_underwater") {
    return "The camera side is dry breathable air. Water, fish, coral, buoyancy and underwater lighting may appear only beyond a clearly bounded portal or sealed opening, never around the characters or camera-side furniture.";
  }
  if (topology.ambient_medium === "fully_underwater" && topology.other_side_medium === "breathable_air") {
    return "The camera side is fully underwater. Dry rooms, beaches, open sky and ordinary air may appear only beyond the established passage boundary, never as the characters' surrounding environment.";
  }
  return `Keep the camera-side medium ${topology.ambient_medium}; a different medium may appear only beyond a clearly bounded established passage.`;
}
