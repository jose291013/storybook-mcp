import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_STORY_GRAPH_ID,
  NarrativeV3ContractError,
  STORY_CONCEPT_ID,
  canonicalSerialize,
  canonicalStoryGraphDigest,
  compileCanonicalStoryGraph,
  loadCanonicalStoryGraph,
  loadStoryConcept,
  parseStoryConceptWire,
  storyConceptDigest,
  validateCanonicalStoryGraph,
} from "../src/contracts/narrativeV3Canonical.js";
import { assertNarrativeV3Schema } from "../src/contracts/narrativeV3SchemaRegistry.js";

function wireConcept() {
  return {
    schema_version: 1,
    contract_id: "calitiki.story-concept-wire.v1",
    language: "FR",
    title: "La vallée aux lucioles",
    premise: "Noa apprend à avancer sans devoir réussir du premier coup.",
    theme_proof: "Noa essaie deux chemins, choisit le sien puis explique ce qu'elle a appris.",
    hero_arc: {
      desire: "Trouver la lumière du vallon.",
      initial_doubt: "Elle craint de choisir le mauvais chemin.",
      decisive_choice: "Elle observe les traces et choisit elle-même.",
      earned_change: "Elle sait désormais essayer, observer et ajuster.",
    },
    beats: [
      {
        beat_key: "quiet_opening",
        purpose: "opening",
        summary: "Noa et Eva observent une lueur depuis la maison.",
        emotional_shift: "curiosité calme",
        distinctive_image: "une luciole dessine un cercle près de la fenêtre",
        participant_keys: ["hero", "guide"],
      },
      {
        beat_key: "valley_crossing",
        purpose: "crossing",
        summary: "Noa franchit le passage vers la vallée avec Eva.",
        emotional_shift: "de l'hésitation à l'élan",
        distinctive_image: "une arche de feuilles ouvre la vallée lumineuse",
        participant_keys: ["hero", "guide"],
      },
      {
        beat_key: "chosen_attempt",
        purpose: "attempt",
        summary: "Noa compare deux pistes et teste celle qu'elle comprend le mieux.",
        emotional_shift: "de la précipitation à l'attention",
        distinctive_image: "deux chemins de lucioles se séparent autour d'un rocher",
        participant_keys: ["hero", "guide"],
      },
      {
        beat_key: "home_return",
        purpose: "return",
        summary: "Noa revient à la maison en gardant sa propre méthode.",
        emotional_shift: "de la tension à la confiance",
        distinctive_image: "la même arche ramène une lumière douce vers la maison",
        participant_keys: ["hero", "guide"],
      },
      {
        beat_key: "earned_resolution",
        purpose: "resolution",
        summary: "Noa prépare seule une petite carte pour son prochain essai.",
        emotional_shift: "fierté tranquille",
        distinctive_image: "une carte simple éclairée par une luciole",
        participant_keys: ["hero", "guide"],
      },
    ],
  };
}

function visibleScene({
  id,
  beatKey,
  act,
  before,
  after,
  purpose,
}) {
  const movement = purpose === "crossing"
    ? [{
      sequence: 1,
      kind: "cross_passage",
      travelerCharacterIds: ["character_hero", "character_guide"],
      fromLocationId: before,
      toLocationId: after,
      passageId: "passage_leaf_arch",
    }]
    : purpose === "return"
      ? [{
        sequence: 1,
        kind: "return_travel",
        travelerCharacterIds: ["character_hero", "character_guide"],
        fromLocationId: before,
        toLocationId: after,
        passageId: "passage_leaf_arch",
      }]
      : [];
  return {
    id,
    beatKey,
    act,
    timeline: {
      locationBeforeId: before,
      locationAfterId: after,
      visiblePhase: purpose === "crossing" || purpose === "return" ? "during" : "end",
    },
    presences: [
      { characterId: "character_hero", mode: "physical", phase: "throughout", locationId: after },
      { characterId: "character_guide", mode: "physical", phase: "throughout", locationId: after },
    ],
    movements: movement,
    objectEvents: [],
    wardrobeStates: [
      { characterId: "character_hero", outfitStateId: "outfit_explorer", equipmentStateIds: [] },
      { characterId: "character_guide", outfitStateId: "outfit_explorer", equipmentStateIds: [] },
    ],
    illustration: {
      visibleCharacterIds: ["character_hero", "character_guide"],
      forbiddenCharacterIds: [],
      mainAction: {
        subjectCharacterId: "character_hero",
        action: "observe et choisit",
        targetId: "",
      },
    },
  };
}

function mechanics() {
  return {
    schemaVersion: 1,
    contractId: "calitiki.canonical-story-mechanics.v1",
    book: {
      audienceAge: 8,
      pageCount: 24,
      universeId: "luminous_valley",
    },
    registries: {
      characters: [
        { id: "character_hero", semanticKey: "hero", canonicalName: "Noa", role: "hero", initialLocationId: "location_home" },
        { id: "character_guide", semanticKey: "guide", canonicalName: "Eva", role: "guide", initialLocationId: "location_home" },
      ],
      locations: [
        { id: "location_home", name: "la maison", kind: "origin" },
        { id: "location_valley", name: "la vallée lumineuse", kind: "adventure" },
      ],
      objects: [],
      passages: [{
        id: "passage_leaf_arch",
        name: "l'arche de feuilles",
        sideALocationId: "location_home",
        sideBLocationId: "location_valley",
      }],
    },
    scenes: [
      visibleScene({ id: "scene_opening", beatKey: "quiet_opening", act: 1, before: "location_home", after: "location_home", purpose: "opening" }),
      visibleScene({ id: "scene_crossing", beatKey: "valley_crossing", act: 1, before: "location_home", after: "location_valley", purpose: "crossing" }),
      visibleScene({ id: "scene_attempt", beatKey: "chosen_attempt", act: 2, before: "location_valley", after: "location_valley", purpose: "attempt" }),
      visibleScene({ id: "scene_return", beatKey: "home_return", act: 3, before: "location_valley", after: "location_home", purpose: "return" }),
      visibleScene({ id: "scene_resolution", beatKey: "earned_resolution", act: 3, before: "location_home", after: "location_home", purpose: "resolution" }),
    ],
  };
}

test("strict wire parsing creates one immutable canonical StoryConcept", () => {
  const wire = wireConcept();
  const concept = parseStoryConceptWire(wire);

  assert.equal(concept.contractId, STORY_CONCEPT_ID);
  assert.equal(concept.heroArc.initialDoubt, wire.hero_arc.initial_doubt);
  assert.equal(concept.beats[1].beatKey, "valley_crossing");
  assert.equal(concept.validation.artifactDigest, storyConceptDigest(concept));
  assert.equal(Object.isFrozen(concept), true);
  assert.equal(Object.isFrozen(concept.beats[0]), true);
  assertNarrativeV3Schema("story_concept", concept);
});

test("wire and canonical loaders reject the other representation instead of normalizing it", () => {
  const wire = wireConcept();
  const concept = parseStoryConceptWire(wire);

  assert.throws(() => parseStoryConceptWire(concept), NarrativeV3ContractError);
  assert.throws(() => loadStoryConcept(wire), NarrativeV3ContractError);
  assert.equal(loadStoryConcept(concept).beats.length, wire.beats.length);
});

test("unknown model mechanics are rejected at the wire boundary", () => {
  const wire = wireConcept();
  wire.beats[0].location_before = "location_home";

  assert.throws(
    () => parseStoryConceptWire(wire),
    (error) => error instanceof NarrativeV3ContractError
      && error.issues.some((issue) => issue.keyword === "additionalProperties"),
  );
});

test("a canonical StoryConcept is loaded exactly and never silently repaired", () => {
  const concept = structuredClone(parseStoryConceptWire(wireConcept()));
  concept.beats[0].summary = "Texte altéré après signature.";

  assert.throws(
    () => loadStoryConcept(concept),
    (error) => error.code === "story_concept_digest_mismatch",
  );
  assert.equal(concept.beats[0].summary, "Texte altéré après signature.");
});

test("canonical serialization is insertion-order independent and rejects non-JSON state", () => {
  assert.equal(
    canonicalSerialize({ z: [3, { b: 2, a: 1 }], a: true }),
    canonicalSerialize({ a: true, z: [3, { a: 1, b: 2 }] }),
  );
  assert.throws(() => canonicalSerialize({ unsafe: undefined }), NarrativeV3ContractError);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalSerialize(cyclic), NarrativeV3ContractError);
});

test("artifact digests bind their parser and compiler versions", () => {
  const concept = structuredClone(parseStoryConceptWire(wireConcept()));
  const originalConceptDigest = concept.validation.artifactDigest;
  concept.validation.parserVersion = 2;
  assert.notEqual(storyConceptDigest(concept), originalConceptDigest);

  const graph = structuredClone(compileCanonicalStoryGraph({
    concept: parseStoryConceptWire(wireConcept()),
    mechanics: mechanics(),
  }));
  const originalGraphDigest = graph.validation.artifactDigest;
  graph.validation.compilerVersion = 2;
  assert.notEqual(canonicalStoryGraphDigest(graph), originalGraphDigest);
});

test("the pure compiler creates a strict deterministic CanonicalStoryGraph", () => {
  const concept = parseStoryConceptWire(wireConcept());
  const serverMechanics = mechanics();
  const originalConcept = structuredClone(concept);
  const originalMechanics = structuredClone(serverMechanics);
  const first = compileCanonicalStoryGraph({ concept, mechanics: serverMechanics });
  const second = compileCanonicalStoryGraph({
    concept: structuredClone(concept),
    mechanics: structuredClone(serverMechanics),
  });

  assert.equal(first.contractId, CANONICAL_STORY_GRAPH_ID);
  assert.equal(first.sourceConcept.artifactDigest, concept.validation.artifactDigest);
  assert.equal(first.scenes[1].timeline.locationBeforeId, "location_home");
  assert.equal(first.scenes[1].timeline.locationAfterId, "location_valley");
  assert.equal(first.scenes[1].presences.length, 2);
  assert.equal(first.validation.artifactDigest, canonicalStoryGraphDigest(first));
  assert.equal(canonicalSerialize(first), canonicalSerialize(second));
  assert.deepEqual(concept, originalConcept);
  assert.deepEqual(serverMechanics, originalMechanics);
  assert.equal(Object.isFrozen(first.scenes[0].timeline), true);
  assertNarrativeV3Schema("canonical_story_graph", first);
  assert.equal(validateCanonicalStoryGraph(first).valid, true);
});

test("compilation remains byte-identical across repeated persisted replays", () => {
  const concept = parseStoryConceptWire(wireConcept());
  const serverMechanics = mechanics();
  const serializations = new Set();
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const graph = compileCanonicalStoryGraph({
      concept: JSON.parse(JSON.stringify(concept)),
      mechanics: JSON.parse(JSON.stringify(serverMechanics)),
    });
    const loaded = loadCanonicalStoryGraph(JSON.parse(canonicalSerialize(graph)));
    serializations.add(canonicalSerialize(loaded));
  }
  assert.equal(serializations.size, 1);
});

test("mechanical beat bindings must cover the concept exactly once", () => {
  const concept = parseStoryConceptWire(wireConcept());
  const serverMechanics = mechanics();
  serverMechanics.scenes[4].beatKey = "home_return";

  assert.throws(
    () => compileCanonicalStoryGraph({ concept, mechanics: serverMechanics }),
    (error) => error.code === "canonical_graph_beat_binding_invalid",
  );
});

test("server mechanics also have a strict boundary and cannot hide misspelled state", () => {
  const concept = parseStoryConceptWire(wireConcept());
  const serverMechanics = mechanics();
  serverMechanics.scenes[0].location_before = "location_home";

  assert.throws(
    () => compileCanonicalStoryGraph({ concept, mechanics: serverMechanics }),
    (error) => error instanceof NarrativeV3ContractError
      && error.issues.some((issue) => issue.keyword === "additionalProperties"),
  );
});

test("canonical graph loading rejects drift instead of normalizing or repairing it", () => {
  const graph = structuredClone(compileCanonicalStoryGraph({
    concept: parseStoryConceptWire(wireConcept()),
    mechanics: mechanics(),
  }));
  graph.scenes[2].timeline.locationBeforeId = "location_home";
  graph.validation.artifactDigest = canonicalStoryGraphDigest(graph);
  const result = validateCanonicalStoryGraph(graph);

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "scene_handoff_mismatch"));
  assert.throws(() => loadCanonicalStoryGraph(graph), NarrativeV3ContractError);
  assert.equal(graph.scenes[2].timeline.locationBeforeId, "location_home");
});

test("character travel is validated from its canonical prior location", () => {
  const serverMechanics = mechanics();
  serverMechanics.scenes[1].movements[0].fromLocationId = "location_valley";
  serverMechanics.scenes[1].movements[0].toLocationId = "location_home";
  serverMechanics.scenes[1].timeline.locationAfterId = "location_home";
  serverMechanics.scenes[2].timeline.locationBeforeId = "location_home";
  const concept = parseStoryConceptWire(wireConcept());

  assert.throws(
    () => compileCanonicalStoryGraph({ concept, mechanics: serverMechanics }),
    (error) => error instanceof NarrativeV3ContractError
      && error.issues.some((issue) => issue.code === "movement_origin_mismatch"),
  );
});

test("a canonical graph cannot be reparsed as a model wire response", () => {
  const graph = compileCanonicalStoryGraph({
    concept: parseStoryConceptWire(wireConcept()),
    mechanics: mechanics(),
  });

  assert.throws(() => parseStoryConceptWire(graph), NarrativeV3ContractError);
});
