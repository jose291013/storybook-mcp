import assert from "node:assert/strict";
import test from "node:test";

import { UNIVERSE_OPTIONS } from "../src/config/bookOptions.js";
import {
  buildCanonicalStoryMechanics,
} from "../src/contracts/buildCanonicalStoryMechanics.js";
import { buildCreationIntent } from "../src/contracts/creationIntent.js";
import {
  canonicalSerialize,
  compileCanonicalStoryGraph,
  parseStoryConceptWire,
} from "../src/contracts/narrativeV3Canonical.js";

const PAGE_COUNTS = [24, 28, 32, 36, 40, 44];

function intent(universeId = "enchanted_forest", pageCount = 24) {
  return buildCreationIntent({
    language: "FR",
    audienceAge: 8,
    pageCount,
    universeId,
    intentionId: "learn_by_trying",
    approachId: "observe_choose_adjust",
    sensitivityLevel: 1,
    castRefs: [
      { characterKey: "hero", profileRef: "profile:hero", role: "hero", kind: "human" },
      { characterKey: "guide", profileRef: "profile:guide", role: "guide", kind: "human" },
      { characterKey: "family", profileRef: "profile:family", role: "family", kind: "human" },
      { characterKey: "companion", profileRef: "profile:companion", role: "companion", kind: "animal" },
    ],
    seriesRef: null,
    previousCanonDigest: null,
    questionnaireDigest: "a".repeat(64),
    safetyAssessmentDigest: "b".repeat(64),
  });
}

function actForIndex(index, total) {
  const actOneCount = Math.max(1, Math.floor(total * 0.3));
  const actTwoEnd = Math.max(actOneCount + 1, Math.min(total - 1, Math.floor(total * 0.75)));
  if (index < actOneCount) return 1;
  if (index < actTwoEnd) return 2;
  return 3;
}

function concept(pageCount = 24, { withPassage = true } = {}) {
  const total = (pageCount - 2) / 2;
  const crossingIndex = Math.floor(total * 0.3);
  const climaxIndex = Math.max(crossingIndex + 1, Math.floor(total * 0.75));
  const returnIndex = Math.min(total - 2, climaxIndex + 1);
  const beats = Array.from({ length: total }, (_, index) => {
    let purpose = actForIndex(index, total) === 1 ? "desire" : "attempt";
    if (index === 0) purpose = "opening";
    if (withPassage && index === crossingIndex - 1) purpose = "preparation";
    if (withPassage && index === crossingIndex) purpose = "crossing";
    if (index === climaxIndex) purpose = "climax";
    if (withPassage && index === returnIndex) purpose = "return";
    if (index === total - 1) purpose = "resolution";
    const participantKeys = ["hero", "guide"];
    if ([0, returnIndex, total - 1].includes(index)) participantKeys.push("family");
    if (withPassage && index > crossingIndex && index < returnIndex && index % 2 === 0) participantKeys.push("companion");
    return {
      beat_key: `beat_${String(index + 1).padStart(2, "0")}`,
      purpose,
      summary: `Le moment narratif stable numéro ${index + 1}.`,
      emotional_shift: `progression émotionnelle ${index + 1}`,
      distinctive_image: `composition distinctive ${index + 1}`,
      participant_keys: participantKeys,
    };
  });
  return parseStoryConceptWire({
    schema_version: 1,
    contract_id: "calitiki.story-concept-wire.v1",
    language: "FR",
    title: "Le chemin des essais",
    premise: "L'enfant observe, choisit et ajuste sa méthode avec confiance.",
    theme_proof: "Ses décisions successives produisent une réussite qu'il comprend.",
    hero_arc: {
      desire: "Trouver sa propre façon d'avancer.",
      initial_doubt: "Il craint de ne pas réussir immédiatement.",
      decisive_choice: "Il compare les indices puis choisit.",
      earned_change: "Il sait désormais essayer et ajuster.",
    },
    beats,
  });
}

test("every universe and sellable format compiles into one deterministic valid graph", () => {
  for (const universe of UNIVERSE_OPTIONS) {
    for (const pageCount of PAGE_COUNTS) {
      const creationIntent = intent(universe.id, pageCount);
      const storyConcept = concept(pageCount);
      const first = buildCanonicalStoryMechanics({ intent: creationIntent, concept: storyConcept });
      const second = buildCanonicalStoryMechanics({
        intent: structuredClone(creationIntent),
        concept: structuredClone(storyConcept),
      });
      const graph = compileCanonicalStoryGraph({ concept: storyConcept, mechanics: first });

      assert.equal(first.scenes.length, (pageCount - 2) / 2);
      assert.deepEqual([...new Set(first.scenes.map((scene) => scene.act))], [1, 2, 3]);
      assert.equal(canonicalSerialize(first), canonicalSerialize(second));
      assert.equal(graph.scenes.length, first.scenes.length);
      assert.equal(Object.isFrozen(first), true);
    }
  }
});

test("the unique passage moves travelers while witnesses and local companions stay on their side", () => {
  const mechanics = buildCanonicalStoryMechanics({ intent: intent(), concept: concept() });
  const crossing = mechanics.scenes.find((scene) => scene.movements[0]?.kind === "cross_passage");
  const returning = mechanics.scenes.find((scene) => scene.movements[0]?.kind === "return_travel");
  const resolution = mechanics.scenes.at(-1);
  const family = mechanics.registries.characters.find((entry) => entry.semanticKey === "family");
  const companion = mechanics.registries.characters.find((entry) => entry.semanticKey === "companion");

  assert.deepEqual(crossing.movements[0].travelerCharacterIds, ["character_hero", "character_guide"]);
  assert.deepEqual(returning.movements[0].travelerCharacterIds, ["character_hero", "character_guide"]);
  assert.equal(family.initialLocationId, "location_origin");
  assert.equal(companion.initialLocationId, "location_adventure");
  assert.ok(returning.illustration.visibleCharacterIds.includes("character_family"));
  assert.ok(returning.illustration.forbiddenCharacterIds.includes("character_companion"));
  assert.ok(resolution.illustration.visibleCharacterIds.includes("character_family"));
});

test("underwater wardrobe and breathing equipment follow the exact passage window", () => {
  const mechanics = buildCanonicalStoryMechanics({
    intent: intent("coral_ocean", 24),
    concept: concept(24),
  });
  const crossingIndex = mechanics.scenes.findIndex((scene) => scene.movements[0]?.kind === "cross_passage");
  const returnIndex = mechanics.scenes.findIndex((scene) => scene.movements[0]?.kind === "return_travel");
  const preparation = mechanics.scenes[crossingIndex - 1].wardrobeStates.find((entry) => entry.characterId === "character_hero");
  const submerged = mechanics.scenes[crossingIndex].wardrobeStates.find((entry) => entry.characterId === "character_hero");
  const returned = mechanics.scenes[returnIndex].wardrobeStates.find((entry) => entry.characterId === "character_hero");
  const settled = mechanics.scenes.at(-1).wardrobeStates.find((entry) => entry.characterId === "character_hero");

  assert.equal(preparation.outfitStateId, "reef_explorer");
  assert.deepEqual(preparation.equipmentStateIds, []);
  assert.deepEqual(submerged.equipmentStateIds, ["breathing_voice_bubble_worn"]);
  assert.deepEqual(returned.equipmentStateIds, ["breathing_voice_bubble_worn"]);
  assert.equal(settled.outfitStateId, "ordinary_outfit");
  assert.deepEqual(settled.equipmentStateIds, []);
});

test("a universe-native concept stays on the adventure side without invented travel", () => {
  const mechanics = buildCanonicalStoryMechanics({ intent: intent(), concept: concept(24, { withPassage: false }) });

  assert.deepEqual(mechanics.registries.passages, []);
  assert.ok(mechanics.scenes.every((scene) => scene.timeline.locationBeforeId === "location_adventure"));
  assert.ok(mechanics.scenes.every((scene) => scene.timeline.locationAfterId === "location_adventure"));
  assert.ok(mechanics.scenes.every((scene) => scene.movements.length === 0));
});

test("ambiguous story mechanics fail before graph compilation", () => {
  assert.throws(
    () => buildCanonicalStoryMechanics({ intent: intent("enchanted_forest", 28), concept: concept(24) }),
    (error) => error.code === "mechanics_scene_count_mismatch",
  );

  const missingReturnWire = structuredClone(concept(24));
  const returnBeat = missingReturnWire.beats.find((beat) => beat.purpose === "return");
  returnBeat.purpose = "attempt";
  const wire = {
    schema_version: 1,
    contract_id: "calitiki.story-concept-wire.v1",
    language: missingReturnWire.language,
    title: missingReturnWire.title,
    premise: missingReturnWire.premise,
    theme_proof: missingReturnWire.themeProof,
    hero_arc: {
      desire: missingReturnWire.heroArc.desire,
      initial_doubt: missingReturnWire.heroArc.initialDoubt,
      decisive_choice: missingReturnWire.heroArc.decisiveChoice,
      earned_change: missingReturnWire.heroArc.earnedChange,
    },
    beats: missingReturnWire.beats.map((beat) => ({
      beat_key: beat.beatKey,
      purpose: beat.purpose,
      summary: beat.summary,
      emotional_shift: beat.emotionalShift,
      distinctive_image: beat.distinctiveImage,
      participant_keys: beat.participantKeys,
    })),
  };
  assert.throws(
    () => buildCanonicalStoryMechanics({ intent: intent(), concept: parseStoryConceptWire(wire) }),
    (error) => error.code === "mechanics_passage_pair_incomplete",
  );
});
