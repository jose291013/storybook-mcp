import { compileNarrativeBookSpecV2 } from "./narrativeBookSpecV2.js";
import { loadCreationIntent } from "./creationIntent.js";
import {
  canonicalDigest,
  canonicalStoryGraphDigest,
  loadCanonicalStoryGraph,
} from "./narrativeV3Canonical.js";
import { loadObjectLifecycleProjection } from "./objectLifecycleProjection.js";
import {
  assertNarrativeV3Schema,
  NarrativeV3ContractError,
} from "./narrativeV3SchemaRegistry.js";

export const NARRATIVE_BOOK_SPEC_V3_VERSION = 3;
export const NARRATIVE_BOOK_SPEC_V3_ID = "calitiki.narrative-book-spec.v3";
export const NARRATIVE_BOOK_SPEC_V3_COMPILER_VERSION = 3;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function releaseError(code, path, message) {
  throw new NarrativeV3ContractError({
    code,
    artifactType: "narrative_book_spec_v3",
    issues: [{ path, message }],
  });
}

function digestProjection(value) {
  const projection = structuredClone(value);
  if (projection.validation) delete projection.validation.artifactDigest;
  return projection;
}

export function narrativeBookSpecV3Digest(spec) {
  return canonicalDigest(digestProjection(spec));
}

function objectlessGraph(graph) {
  const copy = structuredClone(graph);
  copy.registries.objects = [];
  copy.scenes.forEach((scene) => {
    scene.objectEvents = [];
  });
  copy.validation.artifactDigest = canonicalStoryGraphDigest(copy);
  return copy;
}

function assertProjectionMatchesGraph(graph, projection) {
  if (projection.sourceGraph.artifactDigest !== graph.validation.artifactDigest) {
    releaseError("release_object_projection_graph_mismatch", "/sources/objectLifecycleProjection", "The object projection does not descend from the exact released graph.");
  }
  if (projection.objects.length !== graph.registries.objects.length) {
    releaseError("release_object_registry_mismatch", "/registries/objects", "The graph and object projection must contain the same object registry.");
  }
  projection.objects.forEach((object, index) => {
    const source = graph.registries.objects[index];
    if (!source || source.id !== object.id || source.name !== object.name || source.kind !== object.kind) {
      releaseError("release_object_registry_mismatch", `/registries/objects/${index}`, "Projected objects must preserve the exact canonical registry order and identity.");
    }
  });
  if (projection.scenes.length !== graph.scenes.length) {
    releaseError("release_object_scene_count_mismatch", "/scenes", "Every canonical scene needs exactly one object-state projection.");
  }
  projection.scenes.forEach((sceneProjection, index) => {
    const scene = graph.scenes[index];
    if (
      sceneProjection.sceneNumber !== scene.sceneNumber
      || sceneProjection.sourceSceneDigest !== canonicalDigest(scene)
      || sceneProjection.eventDigest !== canonicalDigest(scene.objectEvents)
    ) {
      releaseError("release_object_scene_binding_mismatch", `/scenes/${index}`, "The object-state projection is not bound to this exact canonical scene and event list.");
    }
    const projectedIds = sceneProjection.states.map((entry) => entry.objectId);
    const registryIds = projection.objects.map((entry) => entry.id);
    if (canonicalDigest(projectedIds) !== canonicalDigest(registryIds)) {
      releaseError("release_object_state_cardinality_mismatch", `/scenes/${index}/objectStates`, "Every scene must project every released object exactly once and in registry order.");
    }
  });
}

function assertReleaseInvariants(spec) {
  const objectIds = spec.registries.objects.map((entry) => entry.id);
  if (new Set(objectIds).size !== objectIds.length) {
    releaseError("release_object_duplicate", "/registries/objects", "Released object ids must be unique.");
  }
  spec.scenes.forEach((scene, index) => {
    if (scene.objectEventDigest !== canonicalDigest(scene.objectEvents)) {
      releaseError("release_object_event_digest_mismatch", `/scenes/${index}/objectEventDigest`, "The released object-event digest is stale.");
    }
    if (scene.objectStateDigest !== canonicalDigest(scene.objectStates)) {
      releaseError("release_object_state_digest_mismatch", `/scenes/${index}/objectStateDigest`, "The released object-state digest is stale.");
    }
    if (canonicalDigest(scene.objectStates.map((entry) => entry.objectId)) !== canonicalDigest(objectIds)) {
      releaseError("release_object_state_cardinality_mismatch", `/scenes/${index}/objectStates`, "Every scene must carry the complete released object registry in exact order.");
    }
    if (scene.illustrationInstant.objectStateDigest !== scene.objectStateDigest) {
      releaseError("release_illustration_object_binding_mismatch", `/scenes/${index}/illustrationInstant/objectStateDigest`, "The illustration instant must point to the exact released object state.");
    }
    if (Number(spec.validation?.compilerVersion || 1) >= 2) {
      if (!scene.physicalState || !scene.illustrationInstant.physicalState) {
        releaseError("release_physical_state_missing", `/scenes/${index}/physicalState`, "Every new V3 scene must seal its exact world-law state before release.");
      }
      if (canonicalDigest(scene.physicalState) !== canonicalDigest(scene.illustrationInstant.physicalState)) {
        releaseError("release_physical_state_binding_mismatch", `/scenes/${index}/illustrationInstant/physicalState`, "The illustration instant must use the scene's exact sealed physical state.");
      }
      if (scene.illustrationInstant.physicalMediumId !== scene.physicalState.mediumId) {
        releaseError("release_physical_medium_mismatch", `/scenes/${index}/illustrationInstant/physicalMediumId`, "Released medium and world-law state must describe the same instant.");
      }
    }
    if (Number(spec.validation?.compilerVersion || 1) >= 3 && !Array.isArray(scene.illustrationInstant.requiredElements)) {
      releaseError("release_visual_proofs_missing", `/scenes/${index}/illustrationInstant/requiredElements`, "Every new V3 illustration instant must carry its deterministic visual proofs.");
    }
  });
}

export function compileNarrativeBookSpecV3({
  intent: rawIntent,
  graph: rawGraph,
  objectProjection: rawProjection,
  profileBindings,
  revision = 1,
} = {}) {
  const intent = loadCreationIntent(rawIntent);
  const graph = loadCanonicalStoryGraph(rawGraph);
  const objectProjection = loadObjectLifecycleProjection(rawProjection);
  assertProjectionMatchesGraph(graph, objectProjection);
  const physicalSceneCount = graph.scenes.filter((scene) => scene.physicalState).length;
  if (physicalSceneCount > 0 && physicalSceneCount !== graph.scenes.length) {
    releaseError("release_physical_state_partial", "/scenes", "A physical chronology must cover every released scene or none of them.");
  }
  const usesPhysicalChronology = physicalSceneCount === graph.scenes.length;

  // V2 remains immutable. Its compiler is reused only for deterministic layout,
  // identity binding and universe-medium resolution on a transient objectless view.
  const base = structuredClone(compileNarrativeBookSpecV2({
    intent,
    graph: objectlessGraph(graph),
    profileBindings,
    revision,
  }));
  base.schemaVersion = NARRATIVE_BOOK_SPEC_V3_VERSION;
  base.contractId = NARRATIVE_BOOK_SPEC_V3_ID;
  base.sources.canonicalStoryGraph = {
    contractId: graph.contractId,
    schemaVersion: graph.schemaVersion,
    artifactDigest: graph.validation.artifactDigest,
  };
  base.sources.objectLifecycleProjection = {
    contractId: objectProjection.contractId,
    schemaVersion: objectProjection.schemaVersion,
    artifactDigest: objectProjection.validation.artifactDigest,
  };
  base.registries.objects = structuredClone(objectProjection.objects);
  base.scenes.forEach((releasedScene, index) => {
    const sourceScene = graph.scenes[index];
    const projectedScene = objectProjection.scenes[index];
    releasedScene.sourceSceneDigest = canonicalDigest(sourceScene);
    releasedScene.objectEvents = structuredClone(sourceScene.objectEvents);
    releasedScene.objectEventDigest = projectedScene.eventDigest;
    releasedScene.objectStates = structuredClone(projectedScene.states);
    releasedScene.objectStateDigest = canonicalDigest(projectedScene.states);
    if (usesPhysicalChronology) {
      releasedScene.physicalState = structuredClone(sourceScene.physicalState);
      releasedScene.illustrationInstant.physicalMediumId = sourceScene.physicalState.mediumId;
      releasedScene.illustrationInstant.physicalState = structuredClone(sourceScene.physicalState);
    }
    releasedScene.illustrationInstant.requiredElements = structuredClone(sourceScene.illustration.requiredElements || []);
    releasedScene.illustrationInstant.objectEvents = structuredClone(sourceScene.objectEvents);
    releasedScene.illustrationInstant.objectStateDigest = releasedScene.objectStateDigest;
  });
  base.pages.forEach((page) => {
    if (!page.sceneNumber) return;
    page.sourceSceneDigest = base.scenes[page.sceneNumber - 1].sourceSceneDigest;
  });
  base.validation = {
    compilerVersion: usesPhysicalChronology ? NARRATIVE_BOOK_SPEC_V3_COMPILER_VERSION : 1,
    artifactDigest: "",
  };
  base.validation.artifactDigest = narrativeBookSpecV3Digest(base);
  assertNarrativeV3Schema("narrative_book_spec_v3", base);
  assertReleaseInvariants(base);
  return deepFreeze(structuredClone(base));
}

export function loadNarrativeBookSpecV3(value) {
  assertNarrativeV3Schema("narrative_book_spec_v3", value);
  assertReleaseInvariants(value);
  const expected = narrativeBookSpecV3Digest(value);
  if (value.validation.artifactDigest !== expected) {
    releaseError("release_spec_digest_mismatch", "/validation/artifactDigest", "The digest does not belong to this exact released spec.");
  }
  return deepFreeze(structuredClone(value));
}
