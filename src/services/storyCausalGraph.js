export const STORY_CAUSAL_GRAPH_VERSION = 1;

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

export function normalizeCausalGraph(rawGraph = {}, objects = [], scenes = []) {
  if (Number(rawGraph?.version) !== STORY_CAUSAL_GRAPH_VERSION) return null;
  const sceneNumbers = new Set(scenes.map((scene) => Number(scene.sceneNumber)));
  const declared = objects.map((object, index) => ({
    id: objectId(object, index),
    label: clean(object.name),
    owner: clean(object.owner),
    initialState: STATES.has(object.initialState) ? object.initialState : "visible",
  }));
  const suppliedEntities = values(rawGraph.entities, 30);
  const entities = declared.map((entity) => {
    const supplied = suppliedEntities.find((item) => stableId(item?.id || item?.entity_id) === entity.id) || {};
    return {
      ...entity,
      label: clean(supplied.label || supplied.name) || entity.label,
      initialState: STATES.has(supplied.initial_state || supplied.initialState)
        ? clean(supplied.initial_state || supplied.initialState)
        : entity.initialState,
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
    return {
      id: stableId(item?.id || `event_${index + 1}`),
      sceneNumber,
      type,
      entityId,
      resultEntityId,
      fromState: STATES.has(fromState) ? fromState : "",
      toState: STATES.has(toState) ? toState : "",
      resultState: STATES.has(item?.result_state || item?.resultState)
        ? clean(item?.result_state || item?.resultState)
        : "visible",
      sequence: index + 1,
      structurallyValid: Boolean(
        sceneNumbers.has(sceneNumber)
        && EVENT_TYPES.has(type)
        && entityIds.has(entityId)
        && STATES.has(toState)
        && (!resultEntityId || entityIds.has(resultEntityId)),
      ),
    };
  });
  return {
    version: STORY_CAUSAL_GRAPH_VERSION,
    authority: "architect",
    entities,
    events,
  };
}

export function applyCausalGraph(input = {}) {
  const scenario = input;
  const graph = scenario?.causalGraph;
  if (Number(graph?.version) !== STORY_CAUSAL_GRAPH_VERSION) return scenario;
  const objects = values(scenario.objects, 30);
  const byId = new Map();
  for (const [index, object] of objects.entries()) {
    object.objectId = objectId(object, index);
    byId.set(object.objectId, object);
    const entity = graph.entities.find((candidate) => candidate.id === object.objectId);
    if (entity) object.initialState = entity.initialState;
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
    object.causalAuthority = "graph_v1";
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

export function validateCausalGraph(scenario = {}) {
  const graph = scenario?.causalGraph;
  if (!graph) return [];
  if (Number(graph.version) !== STORY_CAUSAL_GRAPH_VERSION) {
    return ["causal graph version is unsupported"];
  }
  const issues = [];
  const entityIds = new Set();
  for (const entity of values(graph.entities, 30)) {
    if (!entity.id) issues.push("causal graph entity id is required");
    else if (entityIds.has(entity.id)) issues.push(`causal entity ${entity.id} is declared more than once`);
    entityIds.add(entity.id);
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
  for (const event of ordered) {
    if (!event.id) issues.push("causal event id is required");
    else if (eventIds.has(event.id)) issues.push(`causal event ${event.id} is declared more than once`);
    eventIds.add(event.id);
    if (!event.structurallyValid) {
      issues.push(`scene-${event.sceneNumber || 0}: causal event ${event.id || "unknown"} has invalid references`);
      continue;
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
