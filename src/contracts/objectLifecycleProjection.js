import {
  canonicalDigest,
  loadCanonicalStoryGraph,
} from "./narrativeV3Canonical.js";
import {
  assertNarrativeV3Schema,
  NarrativeV3ContractError,
} from "./narrativeV3SchemaRegistry.js";

export const OBJECT_LIFECYCLE_PROJECTION_VERSION = 1;
export const OBJECT_LIFECYCLE_PROJECTION_ID = "calitiki.object-lifecycle-projection.v1";
export const OBJECT_LIFECYCLE_COMPILER_VERSION = 1;

function lifecycleError(code, path, message) {
  throw new NarrativeV3ContractError({
    code,
    artifactType: "object_lifecycle_projection",
    issues: [{ path, message }],
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function digestProjection(value) {
  const projection = structuredClone(value);
  if (projection.validation) delete projection.validation.artifactDigest;
  return projection;
}

export function objectLifecycleProjectionDigest(value) {
  return canonicalDigest(digestProjection(value));
}

function visibleLocation(scene) {
  if (scene.timeline.visiblePhase === "start") return scene.timeline.locationBeforeId;
  if (scene.timeline.visiblePhase === "end") return scene.timeline.locationAfterId;
  if (scene.timeline.locationBeforeId === scene.timeline.locationAfterId) return scene.timeline.locationAfterId;
  lifecycleError(
    "object_event_phase_ambiguous",
    `/scenes/${scene.sceneNumber - 1}/timeline/visiblePhase`,
    "An object-bearing travel scene needs a start or end illustration instant.",
  );
}

function characterTimeline(graph) {
  const current = new Map(graph.registries.characters.map((character) => [character.id, character.initialLocationId]));
  return graph.scenes.map((scene) => {
    const start = new Map(current);
    [...scene.movements].sort((left, right) => left.sequence - right.sequence).forEach((movement) => {
      movement.travelerCharacterIds.forEach((characterId) => current.set(characterId, movement.toLocationId));
    });
    return { start, end: new Map(current) };
  });
}

function characterLocationAtInstant(scene, timeline, characterId) {
  if (scene.timeline.visiblePhase === "start") return timeline.start.get(characterId);
  return timeline.end.get(characterId);
}

function orderedObjectEvents(graph, objectId) {
  return graph.scenes.flatMap((scene) => scene.objectEvents
    .filter((event) => event.objectId === objectId)
    .map((event) => ({ scene, event })))
    .sort((left, right) => left.scene.sceneNumber - right.scene.sceneNumber || left.event.sequence - right.event.sequence);
}

function assertEventSequence(scene) {
  const sequences = scene.objectEvents.map((event) => event.sequence).sort((left, right) => left - right);
  if (sequences.some((sequence, index) => sequence !== index + 1)) {
    lifecycleError(
      "object_event_sequence_invalid",
      `/scenes/${scene.sceneNumber - 1}/objectEvents`,
      "Object events must have one contiguous scene-local sequence.",
    );
  }
}

function initialStateFor({ object, first, timeline }) {
  if (!first) {
    lifecycleError(
      "object_event_required",
      `/registries/objects/${object.id}`,
      "Every plot-critical object needs at least one causal event.",
    );
  }
  const ownerCharacterId = first.event.fromOwnerCharacterId || null;
  const locationId = ownerCharacterId
    ? timeline[first.scene.sceneNumber - 1].start.get(ownerCharacterId)
    : visibleLocation(first.scene);
  return {
    objectId: object.id,
    stateId: first.event.fromState,
    quantity: 1,
    ownerCharacterId,
    locationId,
    visibility: "forbidden",
    visibilityReason: "not_introduced",
  };
}

function applyEvent({ object, state, event, eventLocation, path }) {
  if (state.quantity === 0) lifecycleError("object_event_after_terminal", path, "A consumed object cannot receive another event.");
  if (state.stateId !== event.fromState) lifecycleError("object_state_discontinuity", path, "The event from-state does not equal the prior canonical state.");
  if (event.fromOwnerCharacterId && state.ownerCharacterId !== event.fromOwnerCharacterId) {
    lifecycleError("object_owner_discontinuity", path, "The event from-owner does not own the object.");
  }
  if (object.kind === "fixture" && state.locationId !== eventLocation) {
    lifecycleError("object_fixture_location_changed", path, "A fixed object cannot move to another canonical location.");
  }
  let ownerCharacterId = state.ownerCharacterId;
  if (event.kind === "acquire") {
    if (ownerCharacterId || event.fromOwnerCharacterId || !event.toOwnerCharacterId) lifecycleError("object_acquire_invalid", path, "Acquisition requires one unowned object and one explicit destination owner.");
    ownerCharacterId = event.toOwnerCharacterId;
  } else if (event.kind === "release") {
    if (!ownerCharacterId || event.fromOwnerCharacterId !== ownerCharacterId || event.toOwnerCharacterId) lifecycleError("object_release_invalid", path, "Release requires the explicit current owner and no destination owner.");
    ownerCharacterId = null;
  } else if (event.toOwnerCharacterId) {
    if (ownerCharacterId && event.fromOwnerCharacterId !== ownerCharacterId) lifecycleError("object_owner_transition_implicit", path, "An ownership transfer must name its exact prior owner.");
    ownerCharacterId = event.toOwnerCharacterId;
  }
  if (event.kind === "consume" && ownerCharacterId && event.fromOwnerCharacterId !== ownerCharacterId) {
    lifecycleError("object_consume_owner_implicit", path, "Consumption of an owned object must name its exact owner.");
  }
  const consumed = event.kind === "consume";
  return {
    ...state,
    stateId: event.toState,
    quantity: consumed ? 0 : 1,
    ownerCharacterId: consumed ? null : ownerCharacterId,
    locationId: consumed ? null : eventLocation,
  };
}

function renderState({ state, scene, timeline, eventApplied, introduced }) {
  if (!introduced) return { ...state, visibility: "forbidden", visibilityReason: "not_introduced" };
  if (state.quantity === 0) return { ...state, visibility: "forbidden", visibilityReason: "consumed" };
  const focalLocation = visibleLocation(scene);
  if (state.ownerCharacterId) {
    const ownerLocation = characterLocationAtInstant(scene, timeline, state.ownerCharacterId);
    const ownerVisible = scene.illustration.visibleCharacterIds.includes(state.ownerCharacterId);
    const located = { ...state, locationId: ownerLocation };
    if (ownerVisible && ownerLocation === focalLocation) {
      return { ...located, visibility: "required", visibilityReason: eventApplied ? "event_scene" : "visible_owner" };
    }
    return { ...located, visibility: "forbidden", visibilityReason: "owner_off_camera" };
  }
  if (state.locationId === focalLocation) {
    return { ...state, visibility: "required", visibilityReason: eventApplied ? "event_scene" : "fixture_at_location" };
  }
  return { ...state, visibility: "forbidden", visibilityReason: "different_location" };
}

export function compileObjectLifecycleProjection({ graph: rawGraph, revision = 1 } = {}) {
  const graph = loadCanonicalStoryGraph(rawGraph);
  if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 1) {
    lifecycleError("object_projection_revision_invalid", "/revision", "A positive projection revision is required.");
  }
  graph.scenes.forEach(assertEventSequence);
  const timeline = characterTimeline(graph);
  const states = new Map();
  const introduced = new Set();
  const objects = graph.registries.objects.map((object) => {
    const [first] = orderedObjectEvents(graph, object.id);
    const initialState = initialStateFor({ object, first, timeline });
    states.set(object.id, initialState);
    return { ...structuredClone(object), initialState };
  });
  const sceneProjections = graph.scenes.map((scene, sceneIndex) => {
    const eventIds = new Set();
    const applied = new Set();
    for (const event of [...scene.objectEvents].sort((left, right) => left.sequence - right.sequence)) {
      if (eventIds.has(event.objectId)) {
        lifecycleError("object_event_scene_duplicate", `/scenes/${sceneIndex}/objectEvents`, "One object may change at most once in one scene.");
      }
      eventIds.add(event.objectId);
      const object = graph.registries.objects.find((entry) => entry.id === event.objectId);
      const path = `/scenes/${sceneIndex}/objectEvents/${event.sequence - 1}`;
      const current = states.get(event.objectId);
      const eventLocation = visibleLocation(scene);
      for (const ownerId of [event.fromOwnerCharacterId, event.toOwnerCharacterId].filter(Boolean)) {
        const ownerLocation = characterLocationAtInstant(scene, timeline[sceneIndex], ownerId);
        if (!scene.illustration.visibleCharacterIds.includes(ownerId) || ownerLocation !== eventLocation) {
          lifecycleError("object_event_owner_not_visible", path, "Every owner participating in an object event must be physically visible at the event location.");
        }
      }
      states.set(event.objectId, applyEvent({ object, state: current, event, eventLocation, path }));
      introduced.add(event.objectId);
      applied.add(event.objectId);
    }
    const snapshots = graph.registries.objects.map((object) => {
      const rendered = renderState({
        state: states.get(object.id),
        scene,
        timeline: timeline[sceneIndex],
        eventApplied: applied.has(object.id),
        introduced: introduced.has(object.id),
      });
      states.set(object.id, { ...rendered, visibility: "forbidden", visibilityReason: rendered.visibilityReason });
      return rendered;
    });
    return {
      sceneNumber: scene.sceneNumber,
      sourceSceneDigest: canonicalDigest(scene),
      eventDigest: canonicalDigest(scene.objectEvents),
      states: snapshots,
    };
  });
  const projection = {
    schemaVersion: OBJECT_LIFECYCLE_PROJECTION_VERSION,
    contractId: OBJECT_LIFECYCLE_PROJECTION_ID,
    revision: Number(revision),
    sourceGraph: {
      contractId: graph.contractId,
      schemaVersion: graph.schemaVersion,
      artifactDigest: graph.validation.artifactDigest,
    },
    objects,
    scenes: sceneProjections,
    validation: {
      compilerVersion: OBJECT_LIFECYCLE_COMPILER_VERSION,
      artifactDigest: "0".repeat(64),
    },
  };
  projection.validation.artifactDigest = objectLifecycleProjectionDigest(projection);
  assertNarrativeV3Schema("object_lifecycle_projection", projection);
  return deepFreeze(structuredClone(projection));
}

export function loadObjectLifecycleProjection(value) {
  assertNarrativeV3Schema("object_lifecycle_projection", value);
  if (value.validation.artifactDigest !== objectLifecycleProjectionDigest(value)) {
    lifecycleError("object_projection_digest_mismatch", "/validation/artifactDigest", "The projection digest does not belong to this exact payload.");
  }
  const objectIds = value.objects.map((object) => object.id);
  if (new Set(objectIds).size !== objectIds.length) lifecycleError("object_projection_duplicate", "/objects", "Projected object ids must be unique.");
  value.scenes.forEach((scene, index) => {
    if (scene.sceneNumber !== index + 1) lifecycleError("object_projection_scene_sequence", `/scenes/${index}`, "Projected scenes must be contiguous.");
    if (scene.states.length !== objectIds.length || scene.states.some((state, stateIndex) => state.objectId !== objectIds[stateIndex])) {
      lifecycleError("object_projection_state_cardinality", `/scenes/${index}/states`, "Every scene must project every object exactly once in registry order.");
    }
  });
  return deepFreeze(structuredClone(value));
}
