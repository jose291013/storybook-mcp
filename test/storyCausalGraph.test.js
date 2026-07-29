import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCausalGraph,
  normalizeCausalGraph,
  validateCausalGraph,
} from "../src/services/storyCausalGraph.js";
import { stabilizeStoryScenario } from "../src/services/storyScenario.js";

function scenes(count = 10) {
  return Array.from({ length: count }, (_, index) => ({ sceneNumber: index + 1 }));
}

function objects() {
  return [
    { objectId: "seed", name: "petite graine", initialState: "absent", trackEveryScene: true },
    { objectId: "sprout", name: "jeune pousse", initialState: "absent", trackEveryScene: true },
    { objectId: "flower", name: "fleur magique", initialState: "absent", trackEveryScene: true },
  ];
}

function chainEvents() {
  return [
    {
      id: "find_seed", scene_number: 2, type: "introduce", entity_id: "seed",
      from_state: "absent", to_state: "held",
    },
    {
      id: "plant_seed", scene_number: 5, type: "plant", entity_id: "seed",
      from_state: "held", to_state: "planted",
    },
    {
      id: "seed_sprouts", scene_number: 6, type: "transform", entity_id: "seed",
      from_state: "planted", to_state: "transformed", result_entity_id: "sprout", result_state: "visible",
    },
    {
      id: "sprout_blooms", scene_number: 9, type: "transform", entity_id: "sprout",
      from_state: "visible", to_state: "transformed", result_entity_id: "flower", result_state: "visible",
    },
  ];
}

function graph(events = chainEvents(), declaredObjects = objects()) {
  return normalizeCausalGraph({
    version: 1,
    entities: declaredObjects.map((object) => ({
      id: object.objectId,
      label: object.name,
      initial_state: object.initialState,
    })),
    events,
  }, declaredObjects, scenes());
}

test("a multi-stage transformation chain has one authoritative acyclic history", () => {
  const scenario = { objects: objects(), scenes: scenes(), causalGraph: graph() };
  applyCausalGraph(scenario);
  assert.deepEqual(validateCausalGraph(scenario), []);
  assert.deepEqual(
    scenario.objects.map((object) => ({
      id: object.objectId,
      authority: object.causalAuthority,
      events: object.lifecycle.events.map((event) => event.type),
    })),
    [
      { id: "seed", authority: "graph_v1", events: ["introduce", "plant", "transform"] },
      { id: "sprout", authority: "graph_v1", events: ["transform"] },
      { id: "flower", authority: "graph_v1", events: [] },
    ],
  );
});

test("an explicit causal graph overrides conflicting wording inference", () => {
  const narrativeScenes = scenes().map((scene) => ({
    ...scene,
    action: scene.sceneNumber === 3
      ? "Bastien tient déjà la jeune pousse dans sa main."
      : "Bastien poursuit son aventure.",
    objectStates: [],
    characterPresences: [],
    characterMovements: [],
    prerequisiteSceneIds: [],
    locationBefore: "jardin",
    locationAfter: "jardin",
    transition: { kind: "none", mechanism: "", mechanismId: "", characters: [] },
  }));
  const scenario = stabilizeStoryScenario({
    objects: objects(),
    scenes: narrativeScenes,
    causalGraph: graph(),
  });
  assert.deepEqual(
    scenario.scenes.map((scene) => scene.objectStates.find((state) => state.objectId === "sprout")?.state),
    ["absent", "absent", "absent", "absent", "absent", "visible", "visible", "visible", "transformed", "transformed"],
  );
});

test("a result cannot appear before its producing transformation", () => {
  const events = [
    ...chainEvents(),
    {
      id: "premature_sprout", scene_number: 3, type: "introduce", entity_id: "sprout",
      from_state: "absent", to_state: "visible",
    },
  ];
  const scenario = { objects: objects(), scenes: scenes(), causalGraph: graph(events) };
  const issues = validateCausalGraph(scenario);
  assert.ok(issues.some((issue) => issue.includes("appears before event seed_sprouts")));
});

test("one source cannot create competing terminal results", () => {
  const events = [
    ...chainEvents(),
    {
      id: "seed_becomes_flower_too", scene_number: 8, type: "transform", entity_id: "seed",
      from_state: "transformed", to_state: "transformed", result_entity_id: "flower", result_state: "visible",
    },
  ];
  const scenario = { objects: objects(), scenes: scenes(), causalGraph: graph(events) };
  const issues = validateCausalGraph(scenario);
  assert.ok(issues.some((issue) => issue.includes("more than one terminal outcome")));
  assert.ok(issues.some((issue) => issue.includes("reappears after terminal event")));
});

test("transformation cycles are rejected independently of object labels", () => {
  const declared = [
    { objectId: "thread_raw", name: "fil brillant", initialState: "visible", trackEveryScene: true },
    { objectId: "thread_woven", name: "fil brillant", initialState: "absent", trackEveryScene: true },
  ];
  const events = [
    {
      id: "weave", scene_number: 3, type: "transform", entity_id: "thread_raw",
      from_state: "visible", to_state: "transformed", result_entity_id: "thread_woven", result_state: "visible",
    },
    {
      id: "unweave", scene_number: 5, type: "transform", entity_id: "thread_woven",
      from_state: "visible", to_state: "transformed", result_entity_id: "thread_raw", result_state: "visible",
    },
  ];
  const scenario = { objects: declared, scenes: scenes(), causalGraph: graph(events, declared) };
  const issues = validateCausalGraph(scenario);
  assert.ok(issues.includes("causal graph contains a transformation cycle"));
  assert.equal(scenario.causalGraph.entities.length, 2);
});
