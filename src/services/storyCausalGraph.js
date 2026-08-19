export const STORY_CAUSAL_GRAPH_VERSION = 2;
export const LEGACY_STORY_CAUSAL_GRAPH_VERSION = 1;
export const STORY_OBJECT_RENDER_LEDGER_VERSION = 2;

const STATES = new Set([
  "worn", "held", "carried", "stored", "visible", "absent", "left_behind",
  "planted", "installed", "consumed", "transformed", "destroyed", "used_up",
]);
const EVENT_TYPES = new Set([
  "introduce", "acquire", "plant", "install", "consume", "transform", "destroy",
  "retrieve", "store", "transfer", "use",
]);
const TERMINAL_TYPES = new Set(["consume", "transform", "destroy"]);
const TERMINAL_STATES = new Set(["consumed", "transformed", "destroyed", "used_up"]);
const POSSESSION_STATES = new Set(["worn", "held", "carried"]);
const SPATIAL_MODES = new Set(["portable", "location_bound"]);

function clean(value) {
  return String(value || "").trim();
}

function stableId(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function values(value, maximum = 60) {
  return (Array.isArray(value) ? value : []).filter(Boolean).slice(0, maximum);
}

function objectId(object = {}, index = 0) {
  return stableId(
    object.objectId
    || object.object_id
    || object.entityId
    || object.entity_id
    || `${object.name || "object"}_${object.owner || index + 1}`,
  );
}

function canonicalCharacterName(value, characters = []) {
  const requested = stableId(value);
  if (!requested) return "";
  return clean(values(characters, 30).find((character) => (
    stableId(character?.name) === requested
  ))?.name || value);
}

function stateQuantity(state, supplied, fallback = 1) {
  if (state === "absent") return 0;
  const parsed = Number(supplied);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function stateOwner(state, supplied, characters = []) {
  if (!POSSESSION_STATES.has(state)) return "";
  return canonicalCharacterName(supplied, characters);
}

function boundedProgress(value, maximum = 20) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(0, Math.min(maximum, parsed)) : 0;
}

function sceneFocalLocation(scene = {}) {
  return clean(scene.locationAfter || scene.location_after || scene.locationBefore || scene.location_before);
}

function objectSpatialState(object = {}, canonical = {}, scene = {}) {
  if (object.spatialMode !== "location_bound") return canonical;
  const atHome = stableId(sceneFocalLocation(scene)) === stableId(object.homeLocation);
  if (atHome || canonical.state === "absent" || TERMINAL_STATES.has(canonical.state)) return canonical;
  return {
    ...canonical,
    state: "absent",
    owner: "",
    quantity: 0,
  };
}

function physicalCharacterKeys(scene = {}) {
  return new Set(values(scene.characterPresences, 30)
    .filter((presence) => presence?.mode === "physical")
    .map((presence) => stableId(presence?.name))
    .filter(Boolean));
}

export function objectRenderState(canonical = {}, scene = {}) {
  if (!POSSESSION_STATES.has(canonical?.state) || !canonical?.owner) return canonical;
  if (physicalCharacterKeys(scene).has(stableId(canonical.owner))) return canonical;
  return {
    ...canonical,
    state: "absent",
    owner: "",
    quantity: 0,
    hiddenWithOwner: canonical.owner,
  };
}

export function causalGraphObjectStateAtScene(scenario = {}, entityIdValue = "", sceneNumberValue = 0) {
  const graph = scenario?.causalGraph || {};
  const entityId = stableId(entityIdValue);
  const sceneNumber = Number(sceneNumberValue);
  const entity = values(graph.entities, 30).find((candidate) => candidate.id === entityId);
  if (!entity || !Number.isInteger(sceneNumber) || sceneNumber < 1) return null;
  let current = {
    state: entity.initialState,
    owner: entity.initialOwnerCharacter || "",
    quantity: stateQuantity(entity.initialState, entity.initialQuantity),
    eventId: "",
    progressStep: boundedProgress(entity.initialProgress, boundedProgress(entity.progressTotal) || 20),
  };
  const events = values(graph.events, 80)
    .filter((event) => event.structurallyValid && Number(event.sceneNumber) <= sceneNumber)
    .slice()
    .sort((left, right) => left.sceneNumber - right.sceneNumber || left.sequence - right.sequence);
  for (const event of events) {
    if (event.entityId === entityId) {
      current = {
        state: event.toState,
        owner: event.toOwnerCharacter || "",
        quantity: stateQuantity(event.toState, event.toQuantity),
        eventId: event.id,
        progressStep: event.progressStep || current.progressStep || 0,
      };
    }
    if (event.resultEntityId === entityId) {
      current = {
        state: event.resultState,
        owner: event.resultOwnerCharacter || "",
        quantity: stateQuantity(event.resultState, event.resultQuantity),
        eventId: event.id,
        progressStep: event.progressStep || current.progressStep || 0,
      };
    }
  }
  return current;
}

function graphEntityOwner(graph = {}, entityIdValue = "", characters = []) {
  const entity = values(graph.entities, 30).find((candidate) => candidate.id === entityIdValue);
  const owners = [
    entity?.initialOwnerCharacter,
    ...values(graph.events, 80).filter((event) => (
      event.entityId === entityIdValue || event.resultEntityId === entityIdValue
    )).flatMap((event) => [
      event.entityId === entityIdValue ? event.toOwnerCharacter : "",
      event.resultEntityId === entityIdValue ? event.resultOwnerCharacter : "",
    ]),
  ].map((owner) => canonicalCharacterName(owner, characters)).filter(Boolean);
  const uniqueOwners = [...new Set(owners)];
  return uniqueOwners.length === 1 ? uniqueOwners[0] : "";
}

export function normalizeCausalGraph(rawGraph = {}, objects = [], scenes = [], characters = []) {
  const version = Number(rawGraph?.version);
  if (![LEGACY_STORY_CAUSAL_GRAPH_VERSION, STORY_CAUSAL_GRAPH_VERSION].includes(version)) return null;
  const sceneNumbers = new Set(scenes.map((scene) => Number(scene.sceneNumber)));
  const declared = objects.map((object, index) => {
    const initialState = STATES.has(object.initialState) ? object.initialState : "visible";
    return {
      id: objectId(object, index),
      label: clean(object.name),
      initialState,
      initialOwnerCharacter: stateOwner(initialState, object.owner, characters),
      initialQuantity: stateQuantity(initialState, object.initialQuantity),
      spatialMode: SPATIAL_MODES.has(object.spatialMode) ? object.spatialMode : "portable",
      homeLocation: clean(object.homeLocation),
      progressTotal: boundedProgress(object.progressTotal),
      initialProgress: 0,
    };
  });
  const suppliedEntities = values(rawGraph.entities, 30);
  const entities = declared.map((entity) => {
    const supplied = suppliedEntities.find((item) => stableId(item?.id || item?.entity_id) === entity.id) || {};
    const initialState = STATES.has(supplied.initial_state || supplied.initialState)
      ? clean(supplied.initial_state || supplied.initialState)
      : entity.initialState;
    return {
      ...entity,
      label: clean(supplied.label || supplied.name) || entity.label,
      initialState,
      initialOwnerCharacter: stateOwner(
        initialState,
        supplied.initial_owner_character || supplied.initialOwnerCharacter || entity.initialOwnerCharacter,
        characters,
      ),
      initialQuantity: stateQuantity(
        initialState,
        supplied.initial_quantity ?? supplied.initialQuantity,
        entity.initialQuantity,
      ),
      spatialMode: SPATIAL_MODES.has(supplied.spatial_mode || supplied.spatialMode)
        ? clean(supplied.spatial_mode || supplied.spatialMode)
        : entity.spatialMode,
      homeLocation: clean(supplied.home_location || supplied.homeLocation || entity.homeLocation),
      progressTotal: boundedProgress(
        supplied.progress_total ?? supplied.progressTotal ?? entity.progressTotal,
      ),
      initialProgress: boundedProgress(
        supplied.initial_progress ?? supplied.initialProgress ?? entity.initialProgress,
        boundedProgress(supplied.progress_total ?? supplied.progressTotal ?? entity.progressTotal) || 20,
      ),
    };
  });
  const entityIds = new Set(entities.map((entity) => entity.id));
  const events = values(rawGraph.events, 80).map((item, index) => {
    const sceneNumber = Number(item?.scene_number || item?.sceneNumber);
    const type = clean(item?.type);
    const entityId = stableId(item?.entity_id || item?.entityId || item?.source_entity_id || item?.sourceEntityId);
    const resultEntityId = stableId(item?.result_entity_id || item?.resultEntityId);
    const fromState = clean(item?.from_state || item?.fromState);
    const toState = clean(item?.to_state || item?.toState);
    const toOwnerCharacter = stateOwner(
      toState,
      item?.to_owner_character || item?.toOwnerCharacter,
      characters,
    );
    const resultState = STATES.has(item?.result_state || item?.resultState)
      ? clean(item?.result_state || item?.resultState)
      : "visible";
    return {
      id: stableId(item?.id || `event_${index + 1}`),
      sceneNumber,
      type,
      entityId,
      resultEntityId,
      fromState: STATES.has(fromState) ? fromState : "",
      toState: STATES.has(toState) ? toState : "",
      toOwnerCharacter,
      toQuantity: stateQuantity(toState, item?.to_quantity ?? item?.toQuantity),
      resultState,
      resultOwnerCharacter: stateOwner(
        resultState,
        item?.result_owner_character || item?.resultOwnerCharacter,
        characters,
      ),
      resultQuantity: stateQuantity(
        resultState,
        item?.result_quantity ?? item?.resultQuantity,
      ),
      progressStep: boundedProgress(item?.progress_step ?? item?.progressStep),
      sequence: index + 1,
      structurallyValid: Boolean(
        sceneNumbers.has(sceneNumber)
        && EVENT_TYPES.has(type)
        && entityIds.has(entityId)
        && STATES.has(toState)
        && (!resultEntityId || entityIds.has(resultEntityId)),
      ),
    };
  }).filter((event, index, all) => {
    const signature = (candidate) => JSON.stringify({
      sceneNumber: candidate.sceneNumber,
      type: candidate.type,
      entityId: candidate.entityId,
      resultEntityId: candidate.resultEntityId,
      fromState: candidate.fromState,
      toState: candidate.toState,
      toOwnerCharacter: candidate.toOwnerCharacter,
      toQuantity: candidate.toQuantity,
      resultState: candidate.resultState,
      resultOwnerCharacter: candidate.resultOwnerCharacter,
      resultQuantity: candidate.resultQuantity,
      progressStep: candidate.progressStep,
    });
    return all.findIndex((candidate) => signature(candidate) === signature(event)) === index;
  }).map((event, index) => ({
    ...event,
    sequence: index + 1,
  }));
  for (const entity of entities) {
    const hasDeferredAppearance = events.some((event) => (
      event.resultEntityId === entity.id
      || (
        event.entityId === entity.id
        && event.toState !== "absent"
        && (
          event.fromState === "absent"
          || ["introduce", "acquire"].includes(event.type)
        )
      )
    ));
    if (entity.spatialMode === "location_bound"
      && entity.initialState === "absent"
      && !hasDeferredAppearance) {
      entity.initialState = "visible";
      entity.initialQuantity = 1;
    }
  }
  return {
    version,
    authority: version === STORY_CAUSAL_GRAPH_VERSION ? "draft_v2" : "architect_legacy",
    entities,
    events,
  };
}

export function applyCausalGraph(input = {}) {
  const scenario = input;
  const graph = scenario?.causalGraph;
  if (![LEGACY_STORY_CAUSAL_GRAPH_VERSION, STORY_CAUSAL_GRAPH_VERSION].includes(Number(graph?.version))) return scenario;
  const objects = values(scenario.objects, 30);
  const byId = new Map();
  for (const [index, object] of objects.entries()) {
    object.objectId = objectId(object, index);
    byId.set(object.objectId, object);
    const entity = graph.entities.find((candidate) => candidate.id === object.objectId);
    if (entity) {
      object.initialState = entity.initialState;
      object.initialQuantity = entity.initialQuantity;
      object.owner = graphEntityOwner(graph, object.objectId, scenario.characters);
      object.spatialMode = entity.spatialMode || object.spatialMode || "portable";
      object.homeLocation = clean(entity.homeLocation || object.homeLocation);
      object.progressTotal = boundedProgress(entity.progressTotal || object.progressTotal);
    }
  }
  for (const object of objects) {
    const events = graph.events
      .filter((event) => event.entityId === object.objectId && event.structurallyValid)
      .map((event) => ({
        sceneNumber: event.sceneNumber,
        type: event.type,
        state: event.toState,
        resultingObject: byId.get(event.resultEntityId)?.name || "",
        resultingState: event.resultState,
      }))
      .filter((event) => event.state)
      .sort((left, right) => left.sceneNumber - right.sceneNumber);
    object.causalAuthority = `graph_v${graph.version}`;
    object.lifecycle = {
      version: 1,
      kind: events.some((event) => ["plant", "transform"].includes(event.type))
        ? "transformable"
        : events.some((event) => event.type === "consume")
          ? "consumable"
          : events.some((event) => ["introduce", "acquire"].includes(event.type))
            ? "discoverable"
            : "persistent",
      events,
    };
  }
  return scenario;
}

function ledgerInstruction({ label, state, owner, quantity }) {
  if (state === "absent" || quantity === 0) return `${label} is absent from this scene; render zero instances.`;
  const cardinality = quantity === 1 ? "one and only one instance" : `exactly ${quantity} members of one persistent group`;
  if (owner) return `${owner} has ${cardinality} of ${label}; preserve this exact state (${state}) and do not duplicate it in another position.`;
  return `${label} has one authoritative state in this scene: ${state}; render ${cardinality} in one location only.`;
}

export function projectCausalGraphObjectLedger(input = {}) {
  const scenario = input;
  const graph = scenario?.causalGraph;
  if (Number(graph?.version) !== STORY_CAUSAL_GRAPH_VERSION) return scenario;
  const objects = values(scenario.objects, 30);
  const trackedIds = new Set(objects.filter((object) => object.trackEveryScene).map((object, index) => objectId(object, index)));
  const entities = values(graph.entities, 30).filter((entity) => trackedIds.has(entity.id));
  const stateByEntity = new Map(entities.map((entity) => [entity.id, {
    state: entity.initialState,
    owner: entity.initialOwnerCharacter || "",
    quantity: stateQuantity(entity.initialState, entity.initialQuantity),
    eventId: "",
    progressStep: boundedProgress(entity.initialProgress, boundedProgress(entity.progressTotal) || 20),
  }]));
  const events = values(graph.events, 80)
    .filter((event) => event.structurallyValid)
    .slice()
    .sort((left, right) => left.sceneNumber - right.sceneNumber || left.sequence - right.sequence);
  const hiddenSceneNumbers = new Set();
  let hiddenPossessedStates = 0;
  for (const scene of values(scenario.scenes, 30).slice().sort((left, right) => left.sceneNumber - right.sceneNumber)) {
    for (const event of events.filter((candidate) => candidate.sceneNumber === Number(scene.sceneNumber))) {
      stateByEntity.set(event.entityId, {
        state: event.toState,
        owner: event.toOwnerCharacter || "",
        quantity: stateQuantity(event.toState, event.toQuantity),
        eventId: event.id,
        progressStep: event.progressStep || stateByEntity.get(event.entityId)?.progressStep || 0,
      });
      if (event.resultEntityId) {
        stateByEntity.set(event.resultEntityId, {
          state: event.resultState,
          owner: event.resultOwnerCharacter || "",
          quantity: stateQuantity(event.resultState, event.resultQuantity),
          eventId: event.id,
          progressStep: event.progressStep || stateByEntity.get(event.resultEntityId)?.progressStep || 0,
        });
      }
    }
    scene.objectStates = entities.map((entity) => {
      const canonical = stateByEntity.get(entity.id);
      const object = objects.find((candidate, index) => objectId(candidate, index) === entity.id);
      const spatial = objectSpatialState(object, canonical, scene);
      const current = objectRenderState(spatial, scene);
      if (current.hiddenWithOwner) {
        hiddenPossessedStates += 1;
        hiddenSceneNumbers.add(Number(scene.sceneNumber));
      }
      return {
        objectId: entity.id,
        name: clean(object?.name || entity.label),
        owner: current.owner,
        state: current.state,
        quantity: current.quantity,
        ...(current.hiddenWithOwner ? {
          visibilityReason: "owner_off_camera",
          causalOwner: current.hiddenWithOwner,
        } : {}),
        progressStep: current.progressStep || 0,
        progressTotal: boundedProgress(entity.progressTotal),
        instruction: ledgerInstruction({
          label: clean(object?.name || entity.label),
          state: current.state,
          owner: current.owner,
          quantity: current.quantity,
        }) + (current.hiddenWithOwner
          ? ` It remains with ${current.hiddenWithOwner} off-camera; do not invent a transfer, loss or duplicate.`
          : ""),
      };
    });
  }
  if (hiddenPossessedStates > 0) {
    console.info("[story-object-render-ledger] compiled", JSON.stringify({
      version: STORY_OBJECT_RENDER_LEDGER_VERSION,
      hiddenPossessedStates,
      sceneNumbers: [...hiddenSceneNumbers].sort((left, right) => left - right),
    }));
  }
  return scenario;
}

export function validateCausalGraph(scenario = {}) {
  const graph = scenario?.causalGraph;
  if (!graph) return [];
  if (![LEGACY_STORY_CAUSAL_GRAPH_VERSION, STORY_CAUSAL_GRAPH_VERSION].includes(Number(graph.version))) {
    return ["causal graph version is unsupported"];
  }
  const issues = [];
  const characterNames = new Set(values(scenario.characters, 30).map((character) => clean(character?.name)));
  const entityIds = new Set();
  for (const entity of values(graph.entities, 30)) {
    if (!entity.id) issues.push("causal graph entity id is required");
    else if (entityIds.has(entity.id)) issues.push(`causal entity ${entity.id} is declared more than once`);
    entityIds.add(entity.id);
    if (Number(graph.version) === STORY_CAUSAL_GRAPH_VERSION) {
      if (entity.spatialMode === "location_bound" && !clean(entity.homeLocation)) {
        issues.push(`causal entity ${entity.id} requires a home location while location_bound`);
      }
      if (entity.spatialMode === "location_bound" && Number(entity.initialQuantity) > 1) {
        issues.push(`causal entity ${entity.id} is location_bound and must have global quantity 1`);
      }
      if (boundedProgress(entity.initialProgress) > boundedProgress(entity.progressTotal)) {
        issues.push(`causal entity ${entity.id} initial progress exceeds its total`);
      }
      if (POSSESSION_STATES.has(entity.initialState) && !entity.initialOwnerCharacter) {
        issues.push(`causal entity ${entity.id} requires an initial character owner while ${entity.initialState}`);
      }
      if (entity.initialOwnerCharacter && !characterNames.has(entity.initialOwnerCharacter)) {
        issues.push(`causal entity ${entity.id} has unknown initial character owner`);
      }
      if (entity.initialState === "absent" && entity.initialQuantity !== 0) {
        issues.push(`causal entity ${entity.id} must have quantity 0 while absent`);
      }
      if (entity.initialState !== "absent" && !(Number.isInteger(entity.initialQuantity) && entity.initialQuantity > 0)) {
        issues.push(`causal entity ${entity.id} requires a positive initial quantity while present`);
      }
    }
  }
  const objectIds = new Set(values(scenario.objects, 30).map((object, index) => objectId(object, index)));
  for (const entityId of entityIds) {
    if (!objectIds.has(entityId)) issues.push(`causal entity ${entityId} has no tracked object`);
  }

  const eventIds = new Set();
  const ordered = values(graph.events, 80)
    .slice()
    .sort((left, right) => left.sceneNumber - right.sceneNumber || left.sequence - right.sequence);
  const terminalByEntity = new Map();
  const producerByResult = new Map();
  const edges = new Map();
  const currentStates = new Map(
    values(graph.entities, 30).map((entity) => [entity.id, entity.initialState]),
  );
  const progressByEntity = new Map(
    values(graph.entities, 30).map((entity) => [entity.id, boundedProgress(entity.initialProgress)]),
  );
  for (const event of ordered) {
    if (!event.id) issues.push("causal event id is required");
    else if (eventIds.has(event.id)) issues.push(`causal event ${event.id} is declared more than once`);
    eventIds.add(event.id);
    if (!event.structurallyValid) {
      issues.push(`scene-${event.sceneNumber || 0}: causal event ${event.id || "unknown"} has invalid references`);
      continue;
    }
    if (Number(graph.version) === STORY_CAUSAL_GRAPH_VERSION) {
      const entity = values(graph.entities, 30).find((candidate) => candidate.id === event.entityId);
      const resultEntity = values(graph.entities, 30).find((candidate) => candidate.id === event.resultEntityId);
      const previousProgress = progressByEntity.get(event.entityId) || 0;
      if (event.progressStep && !boundedProgress(entity?.progressTotal)) {
        issues.push(`scene-${event.sceneNumber}: causal event ${event.id} advances undeclared progress`);
      }
      if (event.progressStep && event.progressStep < previousProgress) {
        issues.push(`scene-${event.sceneNumber}: causal event ${event.id} cannot reverse progress`);
      }
      if (event.progressStep > boundedProgress(entity?.progressTotal)) {
        issues.push(`scene-${event.sceneNumber}: causal event ${event.id} progress exceeds its total`);
      }
      if (event.progressStep) progressByEntity.set(event.entityId, event.progressStep);
      if (POSSESSION_STATES.has(event.toState) && !event.toOwnerCharacter) {
        issues.push(`scene-${event.sceneNumber}: causal event ${event.id} requires a character owner while ${event.toState}`);
      }
      if (event.toOwnerCharacter && !characterNames.has(event.toOwnerCharacter)) {
        issues.push(`scene-${event.sceneNumber}: causal event ${event.id} has unknown character owner`);
      }
      if (event.resultOwnerCharacter && !characterNames.has(event.resultOwnerCharacter)) {
        issues.push(`scene-${event.sceneNumber}: causal event ${event.id} has unknown result character owner`);
      }
      if (event.toState === "absent" && event.toQuantity !== 0) {
        issues.push(`scene-${event.sceneNumber}: causal event ${event.id} must have quantity 0 while absent`);
      }
      if (event.toState !== "absent" && !(Number.isInteger(event.toQuantity) && event.toQuantity > 0)) {
        issues.push(`scene-${event.sceneNumber}: causal event ${event.id} requires a positive quantity while present`);
      }
      if (entity?.spatialMode === "location_bound" && Number(event.toQuantity) > 1) {
        issues.push(`scene-${event.sceneNumber}: causal event ${event.id} cannot duplicate location-bound entity ${entity.id}`);
      }
      if (event.resultEntityId && POSSESSION_STATES.has(event.resultState) && !event.resultOwnerCharacter) {
        issues.push(`scene-${event.sceneNumber}: causal event ${event.id} requires a result character owner while ${event.resultState}`);
      }
      if (event.resultEntityId && event.resultState === "absent" && event.resultQuantity !== 0) {
        issues.push(`scene-${event.sceneNumber}: causal event ${event.id} result must have quantity 0 while absent`);
      }
      if (event.resultEntityId && event.resultState !== "absent" && !(Number.isInteger(event.resultQuantity) && event.resultQuantity > 0)) {
        issues.push(`scene-${event.sceneNumber}: causal event ${event.id} requires a positive result quantity while present`);
      }
      if (resultEntity?.spatialMode === "location_bound" && Number(event.resultQuantity) > 1) {
        issues.push(`scene-${event.sceneNumber}: causal event ${event.id} cannot duplicate location-bound result ${resultEntity.id}`);
      }
    }
    const currentState = currentStates.get(event.entityId);
    if (event.fromState && currentState && event.fromState !== currentState) {
      issues.push(`scene-${event.sceneNumber}: causal event ${event.id} expects ${event.fromState} but ${event.entityId} is ${currentState}`);
    }
    if (event.type === "transform" && !event.resultEntityId) {
      issues.push(`scene-${event.sceneNumber}: transformation ${event.id} requires a distinct result entity`);
    }
    const terminal = terminalByEntity.get(event.entityId);
    if (terminal && event.sequence !== terminal.sequence) {
      issues.push(`scene-${event.sceneNumber}: causal entity ${event.entityId} reappears after terminal event ${terminal.id}`);
    }
    if (TERMINAL_TYPES.has(event.type) || TERMINAL_STATES.has(event.toState)) {
      if (terminal) {
        issues.push(`scene-${event.sceneNumber}: causal entity ${event.entityId} has more than one terminal outcome`);
      } else {
        terminalByEntity.set(event.entityId, event);
      }
    }
    if (event.resultEntityId) {
      if (event.resultEntityId === event.entityId) {
        issues.push(`scene-${event.sceneNumber}: causal transformation cannot replace an entity with itself`);
      }
      const producer = producerByResult.get(event.resultEntityId);
      if (producer) {
        issues.push(`scene-${event.sceneNumber}: causal entity ${event.resultEntityId} is produced more than once`);
      } else {
        producerByResult.set(event.resultEntityId, event);
      }
      if (!edges.has(event.entityId)) edges.set(event.entityId, new Set());
      edges.get(event.entityId).add(event.resultEntityId);
      currentStates.set(event.resultEntityId, event.resultState);
    }
    currentStates.set(event.entityId, event.toState);
  }

  for (const [resultId, producer] of producerByResult) {
    const entity = graph.entities.find((candidate) => candidate.id === resultId);
    if (entity?.initialState !== "absent") {
      issues.push(`scene-${producer.sceneNumber}: resulting entity ${resultId} must start absent`);
    }
    const premature = ordered.find((event) => (
      event.entityId === resultId
      && event.sceneNumber < producer.sceneNumber
      && event.toState !== "absent"
    ));
    if (premature) {
      issues.push(`scene-${premature.sceneNumber}: resulting entity ${resultId} appears before event ${producer.id}`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(entityId) {
    if (visiting.has(entityId)) return true;
    if (visited.has(entityId)) return false;
    visiting.add(entityId);
    for (const resultId of edges.get(entityId) || []) {
      if (visit(resultId)) return true;
    }
    visiting.delete(entityId);
    visited.add(entityId);
    return false;
  }
  for (const entityId of entityIds) {
    if (visit(entityId)) {
      issues.push("causal graph contains a transformation cycle");
      break;
    }
  }
  return [...new Set(issues)];
}
