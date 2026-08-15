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
  if (worldContract?.physicalTopology) return worldContract.physicalTopology;
  if (key(worldContract?.id) === "coral_ocean") {
    return findUniverse("coral_ocean")?.storyContract?.physicalTopology || null;
  }
  return null;
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

function zoneForSide(side, config) {
  return side === "adventure" ? config.adventureZone : config.originZone;
}

export function worldPhysicalTopologyContractIssues(worldContract = {}) {
  const supplied = worldContract?.physicalTopology;
  if (!supplied || typeof supplied !== "object" || Array.isArray(supplied)) {
    return ["world physical topology is required"];
  }
  const issues = [];
  if (Number(supplied.version) !== WORLD_PHYSICAL_TOPOLOGY_VERSION) {
    issues.push("world physical topology version is invalid");
  }
  for (const field of [
    "originZone",
    "adventureZone",
    "transitionZone",
    "originMedium",
    "adventureMedium",
    "transitionMedium",
  ]) {
    if (!String(supplied[field] || "").trim()) issues.push(`world physical topology ${field} is required`);
  }
  if (supplied.entryBoundary !== "first_cross_passage") {
    issues.push("world physical topology entryBoundary is invalid");
  }
  if (!["origin", "adventure"].includes(supplied.noBoundarySide)) {
    issues.push("world physical topology noBoundarySide is invalid");
  }
  return issues;
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
  let side = entryPassageId
    ? "origin"
    : ["origin", "adventure"].includes(supplied.noBoundarySide) ? supplied.noBoundarySide : "origin";
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
    originZone: String(supplied.originZone || "the established origin zone"),
    adventureZone: String(supplied.adventureZone || "the established adventure zone"),
    transitionZone: String(supplied.transitionZone || "the established passage boundary"),
    originMedium: String(supplied.originMedium || "ordinary_environment"),
    adventureMedium: String(supplied.adventureMedium || "ordinary_environment"),
    transitionMedium: String(supplied.transitionMedium || "passage_transition"),
    noBoundarySide: ["origin", "adventure"].includes(supplied.noBoundarySide)
      ? supplied.noBoundarySide
      : "origin",
  };
  const entryPassageId = transitionIdentity(scenes.find((scene) => (
    scene?.transition?.kind === "cross_passage" && transitionIdentity(scene)
  )));
  let side = entryPassageId ? "origin" : config.noBoundarySide;
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
      const cameraZone = cameraSide === "boundary"
        ? config.transitionZone
        : zoneForSide(cameraSide, config);
      const otherSide = cameraSide === "boundary" ? afterSide : oppositeSide(cameraSide);
      selected = {
        version: WORLD_PHYSICAL_TOPOLOGY_VERSION,
        authority: "approved_scenario_entry_passage",
        entry_passage_id: entryPassageId,
        boundary_crossing: boundaryCrossing,
        camera_side: cameraSide,
        camera_zone: cameraZone,
        ambient_medium: ambientMedium,
        other_side_zone: zoneForSide(otherSide, config),
        other_side_medium: mediumForSide(otherSide, config),
        before_side: beforeSide,
        after_side: afterSide,
        before_zone: zoneForSide(beforeSide, config),
        after_zone: zoneForSide(afterSide, config),
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
    return `Show one readable instant inside ${topology.camera_zone}; do not merge ${topology.before_zone} and ${topology.after_zone} as one surrounding environment.`;
  }
  if (topology.ambient_medium === "breathable_air" && topology.other_side_medium === "fully_underwater") {
    return "The camera side is dry breathable air. Water, fish, coral, buoyancy and underwater lighting may appear only beyond a clearly bounded portal or sealed opening, never around the characters or camera-side furniture.";
  }
  if (topology.ambient_medium === "fully_underwater" && topology.other_side_medium === "breathable_air") {
    return "The camera side is fully underwater. Dry rooms, beaches, open sky and ordinary air may appear only beyond the established passage boundary, never as the characters' surrounding environment.";
  }
  return `Keep the camera inside ${topology.camera_zone} with medium ${topology.ambient_medium}. ${topology.other_side_zone} may appear only beyond the one clearly bounded established passage; never blend, duplicate or relocate its landmarks onto the camera side.`;
}
