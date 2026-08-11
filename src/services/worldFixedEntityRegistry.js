import { compileWorldPhysicalTopology, worldSideForLocation } from "./worldPhysicalTopology.js";

export const WORLD_FIXED_ENTITY_REGISTRY_VERSION = 1;

function key(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function stateForScene(scene, entity) {
  return (Array.isArray(scene?.objectStates) ? scene.objectStates : []).find((state) => (
    (entity.objectId && key(state?.objectId) === key(entity.objectId))
    || key(state?.name) === key(entity.name)
  )) || null;
}

const NON_VISIBLE_STATES = new Set(["absent", "consumed", "destroyed", "transformed", "used_up"]);

function canonicalHomeState({ approvedScenario, scene, entity, visibleLocation }) {
  const currentState = stateForScene(scene, entity)?.state;
  if (key(visibleLocation) === key(entity.homeLocation) && currentState) return currentState;
  const previousHomeState = (Array.isArray(approvedScenario?.scenes) ? approvedScenario.scenes : [])
    .filter((candidate) => (
      Number(candidate?.sceneNumber || 0) <= Number(scene?.sceneNumber || 0)
      && key(candidate?.locationAfter) === key(entity.homeLocation)
    ))
    .sort((left, right) => Number(right?.sceneNumber || 0) - Number(left?.sceneNumber || 0))
    .map((candidate) => stateForScene(candidate, entity)?.state)
    .find(Boolean);
  return previousHomeState || entity.initialState || "visible";
}

function sceneVisibility({ scene, entity, approvedScenario, worldContract, location, phase = "after" }) {
  if (!scene) return null;
  const topology = compileWorldPhysicalTopology({
    approvedScenario,
    approvedScene: scene,
    worldContract,
    visiblePhase: phase,
  });
  const visibleLocation = String(location || (phase === "before" ? scene.locationBefore : scene.locationAfter) || "").trim();
  const homeSide = worldSideForLocation({ approvedScenario, worldContract, location: entity.homeLocation });
  const atHome = key(visibleLocation) === key(entity.homeLocation);
  const exists = !NON_VISIBLE_STATES.has(canonicalHomeState({
    approvedScenario,
    scene,
    entity,
    visibleLocation,
  }));
  let status = "absent_elsewhere";
  if (!exists) status = "absent";
  else if (atHome) status = "visible_once";
  else if (homeSide && topology?.camera_side && homeSide !== topology.camera_side) status = "other_side_only";
  return {
    scene_number: Number(scene.sceneNumber || 0),
    location: visibleLocation,
    camera_side: topology?.camera_side || "",
    status,
  };
}

function entityRule(entity) {
  const identity = `${entity.name} (${entity.id})`;
  if (entity.status === "visible_once") {
    return `${identity} is the one canonical fixed entity at ${entity.home_location}: show at most one instance, with no duplicate, twin, miniature copy or second background version.`;
  }
  if (entity.status === "other_side_only") {
    return `${identity} belongs only at ${entity.home_location} on the ${entity.home_side} side. Camera-side quantity is zero; it may be glimpsed at most once only beyond the established bounded passage, never relocated into ${entity.camera_location}.`;
  }
  return `${identity} belongs only at ${entity.home_location} and is absent from ${entity.camera_location}; do not add a copy, silhouette, miniature or decorative duplicate.`;
}

export function compileWorldFixedEntityRegistry({
  approvedScenario = null,
  approvedScene = null,
  worldContract = {},
  visibleLocation = "",
  visiblePhase = "after",
} = {}) {
  const objects = (Array.isArray(approvedScenario?.objects) ? approvedScenario.objects : [])
    .filter((object) => object?.spatialMode === "location_bound" && object?.homeLocation);
  if (!approvedScene || !objects.length) return [];
  const orderedScenes = (Array.isArray(approvedScenario?.scenes) ? approvedScenario.scenes : [])
    .slice()
    .sort((left, right) => Number(left?.sceneNumber || 0) - Number(right?.sceneNumber || 0));
  const sceneIndex = orderedScenes.findIndex((scene) => Number(scene?.sceneNumber) === Number(approvedScene?.sceneNumber));
  return objects.map((entity) => {
    const current = sceneVisibility({
      scene: approvedScene,
      entity,
      approvedScenario,
      worldContract,
      location: visibleLocation,
      phase: visiblePhase,
    });
    const homeSide = worldSideForLocation({ approvedScenario, worldContract, location: entity.homeLocation });
    const fixed = {
      id: entity.objectId || key(entity.name),
      name: String(entity.name || "").trim(),
      home_location: String(entity.homeLocation || "").trim(),
      home_side: homeSide,
      camera_location: String(visibleLocation || "").trim(),
      camera_side: current?.camera_side || "",
      status: current?.status || "absent_elsewhere",
      camera_quantity: current?.status === "visible_once" ? 1 : 0,
      other_side_quantity_limit: current?.status === "other_side_only" ? 1 : 0,
      global_quantity_limit: 1,
      adjacent_visibility: [sceneIndex - 1, sceneIndex, sceneIndex + 1]
        .filter((index) => index >= 0 && index < orderedScenes.length)
        .map((index) => sceneVisibility({
          scene: orderedScenes[index],
          entity,
          approvedScenario,
          worldContract,
        })),
    };
    return { ...fixed, rule: entityRule(fixed) };
  });
}
