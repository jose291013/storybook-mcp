import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCausalGraph,
  normalizeCausalGraph,
  projectCausalGraphObjectLedger,
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

test("strictly duplicate causal events are removed before canonical compilation", () => {
  const duplicated = chainEvents();
  duplicated.splice(1, 0, {
    ...duplicated[0],
    id: "find_seed_duplicate",
  });

  const normalized = graph(duplicated);

  assert.equal(normalized.events.length, chainEvents().length);
  assert.deepEqual(normalized.events.map((event) => event.sequence), [1, 2, 3, 4]);
  assert.equal(normalized.events.filter((event) => event.entityId === "seed" && event.sceneNumber === 2).length, 1);
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

test("a possessed object stays with its off-camera owner without becoming visible or changing causal state", () => {
  const narrativeScenes = [
    {
      sceneNumber: 1,
      characterPresences: [{ name: "Eva", mode: "physical" }],
    },
    {
      sceneNumber: 2,
      characterPresences: [{ name: "Noa", mode: "physical" }],
    },
    {
      sceneNumber: 3,
      characterPresences: [{ name: "Eva", mode: "physical" }],
    },
  ];
  const trackedObjects = [{
    objectId: "eva_basket",
    name: "panier d'Eva",
    owner: "Eva",
    initialState: "carried",
    initialQuantity: 1,
    trackEveryScene: true,
  }];
  const causalGraph = normalizeCausalGraph({
    version: 2,
    entities: [{
      id: "eva_basket",
      label: "panier d'Eva",
      initial_state: "carried",
      initial_owner_character: "Eva",
      initial_quantity: 1,
    }],
    events: [],
  }, trackedObjects, narrativeScenes, [{ name: "Eva" }, { name: "Noa" }]);
  const scenario = {
    objects: trackedObjects,
    scenes: narrativeScenes,
    characters: [{ name: "Eva" }, { name: "Noa" }],
    causalGraph,
  };

  applyCausalGraph(scenario);
  projectCausalGraphObjectLedger(scenario);

  assert.deepEqual(
    scenario.scenes.map((scene) => ({
      state: scene.objectStates[0].state,
      owner: scene.objectStates[0].owner,
      quantity: scene.objectStates[0].quantity,
    })),
    [
      { state: "carried", owner: "Eva", quantity: 1 },
      { state: "absent", owner: "", quantity: 0 },
      { state: "carried", owner: "Eva", quantity: 1 },
    ],
  );
  assert.equal(causalGraph.entities[0].initialState, "carried");
  assert.equal(causalGraph.entities[0].initialOwnerCharacter, "Eva");
  assert.match(scenario.scenes[1].objectStates[0].instruction, /remains with Eva off-camera/i);
  assert.deepEqual(validateCausalGraph(scenario), []);
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

test("version-2 graph deterministically projects every object snapshot from events", () => {
  const narrativeScenes = scenes(4).map((scene) => ({
    ...scene,
    action: "Lina et Eva réparent la lanterne.",
    objectStates: [{
      objectId: "lantern",
      name: "lanterne",
      owner: "atelier collectif",
      state: "visible",
      quantity: 7,
    }],
    characterPresences: [
      { name: "Lina", mode: "physical" },
      { name: "Eva", mode: "physical" },
    ],
    characterMovements: [],
    prerequisiteSceneIds: [],
    locationBefore: "atelier",
    locationAfter: "atelier",
    transition: { kind: "none", mechanism: "", mechanismId: "", characters: [] },
  }));
  const trackedObjects = [{
    objectId: "lantern",
    name: "lanterne",
    initialState: "visible",
    trackEveryScene: true,
  }];
  const characters = [{ name: "Lina" }, { name: "Eva" }];
  const causalGraph = normalizeCausalGraph({
    version: 2,
    entities: [{
      id: "lantern",
      label: "lanterne",
      initial_state: "absent",
      initial_owner_character: "",
      initial_quantity: 0,
    }],
    events: [
      {
        id: "lina_finds_lantern",
        scene_number: 2,
        type: "acquire",
        entity_id: "lantern",
        to_state: "held",
        to_owner_character: "Lina",
        to_quantity: 1,
      },
      {
        id: "lina_gives_lantern_to_eva",
        scene_number: 4,
        type: "transfer",
        entity_id: "lantern",
        to_state: "held",
        to_owner_character: "Eva",
        to_quantity: 1,
      },
    ],
  }, trackedObjects, narrativeScenes, characters);
  const scenario = stabilizeStoryScenario({
    characters,
    objects: trackedObjects,
    scenes: narrativeScenes,
    causalGraph,
  });

  assert.equal(causalGraph.authority, "draft_v2");
  assert.deepEqual(validateCausalGraph(scenario), []);
  assert.deepEqual(
    scenario.scenes.map((scene) => {
      const [snapshot] = scene.objectStates;
      return [snapshot.state, snapshot.owner, snapshot.quantity];
    }),
    [
      ["absent", "", 0],
      ["held", "Lina", 1],
      ["held", "Lina", 1],
      ["held", "Eva", 1],
    ],
  );
});

test("version-2 graph fails closed when a possessed state has no canonical owner", () => {
  const trackedObjects = [{
    objectId: "lantern",
    name: "lanterne",
    initialState: "absent",
    trackEveryScene: true,
  }];
  const causalGraph = normalizeCausalGraph({
    version: 2,
    entities: [{ id: "lantern", label: "lanterne", initial_state: "absent" }],
    events: [{
      id: "find_lantern",
      scene_number: 2,
      type: "acquire",
      entity_id: "lantern",
      to_state: "held",
      to_owner_character: "",
      to_quantity: 1,
    }],
  }, trackedObjects, scenes(3), [{ name: "Lina" }]);
  const scenario = {
    characters: [{ name: "Lina" }],
    objects: trackedObjects,
    scenes: scenes(3),
    causalGraph,
  };

  assert.ok(validateCausalGraph(scenario).some((issue) => (
    issue.includes("requires a character owner while held")
  )));
});

test("location-bound fixtures are visible only at their canonical home location", () => {
  const narrativeScenes = [
    { sceneNumber: 1, locationBefore: "place du phare", locationAfter: "place du phare" },
    { sceneNumber: 2, locationBefore: "place du phare", locationAfter: "atelier des Ã©chos" },
    { sceneNumber: 3, locationBefore: "atelier des Ã©chos", locationAfter: "place du phare" },
  ];
  const trackedObjects = [{
    objectId: "lighthouse",
    name: "phare des deux routes",
    initialState: "absent",
    trackEveryScene: true,
    spatialMode: "location_bound",
    homeLocation: "place du phare",
  }];
  const causalGraph = normalizeCausalGraph({
    version: 2,
    entities: [{
      id: "lighthouse",
      label: "phare des deux routes",
      initial_state: "absent",
      spatial_mode: "location_bound",
      home_location: "place du phare",
    }],
    events: [],
  }, trackedObjects, narrativeScenes, []);
  const scenario = {
    objects: trackedObjects,
    scenes: narrativeScenes,
    characters: [],
    causalGraph,
  };

  applyCausalGraph(scenario);
  projectCausalGraphObjectLedger(scenario);

  assert.equal(causalGraph.entities[0].initialState, "visible");
  assert.deepEqual(
    scenario.scenes.map((scene) => scene.objectStates[0].state),
    ["visible", "absent", "visible"],
  );
  assert.deepEqual(validateCausalGraph(scenario), []);
});

test("a location-bound result stays absent until its producing transformation", () => {
  const narrativeScenes = [
    { sceneNumber: 1, locationBefore: "rive du fleuve", locationAfter: "rive du fleuve" },
    { sceneNumber: 2, locationBefore: "rive du fleuve", locationAfter: "rive du fleuve" },
    { sceneNumber: 3, locationBefore: "rive du fleuve", locationAfter: "rive du fleuve" },
    { sceneNumber: 4, locationBefore: "rive du fleuve", locationAfter: "rive du fleuve" },
  ];
  const trackedObjects = [
    {
      objectId: "bridge_in_progress",
      name: "structure initiale du pont",
      initialState: "installed",
      initialQuantity: 1,
      trackEveryScene: true,
      spatialMode: "location_bound",
      homeLocation: "rive du fleuve",
    },
    {
      objectId: "safe_bridge",
      name: "pont solide",
      initialState: "absent",
      initialQuantity: 0,
      trackEveryScene: true,
      spatialMode: "location_bound",
      homeLocation: "rive du fleuve",
    },
  ];
  const causalGraph = normalizeCausalGraph({
    version: 2,
    entities: [
      {
        id: "bridge_in_progress",
        label: "structure initiale du pont",
        initial_state: "installed",
        initial_quantity: 1,
        spatial_mode: "location_bound",
        home_location: "rive du fleuve",
      },
      {
        id: "safe_bridge",
        label: "pont solide",
        initial_state: "absent",
        initial_quantity: 0,
        spatial_mode: "location_bound",
        home_location: "rive du fleuve",
      },
    ],
    events: [{
      id: "finish_bridge",
      scene_number: 3,
      type: "transform",
      entity_id: "bridge_in_progress",
      from_state: "installed",
      to_state: "transformed",
      to_quantity: 1,
      result_entity_id: "safe_bridge",
      result_state: "installed",
      result_quantity: 1,
    }],
  }, trackedObjects, narrativeScenes, []);
  const scenario = {
    objects: trackedObjects,
    scenes: narrativeScenes,
    characters: [],
    causalGraph,
  };

  applyCausalGraph(scenario);
  projectCausalGraphObjectLedger(scenario);

  assert.equal(causalGraph.entities.find((entity) => entity.id === "safe_bridge").initialState, "absent");
  assert.deepEqual(
    scenario.scenes.map((scene) => (
      scene.objectStates.find((state) => state.objectId === "safe_bridge").state
    )),
    ["absent", "absent", "installed", "installed"],
  );
  assert.deepEqual(validateCausalGraph(scenario), []);
});

test("a location-bound object installed later stays absent before installation", () => {
  const narrativeScenes = [
    { sceneNumber: 1, locationBefore: "atelier", locationAfter: "atelier" },
    { sceneNumber: 2, locationBefore: "atelier", locationAfter: "atelier" },
  ];
  const trackedObjects = [{
    objectId: "wall_lamp",
    name: "lampe murale",
    initialState: "absent",
    initialQuantity: 0,
    trackEveryScene: true,
    spatialMode: "location_bound",
    homeLocation: "atelier",
  }];
  const causalGraph = normalizeCausalGraph({
    version: 2,
    entities: [{
      id: "wall_lamp",
      label: "lampe murale",
      initial_state: "absent",
      initial_quantity: 0,
      spatial_mode: "location_bound",
      home_location: "atelier",
    }],
    events: [{
      id: "install_lamp",
      scene_number: 2,
      type: "install",
      entity_id: "wall_lamp",
      from_state: "absent",
      to_state: "installed",
      to_quantity: 1,
    }],
  }, trackedObjects, narrativeScenes, []);
  const scenario = {
    objects: trackedObjects,
    scenes: narrativeScenes,
    characters: [],
    causalGraph,
  };

  applyCausalGraph(scenario);
  projectCausalGraphObjectLedger(scenario);

  assert.deepEqual(
    scenario.scenes.map((scene) => scene.objectStates[0].state),
    ["absent", "installed"],
  );
  assert.deepEqual(validateCausalGraph(scenario), []);
});

test("progressive uses advance monotonically without fake retrieval and installation", () => {
  const narrativeScenes = scenes(3).map((scene) => ({
    ...scene,
    locationBefore: "atelier",
    locationAfter: "atelier",
  }));
  const trackedObjects = [{
    objectId: "special_light",
    name: "lumiÃ¨re spÃ©ciale",
    initialState: "installed",
    trackEveryScene: true,
    spatialMode: "portable",
    progressTotal: 2,
  }];
  const causalGraph = normalizeCausalGraph({
    version: 2,
    entities: [{
      id: "special_light",
      label: "lumiÃ¨re spÃ©ciale",
      initial_state: "installed",
      initial_quantity: 1,
      progress_total: 2,
      initial_progress: 0,
    }],
    events: [
      {
        id: "first_charge", scene_number: 2, type: "use", entity_id: "special_light",
        from_state: "installed", to_state: "installed", to_quantity: 1, progress_step: 1,
      },
      {
        id: "second_charge", scene_number: 3, type: "use", entity_id: "special_light",
        from_state: "installed", to_state: "installed", to_quantity: 1, progress_step: 2,
      },
    ],
  }, trackedObjects, narrativeScenes, []);
  const scenario = {
    objects: trackedObjects,
    scenes: narrativeScenes,
    characters: [],
    causalGraph,
  };

  applyCausalGraph(scenario);
  projectCausalGraphObjectLedger(scenario);

  assert.deepEqual(
    scenario.scenes.map((scene) => scene.objectStates[0].progressStep),
    [0, 1, 2],
  );
  assert.deepEqual(
    scenario.scenes.map((scene) => scene.objectStates[0].state),
    ["installed", "installed", "installed"],
  );
  assert.deepEqual(validateCausalGraph(scenario), []);
});

test("same-scene object changes remain ordered and reject a contradictory declared predecessor", () => {
  const narrativeScenes = scenes(2);
  const trackedObjects = [{
    objectId: "special_light",
    name: "lumiere speciale",
    initialState: "installed",
    trackEveryScene: true,
  }];
  const causalGraph = normalizeCausalGraph({
    version: 2,
    entities: [{
      id: "special_light",
      label: "lumiere speciale",
      initial_state: "installed",
      initial_quantity: 1,
    }],
    events: [
      {
        id: "detach_light", scene_number: 2, type: "retrieve", entity_id: "special_light",
        from_state: "installed", to_state: "held", to_owner_character: "Lina", to_quantity: 1,
      },
      {
        id: "attach_light", scene_number: 2, type: "install", entity_id: "special_light",
        from_state: "visible", to_state: "installed", to_owner_character: "", to_quantity: 1,
      },
    ],
  }, trackedObjects, narrativeScenes, [{ name: "Lina" }]);
  const scenario = {
    objects: trackedObjects,
    scenes: narrativeScenes,
    characters: [{ name: "Lina" }],
    causalGraph,
  };

  assert.deepEqual(causalGraph.events.map(({ sequence }) => sequence), [1, 2]);
  assert.ok(validateCausalGraph(scenario).some((issue) => (
    issue.includes("attach_light expects visible but special_light is held")
  )));
});
