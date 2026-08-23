import crypto from "node:crypto";

import {
  assertNarrativeV3Schema,
  NarrativeV3ContractError,
} from "./narrativeV3SchemaRegistry.js";

export { NarrativeV3ContractError } from "./narrativeV3SchemaRegistry.js";

export const STORY_CONCEPT_WIRE_VERSION = 1;
export const STORY_CONCEPT_WIRE_ID = "calitiki.story-concept-wire.v1";
export const STORY_CONCEPT_VERSION = 1;
export const STORY_CONCEPT_ID = "calitiki.story-concept.v1";
export const STORY_CONCEPT_PARSER_VERSION = 1;
export const CANONICAL_STORY_GRAPH_VERSION = 1;
export const CANONICAL_STORY_GRAPH_ID = "calitiki.canonical-story-graph.v1";
export const CANONICAL_STORY_GRAPH_COMPILER_VERSION = 3;

function canonicalValue(value, ancestors = new WeakSet(), path = "$") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new NarrativeV3ContractError({
        code: "narrative_v3_non_json_value",
        artifactType: "canonical_json",
        issues: [{ path, message: "Numbers must be finite." }],
      });
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new NarrativeV3ContractError({
        code: "narrative_v3_cyclic_value",
        artifactType: "canonical_json",
        issues: [{ path, message: "Cyclic arrays are forbidden." }],
      });
    }
    ancestors.add(value);
    const result = value.map((entry, index) => canonicalValue(entry, ancestors, `${path}[${index}]`));
    ancestors.delete(value);
    return result;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    if (ancestors.has(value)) {
      throw new NarrativeV3ContractError({
        code: "narrative_v3_cyclic_value",
        artifactType: "canonical_json",
        issues: [{ path, message: "Cyclic objects are forbidden." }],
      });
    }
    ancestors.add(value);
    const result = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) {
        throw new NarrativeV3ContractError({
          code: "narrative_v3_non_json_value",
          artifactType: "canonical_json",
          issues: [{ path: `${path}.${key}`, message: "Undefined values are forbidden." }],
        });
      }
      result[key] = canonicalValue(value[key], ancestors, `${path}.${key}`);
    }
    ancestors.delete(value);
    return result;
  }
  throw new NarrativeV3ContractError({
    code: "narrative_v3_non_json_value",
    artifactType: "canonical_json",
    issues: [{ path, message: `Unsupported JSON value type ${typeof value}.` }],
  });
}

export function canonicalSerialize(value) {
  return JSON.stringify(canonicalValue(value));
}

export function canonicalDigest(value) {
  return crypto.createHash("sha256").update(canonicalSerialize(value)).digest("hex");
}

function digestProjection(value) {
  const projection = structuredClone(value);
  if (projection.validation) delete projection.validation.artifactDigest;
  return projection;
}

export function storyConceptDigest(concept) {
  return canonicalDigest(digestProjection(concept));
}

export function canonicalStoryGraphDigest(graph) {
  return canonicalDigest(digestProjection(graph));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value)) deepFreeze(entry);
  return value;
}

function unique(values) {
  return new Set(values).size === values.length;
}

function assertUniqueBeatKeys(concept) {
  const keys = concept.beats.map((beat) => beat.beatKey);
  if (!unique(keys)) {
    throw new NarrativeV3ContractError({
      code: "story_concept_duplicate_beat_key",
      artifactType: "story_concept",
      issues: [{ path: "/beats", message: "Every semantic beat key must be unique." }],
    });
  }
}

export function parseStoryConceptWire(wireValue) {
  assertNarrativeV3Schema("story_concept_wire", wireValue);
  const concept = {
    schemaVersion: STORY_CONCEPT_VERSION,
    contractId: STORY_CONCEPT_ID,
    language: wireValue.language,
    title: wireValue.title,
    premise: wireValue.premise,
    themeProof: wireValue.theme_proof,
    heroArc: {
      desire: wireValue.hero_arc.desire,
      initialDoubt: wireValue.hero_arc.initial_doubt,
      decisiveChoice: wireValue.hero_arc.decisive_choice,
      earnedChange: wireValue.hero_arc.earned_change,
    },
    beats: wireValue.beats.map((beat) => ({
      beatKey: beat.beat_key,
      purpose: beat.purpose,
      ...(beat.journey_phase ? { journeyPhase: beat.journey_phase } : {}),
      summary: beat.summary,
      emotionalShift: beat.emotional_shift,
      distinctiveImage: beat.distinctive_image,
      participantKeys: [...beat.participant_keys],
    })),
  };
  assertUniqueBeatKeys(concept);
  concept.validation = {
    parserVersion: STORY_CONCEPT_PARSER_VERSION,
    artifactDigest: "",
  };
  concept.validation.artifactDigest = storyConceptDigest(concept);
  assertNarrativeV3Schema("story_concept", concept);
  return deepFreeze(structuredClone(concept));
}

export function loadStoryConcept(canonicalValue) {
  assertNarrativeV3Schema("story_concept", canonicalValue);
  assertUniqueBeatKeys(canonicalValue);
  const expectedDigest = storyConceptDigest(canonicalValue);
  if (canonicalValue.validation.artifactDigest !== expectedDigest) {
    throw new NarrativeV3ContractError({
      code: "story_concept_digest_mismatch",
      artifactType: "story_concept",
      issues: [{ path: "/validation/artifactDigest", message: "The digest does not belong to this exact StoryConcept." }],
    });
  }
  return deepFreeze(structuredClone(canonicalValue));
}

function duplicateIds(entries = []) {
  const ids = entries.map((entry) => entry.id);
  return ids.filter((id, index) => ids.indexOf(id) !== index);
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((entry) => right.has(entry));
}

function graphIssue(issues, code, path, message) {
  issues.push({ code, path, message });
}

export function validateCanonicalStoryGraph(graph, { verifyDigest = true } = {}) {
  const issues = [];
  try {
    assertNarrativeV3Schema("canonical_story_graph", graph);
  } catch (error) {
    if (error instanceof NarrativeV3ContractError) {
      return { valid: false, issues: error.issues, digest: null };
    }
    throw error;
  }

  const characters = graph.registries.characters;
  const locations = graph.registries.locations;
  const objects = graph.registries.objects;
  const passages = graph.registries.passages;
  const characterIds = new Set(characters.map((entry) => entry.id));
  const semanticKeys = new Set(characters.map((entry) => entry.semanticKey));
  const locationIds = new Set(locations.map((entry) => entry.id));
  const objectIds = new Set(objects.map((entry) => entry.id));
  const passageIds = new Set(passages.map((entry) => entry.id));
  const characterLocations = new Map(characters.map((entry) => [entry.id, entry.initialLocationId]));

  for (const [registry, entries] of Object.entries({ characters, locations, objects, passages })) {
    for (const duplicate of new Set(duplicateIds(entries))) {
      graphIssue(issues, "duplicate_registry_id", `/registries/${registry}`, `${duplicate} is declared more than once.`);
    }
  }
  if (!unique(characters.map((entry) => entry.semanticKey))) {
    graphIssue(issues, "duplicate_character_semantic_key", "/registries/characters", "Character semantic keys must be unique.");
  }
  for (const character of characters) {
    if (!locationIds.has(character.initialLocationId)) {
      graphIssue(issues, "unknown_character_initial_location", `/registries/characters/${character.id}`, "Every character needs one canonical initial location.");
    }
  }
  for (const passage of passages) {
    if (!locationIds.has(passage.sideALocationId) || !locationIds.has(passage.sideBLocationId)) {
      graphIssue(issues, "unknown_passage_endpoint", `/registries/passages/${passage.id}`, "Passage endpoints must be canonical locations.");
    }
  }

  const sceneIds = graph.scenes.map((scene) => scene.id);
  const beatKeys = graph.scenes.map((scene) => scene.semantic.beatKey);
  if (!unique(sceneIds)) graphIssue(issues, "duplicate_scene_id", "/scenes", "Scene ids must be unique.");
  if (!unique(beatKeys)) graphIssue(issues, "duplicate_scene_beat", "/scenes", "Each StoryConcept beat must bind exactly once.");
  let priorLocation = "";
  let priorAct = 1;
  for (const [index, scene] of graph.scenes.entries()) {
    const path = `/scenes/${index}`;
    if (scene.sceneNumber !== index + 1) {
      graphIssue(issues, "non_contiguous_scene_number", `${path}/sceneNumber`, "Scene numbers must be compiler-owned and contiguous.");
    }
    if (scene.act < priorAct) graphIssue(issues, "act_order_regression", `${path}/act`, "Acts must never move backwards.");
    priorAct = scene.act;
    if (!locationIds.has(scene.timeline.locationBeforeId) || !locationIds.has(scene.timeline.locationAfterId)) {
      graphIssue(issues, "unknown_scene_location", `${path}/timeline`, "Scene timeline must use canonical locations.");
    }
    if (index > 0 && scene.timeline.locationBeforeId !== priorLocation) {
      graphIssue(issues, "scene_handoff_mismatch", `${path}/timeline/locationBeforeId`, "A scene must begin at the preceding canonical final location.");
    }
    priorLocation = scene.timeline.locationAfterId;

    for (const participantKey of scene.semantic.participantKeys) {
      if (!semanticKeys.has(participantKey)) {
        graphIssue(issues, "unknown_semantic_participant", `${path}/semantic/participantKeys`, `${participantKey} is not a canonical character semantic key.`);
      }
    }
    const presenceIds = scene.presences.map((presence) => presence.characterId);
    if (!unique(presenceIds)) graphIssue(issues, "duplicate_scene_presence", `${path}/presences`, "One character may have only one scene presence.");
    for (const presence of scene.presences) {
      if (!characterIds.has(presence.characterId)) {
        graphIssue(issues, "unknown_scene_character", `${path}/presences`, `${presence.characterId} is not canonical.`);
      }
      if (presence.mode === "physical" && !locationIds.has(presence.locationId)) {
        graphIssue(issues, "unknown_presence_location", `${path}/presences`, `${presence.locationId} is not canonical.`);
      }
    }
    const participantCharacterIds = new Set(scene.semantic.participantKeys.map((key) => (
      characters.find((character) => character.semanticKey === key)?.id
    )).filter(Boolean));
    if (![...participantCharacterIds].every((id) => presenceIds.includes(id))) {
      graphIssue(issues, "semantic_participant_missing_presence", `${path}/presences`, "Every semantic participant needs an explicit physical or evoked presence.");
    }

    const visiblePhase = scene.timeline.visiblePhase;
    const expectedVisible = new Set(scene.presences.filter((presence) => (
      presence.mode === "physical"
      && (presence.phase === "throughout" || presence.phase === visiblePhase)
    )).map((presence) => presence.characterId));
    const visible = new Set(scene.illustration.visibleCharacterIds);
    if (!sameSet(expectedVisible, visible)) {
      graphIssue(issues, "visible_cast_mismatch", `${path}/illustration/visibleCharacterIds`, "Visible cast must equal physical presence at the selected instant.");
    }
    const expectedForbidden = new Set([...characterIds].filter((id) => !visible.has(id)));
    if (!sameSet(expectedForbidden, new Set(scene.illustration.forbiddenCharacterIds))) {
      graphIssue(issues, "forbidden_cast_mismatch", `${path}/illustration/forbiddenCharacterIds`, "Every non-visible canonical character must be forbidden physically.");
    }
    if (!visible.has(scene.illustration.mainAction.subjectCharacterId)) {
      graphIssue(issues, "main_action_subject_not_visible", `${path}/illustration/mainAction/subjectCharacterId`, "The main action subject must be visible.");
    }

    const wardrobeIds = scene.wardrobeStates.map((state) => state.characterId);
    if (!unique(wardrobeIds) || !sameSet(new Set(wardrobeIds), visible)) {
      graphIssue(issues, "wardrobe_state_cardinality", `${path}/wardrobeStates`, "Every visible character needs exactly one wardrobe state and no invisible character may receive one.");
    }
    if (scene.physicalState) {
      const visibleLocationId = scene.timeline.visiblePhase === "start"
        ? scene.timeline.locationBeforeId
        : scene.timeline.visiblePhase === "during" && scene.timeline.locationBeforeId !== scene.timeline.locationAfterId
          ? "location_transition"
          : scene.timeline.locationAfterId;
      if (scene.physicalState.visibleLocationId !== visibleLocationId) {
        graphIssue(issues, "physical_state_location_mismatch", `${path}/physicalState/visibleLocationId`, "The physical state must describe the exact illustrated timeline instant.");
      }
      if (scene.physicalState.requiredSurvivalMechanismIds.length) {
        const activeStateByMechanism = new Map([
          ["breathing_voice_bubble", "breathing_voice_bubble_worn"],
        ]);
        for (const wardrobe of scene.wardrobeStates) {
          const missing = scene.physicalState.requiredSurvivalMechanismIds.find((mechanismId) => {
            const stateId = activeStateByMechanism.get(mechanismId);
            return stateId && !wardrobe.equipmentStateIds.includes(stateId);
          });
          if (missing) {
            graphIssue(issues, "physical_state_survival_equipment_missing", `${path}/wardrobeStates`, `${wardrobe.characterId} lacks required mechanism ${missing} at the illustrated instant.`);
          }
        }
      }
    }
    if (Number(graph.validation?.compilerVersion || 1) >= 3) {
      const boundary = scene.illustration.stateBoundary;
      if (!boundary) {
        graphIssue(issues, "scene_state_boundary_missing", `${path}/illustration/stateBoundary`, "Every new V3 scene must seal its exact journey-state boundary before illustration.");
      } else {
        const boundaryProjection = structuredClone(boundary);
        delete boundaryProjection.digest;
        if (boundary.digest !== canonicalDigest(boundaryProjection)) {
          graphIssue(issues, "scene_state_boundary_digest_mismatch", `${path}/illustration/stateBoundary/digest`, "The journey-state boundary digest is stale.");
        }
        if (boundary.visiblePhase !== scene.timeline.visiblePhase) {
          graphIssue(issues, "scene_state_boundary_phase_mismatch", `${path}/illustration/stateBoundary/visiblePhase`, "The journey-state boundary and illustrated timeline must select the same instant.");
        }
        const knownBoundaryCharacters = [...boundary.travelerCharacterIds, ...boundary.originWitnessCharacterIds];
        if (!unique(knownBoundaryCharacters) || !sameSet(new Set(knownBoundaryCharacters), characterIds)) {
          graphIssue(issues, "scene_state_boundary_cast_partition_invalid", `${path}/illustration/stateBoundary`, "Travelers and origin witnesses must partition the complete canonical cast.");
        }
        if (boundary.cameraSide === "adventure" && boundary.originWitnessCharacterIds.some((id) => visible.has(id))) {
          graphIssue(issues, "scene_state_boundary_origin_witness_leak", `${path}/illustration/visibleCharacterIds`, "An origin witness cannot appear physically on the adventure side.");
        }
      }
    }
    const orderedMovements = [...scene.movements].sort((left, right) => left.sequence - right.sequence);
    if (!orderedMovements.every((movement, movementIndex) => movement.sequence === movementIndex + 1)) {
      graphIssue(issues, "movement_sequence_invalid", `${path}/movements`, "Movement sequence must be unique and contiguous within the scene.");
    }
    const startLocations = new Map(characterLocations);
    const movedCharacters = new Set();
    for (const movement of orderedMovements) {
      if (!locationIds.has(movement.fromLocationId) || !locationIds.has(movement.toLocationId)) {
        graphIssue(issues, "unknown_movement_location", `${path}/movements`, "Movement endpoints must be canonical locations.");
      }
      if (!movement.travelerCharacterIds.every((id) => characterIds.has(id))) {
        graphIssue(issues, "unknown_movement_traveler", `${path}/movements`, "Movement travelers must be canonical characters.");
      }
      if (["cross_passage", "return_travel"].includes(movement.kind)) {
        const passage = passages.find((entry) => entry.id === movement.passageId);
        const endpointPair = new Set([movement.fromLocationId, movement.toLocationId]);
        const passagePair = new Set([passage?.sideALocationId, passage?.sideBLocationId]);
        if (!passageIds.has(movement.passageId) || !sameSet(endpointPair, passagePair)) {
          graphIssue(issues, "passage_movement_mismatch", `${path}/movements`, "Passage travel must use the registered endpoint pair exactly.");
        }
      }
      for (const travelerId of movement.travelerCharacterIds) {
        const currentLocation = characterLocations.get(travelerId);
        if (currentLocation !== movement.fromLocationId) {
          graphIssue(issues, "movement_origin_mismatch", `${path}/movements`, `${travelerId} is not at the declared movement origin.`);
        }
        characterLocations.set(travelerId, movement.toLocationId);
        movedCharacters.add(travelerId);
      }
    }
    for (const presence of scene.presences.filter((entry) => entry.mode === "physical")) {
      const startLocation = startLocations.get(presence.characterId);
      const endLocation = characterLocations.get(presence.characterId);
      const expectedLocation = presence.phase === "start" ? startLocation : endLocation;
      if (presence.locationId !== expectedLocation) {
        graphIssue(issues, "physical_presence_location_mismatch", `${path}/presences`, `${presence.characterId} is not at the declared ${presence.phase} location.`);
      }
      if (presence.phase === "throughout" && !movedCharacters.has(presence.characterId) && startLocation !== endLocation) {
        graphIssue(issues, "throughout_presence_movement_missing", `${path}/presences`, `${presence.characterId} changes location without an ordered movement.`);
      }
    }
    const physicalIds = new Set(scene.presences.filter((entry) => entry.mode === "physical").map((entry) => entry.characterId));
    for (const travelerId of movedCharacters) {
      if (!physicalIds.has(travelerId)) {
        graphIssue(issues, "movement_without_physical_presence", `${path}/movements`, `${travelerId} moves without a physical scene presence.`);
      }
    }
    if (scene.semantic.purpose === "crossing" && !scene.movements.some((entry) => entry.kind === "cross_passage")) {
      graphIssue(issues, "crossing_without_passage", `${path}/movements`, "A crossing beat requires one registered passage movement.");
    }
    if (scene.semantic.purpose === "return" && !scene.movements.some((entry) => entry.kind === "return_travel")) {
      graphIssue(issues, "return_without_passage", `${path}/movements`, "A return beat requires one reverse registered passage movement.");
    }
    for (const event of scene.objectEvents) {
      if (!objectIds.has(event.objectId)) graphIssue(issues, "unknown_object_event", `${path}/objectEvents`, `${event.objectId} is not canonical.`);
      for (const owner of [event.fromOwnerCharacterId, event.toOwnerCharacterId].filter(Boolean)) {
        if (!characterIds.has(owner)) graphIssue(issues, "unknown_object_owner", `${path}/objectEvents`, `${owner} is not canonical.`);
      }
    }
    const targetId = scene.illustration.mainAction.targetId;
    if (targetId && !characterIds.has(targetId) && !locationIds.has(targetId) && !objectIds.has(targetId) && !passageIds.has(targetId)) {
      graphIssue(issues, "unknown_main_action_target", `${path}/illustration/mainAction/targetId`, `${targetId} is not a canonical entity.`);
    }
  }
  if (!sameSet(new Set([1, 2, 3]), new Set(graph.scenes.map((scene) => scene.act)))) {
    graphIssue(issues, "three_act_contract_incomplete", "/scenes", "Every canonical graph must contain all three ordered acts.");
  }
  if (verifyDigest) {
    const expected = canonicalStoryGraphDigest(graph);
    if (graph.validation.artifactDigest !== expected) {
      graphIssue(issues, "canonical_graph_digest_mismatch", "/validation/artifactDigest", "The digest does not belong to this exact graph.");
    }
  }
  return {
    valid: issues.length === 0,
    issues,
    digest: canonicalStoryGraphDigest(graph),
  };
}

export function loadCanonicalStoryGraph(canonicalValue) {
  const result = validateCanonicalStoryGraph(canonicalValue);
  if (!result.valid) {
    throw new NarrativeV3ContractError({
      code: "canonical_story_graph_invalid",
      artifactType: "canonical_story_graph",
      issues: result.issues,
    });
  }
  return deepFreeze(structuredClone(canonicalValue));
}

export function compileCanonicalStoryGraph({ concept, mechanics, revision = 1 } = {}) {
  const canonicalConcept = loadStoryConcept(concept);
  assertNarrativeV3Schema("canonical_story_mechanics", mechanics);
  const conceptByKey = new Map(canonicalConcept.beats.map((beat) => [beat.beatKey, beat]));
  const mechanicScenes = Array.isArray(mechanics?.scenes) ? mechanics.scenes : [];
  const mechanicBeatKeys = mechanicScenes.map((scene) => scene.beatKey);
  if (
    mechanicBeatKeys.length !== canonicalConcept.beats.length
    || !sameSet(new Set(mechanicBeatKeys), new Set(conceptByKey.keys()))
    || !unique(mechanicBeatKeys)
  ) {
    throw new NarrativeV3ContractError({
      code: "canonical_graph_beat_binding_invalid",
      artifactType: "canonical_story_graph",
      issues: [{ path: "/mechanics/scenes", message: "Server mechanics must bind every StoryConcept beat exactly once." }],
    });
  }
  const graph = {
    schemaVersion: CANONICAL_STORY_GRAPH_VERSION,
    contractId: CANONICAL_STORY_GRAPH_ID,
    revision,
    sourceConcept: {
      contractId: canonicalConcept.contractId,
      schemaVersion: canonicalConcept.schemaVersion,
      artifactDigest: canonicalConcept.validation.artifactDigest,
    },
    book: {
      language: canonicalConcept.language,
      audienceAge: mechanics.book.audienceAge,
      pageCount: mechanics.book.pageCount,
      universeId: mechanics.book.universeId,
    },
    title: canonicalConcept.title,
    premise: canonicalConcept.premise,
    registries: structuredClone(mechanics.registries),
    scenes: mechanicScenes.map((mechanic, index) => {
      const beat = conceptByKey.get(mechanic.beatKey);
      return {
        id: mechanic.id,
        sceneNumber: index + 1,
        act: mechanic.act,
        semantic: structuredClone(beat),
        timeline: structuredClone(mechanic.timeline),
        presences: structuredClone(mechanic.presences || []),
        movements: structuredClone(mechanic.movements || []),
        objectEvents: structuredClone(mechanic.objectEvents || []),
        wardrobeStates: structuredClone(mechanic.wardrobeStates || []),
        ...(mechanic.physicalState ? { physicalState: structuredClone(mechanic.physicalState) } : {}),
        illustration: structuredClone(mechanic.illustration),
      };
    }),
  };
  const physicalSceneCount = graph.scenes.filter((scene) => scene.physicalState).length;
  if (physicalSceneCount > 0 && physicalSceneCount !== graph.scenes.length) {
    throw new NarrativeV3ContractError({
      code: "canonical_graph_physical_state_partial",
      artifactType: "canonical_story_graph",
      issues: [{
        path: "/scenes",
        message: "The physical chronology must cover every scene or remain absent on a legacy graph.",
      }],
    });
  }
  const boundarySceneCount = graph.scenes.filter((scene) => scene.illustration?.stateBoundary).length;
  if (boundarySceneCount > 0 && boundarySceneCount !== graph.scenes.length) {
    throw new NarrativeV3ContractError({
      code: "canonical_graph_scene_state_boundary_partial",
      artifactType: "canonical_story_graph",
      issues: [{ path: "/scenes", message: "The journey-state boundary must cover every scene or remain absent on a legacy graph." }],
    });
  }
  graph.validation = {
    compilerVersion: boundarySceneCount === graph.scenes.length
      ? CANONICAL_STORY_GRAPH_COMPILER_VERSION
      : physicalSceneCount === graph.scenes.length ? 2 : 1,
    artifactDigest: "",
  };
  graph.validation.artifactDigest = canonicalStoryGraphDigest(graph);
  return loadCanonicalStoryGraph(graph);
}
