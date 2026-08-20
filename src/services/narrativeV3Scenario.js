import { narrativeV3ConceptAgent } from "../agents/narrativeV3Concept.js";
import { createPagePlan } from "../config/bookStructure.js";
import { buildCanonicalStoryMechanics } from "../contracts/buildCanonicalStoryMechanics.js";
import { buildCharacterStateTimelineV1 } from "../contracts/characterStateTimelineV1.js";
import { buildWorldLawContractV1 } from "../contracts/worldLawContractV1.js";
import {
  canonicalDigest,
  compileCanonicalStoryGraph,
  parseStoryConceptWire,
} from "../contracts/narrativeV3Canonical.js";
import { compileNarrativeBookSpecV3 } from "../contracts/narrativeBookSpecV3.js";
import { compileObjectLifecycleProjection } from "../contracts/objectLifecycleProjection.js";
import { narrativeV3ArtifactStore } from "./narrativeV3ArtifactStore.js";
import { buildNarrativeV3ProjectSource } from "./narrativeV3ProductionShadow.js";
import {
  normalizeStoryScenario,
  scenarioCharacterRegistry,
  stabilizeStoryScenario,
  validateStoryScenario,
  withStoryScenarioAuditEvidence,
} from "./storyScenario.js";

export const NARRATIVE_V3_CUSTOMER_SCENARIO_VERSION = 1;
const MAX_SEMANTIC_ATTEMPTS = 2;

function artifactRef(artifact) {
  return {
    artifactId: artifact.id,
    artifactType: artifact.artifactType,
    payloadDigest: artifact.payloadDigest,
  };
}

function sameParents(artifact, parents) {
  return canonicalDigest(artifact?.parents || []) === canonicalDigest(parents || []);
}

async function persistArtifact({
  projectId,
  artifactType,
  payload,
  parents = [],
  artifactStore,
  operationId,
  runId,
}) {
  const currentPointer = await artifactStore.getCurrentPointer(projectId, artifactType);
  if (currentPointer) {
    const current = await artifactStore.getArtifact(currentPointer.artifactId);
    if (current?.payloadDigest === payload.validation.artifactDigest && sameParents(current, parents)) {
      return current;
    }
  }
  const created = await artifactStore.createArtifact({
    projectId,
    artifactType,
    payload,
    parents,
    provenance: {
      producer: "narrative_v3_customer_scenario",
      producerVersion: `v${NARRATIVE_V3_CUSTOMER_SCENARIO_VERSION}`,
      operationId,
      ...(runId ? { runId } : {}),
    },
  });
  const promotion = await artifactStore.promoteArtifact({
    projectId,
    artifactType,
    artifactId: created.artifact.id,
    expectedPointerRevision: Number(currentPointer?.pointerRevision || 0),
  });
  if (!promotion.promoted) {
    const winnerPointer = await artifactStore.getCurrentPointer(projectId, artifactType);
    const winner = winnerPointer ? await artifactStore.getArtifact(winnerPointer.artifactId) : null;
    if (winner?.payloadDigest === payload.validation.artifactDigest && sameParents(winner, parents)) {
      return winner;
    }
    const error = new Error("A concurrent Narrative V3 revision won the immutable pointer.");
    error.code = "narrative_v3_pointer_conflict";
    throw error;
  }
  return created.artifact;
}

function displayMaps(spec) {
  return {
    characters: new Map(spec.registries.characters.map((entry) => [entry.id, entry.displayName])),
    locations: new Map(spec.registries.locations.map((entry) => [entry.id, entry.name])),
    passages: new Map(spec.registries.passages.map((entry) => [entry.id, entry.name])),
  };
}

function legacyObjectState(state, names) {
  const object = names.objects.get(state.objectId);
  if (!object || Number(state.quantity || 0) < 1) return null;
  return {
    name: object.name,
    owner: names.characters.get(state.ownerCharacterId) || "",
    state: ["worn", "held", "carried", "stored", "visible", "consumed", "transformed", "destroyed"].includes(state.stateId)
      ? state.stateId
      : state.visible === true ? "visible" : "stored",
    quantity: Number(state.quantity || 1),
    instruction: state.visible === true
      ? `Exactly ${Number(state.quantity || 1)} visible instance(s).`
      : "This object is not visible in this scene.",
  };
}

function legacyScenarioInput(spec) {
  const maps = displayMaps(spec);
  maps.objects = new Map(spec.registries.objects.map((entry) => [entry.id, entry]));
  const crossingIndex = spec.scenes.findIndex((scene) => (
    scene.movements.some((movement) => movement.kind === "cross_passage")
  ));
  return {
    title: spec.title,
    summary: spec.premise,
    characters: spec.registries.characters.map((character) => ({
      name: character.displayName,
      role: character.role,
      story_role: character.role,
      initial_location: maps.locations.get(character.initialLocationId) || "",
    })),
    objects: spec.registries.objects.map((object) => ({
      object_id: object.id,
      name: object.name,
      owner: maps.characters.get(object.initialOwnerCharacterId) || "",
      initial_state: object.initialStateId || "visible",
      track_every_scene: true,
      spatial_mode: object.kind === "fixed" ? "location_bound" : "portable",
      home_location: maps.locations.get(object.initialLocationId) || "",
    })),
    scenes: spec.scenes.map((scene, index) => {
      const movement = scene.movements[0] || null;
      const discoversPassage = index === crossingIndex - 1 && spec.registries.passages.length > 0;
      const transitionKind = discoversPassage
        ? "discover_passage"
        : movement?.kind === "cross_passage"
          ? "cross_passage"
          : movement?.kind === "return_travel"
            ? "return_travel"
            : movement
              ? "ordinary_travel"
              : "none";
      const passage = movement?.passageId
        ? spec.registries.passages.find((entry) => entry.id === movement.passageId)
        : spec.registries.passages[0];
      const travelerIds = new Set((movement?.travelerCharacterIds || []));
      const presences = scene.presences.map((presence) => ({
        name: maps.characters.get(presence.characterId),
        mode: presence.mode,
        phase: travelerIds.has(presence.characterId) ? "end" : presence.phase,
        location: maps.locations.get(presence.locationId) || "",
      }));
      return {
        scene_number: scene.sceneNumber,
        title: scene.semantic.distinctiveImage,
        location_before: maps.locations.get(scene.timeline.locationBeforeId) || "",
        location_after: maps.locations.get(scene.timeline.locationAfterId) || "",
        action: scene.semantic.summary,
        purpose: scene.semantic.purpose,
        narrative_function: scene.semantic.purpose,
        dominant_emotion: scene.semantic.emotionalShift,
        emotional_shift: scene.semantic.emotionalShift,
        story_change: scene.semantic.summary,
        prerequisite_scene_ids: index ? [`scene-${scene.sceneNumber - 1}`] : [],
        character_presences: presences,
        transition: {
          kind: transitionKind,
          mechanism: passage?.name || "",
          mechanism_id: passage?.id || "",
          from: maps.locations.get(movement?.fromLocationId || scene.timeline.locationBeforeId) || "",
          to: maps.locations.get(movement?.toLocationId || scene.timeline.locationAfterId) || "",
          characters: (movement?.travelerCharacterIds || []).map((id) => maps.characters.get(id)).filter(Boolean),
        },
        character_movements: (scene.movements || []).map((entry) => ({
          sequence: entry.sequence,
          kind: entry.kind,
          characters: entry.travelerCharacterIds.map((id) => maps.characters.get(id)).filter(Boolean),
          from: maps.locations.get(entry.fromLocationId) || "",
          to: maps.locations.get(entry.toLocationId) || "",
          mechanism: maps.passages.get(entry.passageId) || "",
          mechanism_id: entry.passageId || "",
        })),
        object_states: scene.objectStates.map((state) => legacyObjectState(state, maps)).filter(Boolean),
        continuity_to_next: index < spec.scenes.length - 1
          ? maps.locations.get(scene.timeline.locationAfterId) || ""
          : "",
      };
    }),
    clarifications: [],
  };
}

export function projectNarrativeV3Scenario({ spec, normalized }) {
  const scenario = stabilizeStoryScenario(normalizeStoryScenario(legacyScenarioInput(spec), {
    pagePlan: createPagePlan(normalized.answers.page_count),
    canonicalCharacters: scenarioCharacterRegistry(normalized),
    creatorClarifications: {},
    worldContract: normalized.answers.universe_story_contract || {},
    language: normalized.answers.language,
    requireCausalGraph: false,
  }));
  const validation = validateStoryScenario(scenario);
  if (!validation.valid) {
    const error = new Error("The strict Narrative V3 graph could not be projected to the current creator review surface.");
    error.code = "narrative_v3_review_projection_invalid";
    error.scenarioValidation = validation;
    throw error;
  }
  return withStoryScenarioAuditEvidence(scenario);
}

function revisionRequest({ previousScenario, feedback, sceneEdits }) {
  if (!previousScenario && !feedback && !(sceneEdits || []).length) return null;
  return {
    previous_title: String(previousScenario?.title || "").slice(0, 160),
    previous_beats: (previousScenario?.scenes || []).map((scene) => ({
      scene_number: Number(scene.sceneNumber),
      summary: String(scene.action || "").slice(0, 600),
    })),
    feedback: String(feedback || "").slice(0, 2000),
    scene_edits: (sceneEdits || []).map((edit) => ({
      scene_number: Number(edit.sceneNumber || edit.scene_number),
      title: String(edit.title || "").slice(0, 160),
      location: String(edit.location || "").slice(0, 200),
      action: String(edit.action || "").slice(0, 600),
    })),
  };
}

export async function generateNarrativeV3Scenario({
  project,
  normalized,
  previousScenario = null,
  feedback = "",
  sceneEdits = [],
  onStep = async () => {},
  backgroundExecution = null,
  runId = "",
  artifactStore = narrativeV3ArtifactStore,
  conceptAgent = narrativeV3ConceptAgent,
} = {}) {
  const source = buildNarrativeV3ProjectSource(project);
  const revision = revisionRequest({ previousScenario, feedback, sceneEdits });
  const semanticSource = revision
    ? { ...source.semanticSource, revisionRequest: revision }
    : source.semanticSource;

  let concept;
  let mechanics;
  let characterStateTimeline;
  const worldLaw = buildWorldLawContractV1(source.intent);
  let validationFeedback = null;
  for (let attempt = 1; attempt <= MAX_SEMANTIC_ATTEMPTS; attempt += 1) {
    const checkpointKey = attempt === 1 ? "v3:story-concept" : "v3:story-concept-correction";
    await onStep({ phase: attempt === 1 ? "v3-concept" : "v3-concept-correction", attempt });
    const wire = await conceptAgent(validationFeedback
      ? { ...semanticSource, validationFeedback }
      : semanticSource, {
      backgroundExecution: backgroundExecution ? {
        getCheckpoint: () => backgroundExecution.getCheckpoint(checkpointKey),
        saveCheckpoint: (checkpoint) => backgroundExecution.saveCheckpoint(checkpointKey, checkpoint),
      } : null,
    });
    try {
      concept = parseStoryConceptWire(wire);
      characterStateTimeline = buildCharacterStateTimelineV1({ creationIntent: source.intent, visualIntent: source.visualIntent, concept, worldLaw });
      mechanics = buildCanonicalStoryMechanics({ intent: source.intent, concept, visualIntent: source.visualIntent, characterStateTimeline, worldLaw });
      break;
    } catch (error) {
      if (attempt >= MAX_SEMANTIC_ATTEMPTS) throw error;
      validationFeedback = {
        code: String(error?.code || "semantic_contract_invalid").slice(0, 120),
        issues: (Array.isArray(error?.issues) ? error.issues : [{ message: error?.message }])
          .slice(0, 12)
          .map((issue) => ({
            path: String(issue?.path || "$").slice(0, 200),
            message: String(issue?.message || "The semantic contract is invalid.").slice(0, 500),
          })),
      };
    }
  }
  await onStep({ phase: "v3-compile", attempt: 1 });
  const graph = compileCanonicalStoryGraph({ concept, mechanics });
  const projection = compileObjectLifecycleProjection({ graph });
  const spec = compileNarrativeBookSpecV3({
    intent: source.intent,
    graph,
    objectProjection: projection,
    profileBindings: source.profileBindings,
  });

  const intentArtifact = await persistArtifact({
    projectId: project.id, artifactType: "creation_intent", payload: source.intent,
    artifactStore, operationId: "seal_intent", runId,
  });
  const visualIntentArtifact = await persistArtifact({
    projectId: project.id, artifactType: "visual_intent", payload: source.visualIntent,
    parents: [artifactRef(intentArtifact)], artifactStore, operationId: "seal_visual_intent", runId,
  });
  const worldLawArtifact = await persistArtifact({
    projectId: project.id, artifactType: "world_law_contract", payload: worldLaw,
    parents: [artifactRef(intentArtifact)], artifactStore, operationId: "compile_world_law_contract", runId,
  });
  const conceptArtifact = await persistArtifact({
    projectId: project.id, artifactType: "story_concept", payload: concept,
    parents: [artifactRef(intentArtifact)], artifactStore, operationId: "parse_story_concept", runId,
  });
  const characterStateArtifact = await persistArtifact({
    projectId: project.id, artifactType: "character_state_timeline", payload: characterStateTimeline,
    parents: [artifactRef(visualIntentArtifact), artifactRef(conceptArtifact), artifactRef(worldLawArtifact)], artifactStore,
    operationId: "compile_character_state_timeline", runId,
  });
  const graphArtifact = await persistArtifact({
    projectId: project.id, artifactType: "canonical_story_graph", payload: graph,
    parents: [artifactRef(conceptArtifact), artifactRef(characterStateArtifact)], artifactStore, operationId: "compile_story_graph", runId,
  });
  const projectionArtifact = await persistArtifact({
    projectId: project.id, artifactType: "object_lifecycle_projection", payload: projection,
    parents: [artifactRef(graphArtifact)], artifactStore, operationId: "compile_object_lifecycle", runId,
  });
  const specArtifact = await persistArtifact({
    projectId: project.id, artifactType: "narrative_book_spec_v3", payload: spec,
    parents: [artifactRef(intentArtifact), artifactRef(graphArtifact), artifactRef(projectionArtifact)],
    artifactStore, operationId: "release_narrative_book_spec_v3", runId,
  });
  const scenario = projectNarrativeV3Scenario({ spec, normalized });
  return {
    scenario,
    validation: { valid: true, issues: [], diagnostics: [] },
    canonicalCandidateEvidence: {
      version: 3,
      status: "compiled",
      artifactDigest: spec.validation.artifactDigest,
      artifactId: specArtifact.id,
      graphDigest: graph.validation.artifactDigest,
      conceptDigest: concept.validation.artifactDigest,
    },
    narrativeV3Artifacts: {
      spec,
      visualIntent: source.visualIntent,
      visualIntentArtifactId: visualIntentArtifact.id,
      characterStateTimeline,
      characterStateTimelineArtifactId: characterStateArtifact.id,
      worldLaw,
      worldLawArtifactId: worldLawArtifact.id,
    },
  };
}
