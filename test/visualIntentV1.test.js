import assert from "node:assert/strict";
import test from "node:test";

import { buildCanonicalStoryMechanics } from "../src/contracts/buildCanonicalStoryMechanics.js";
import { buildCreationIntent } from "../src/contracts/creationIntent.js";
import { parseStoryConceptWire } from "../src/contracts/narrativeV3Canonical.js";
import { buildVisualIntentV1, loadVisualIntentV1 } from "../src/contracts/visualIntentV1.js";

function intent() {
  return buildCreationIntent({
    language: "FR", audienceAge: 8, pageCount: 24, universeId: "starry_space",
    intentionId: "confidence", approachId: "observe", sensitivityLevel: 1,
    castRefs: [
      { characterKey: "hero", profileRef: "profile:hero", role: "hero", kind: "human" },
      { characterKey: "parent", profileRef: "profile:parent", role: "family", kind: "human" },
    ],
    questionnaireDigest: "a".repeat(64), safetyAssessmentDigest: "b".repeat(64),
  });
}

function concept() {
  const purposes = ["opening", "desire", "preparation", "crossing", "attempt", "attempt", "attempt", "attempt", "climax", "return", "resolution"];
  return parseStoryConceptWire({
    schema_version: 1, contract_id: "calitiki.story-concept-wire.v1", language: "FR",
    title: "Une route stable", premise: "Le héros apprend en observant.", theme_proof: "Il choisit après avoir observé.",
    hero_arc: { desire: "Essayer", initial_doubt: "Hésiter", decisive_choice: "Observer", earned_change: "Comprendre" },
    beats: purposes.map((purpose, index) => ({
      beat_key: `beat_${String(index + 1).padStart(2, "0")}`, purpose,
      summary: `Action stable ${index + 1}`, emotional_shift: `Émotion ${index + 1}`,
      distinctive_image: `Image ${index + 1}`, participant_keys: ["hero", "parent"],
    })),
  });
}

test("VisualIntent seals every identity and the exact customer-selected universe outfit", () => {
  const creationIntent = intent();
  const visualIntent = buildVisualIntentV1({
    creationIntent,
    characters: [
      {
        characterKey: "hero", profileRef: "profile:hero", kind: "human",
        outfitPreference: "selected", ordinaryOutfitDescription: "the exact plain blue photo outfit",
        adventureOutfitId: "star_researcher",
      },
      {
        characterKey: "parent", profileRef: "profile:parent", kind: "human",
        outfitPreference: "preserve_photo", ordinaryOutfitDescription: "the exact plain green photo outfit",
      },
    ],
  });
  assert.equal(loadVisualIntentV1(visualIntent).validation.artifactDigest, visualIntent.validation.artifactDigest);
  assert.equal(visualIntent.characters[0].adventureOutfit.stateId, "star_researcher");
  assert.equal(visualIntent.characters[1].adventureOutfit.stateId, "ordinary_outfit");

  const mechanics = buildCanonicalStoryMechanics({ intent: creationIntent, concept: concept(), visualIntent });
  const preparation = mechanics.scenes[2].wardrobeStates;
  assert.equal(preparation.find((entry) => entry.characterId === "character_hero").outfitStateId, "star_researcher");
  assert.equal(preparation.find((entry) => entry.characterId === "character_parent").outfitStateId, "ordinary_outfit");
});

test("VisualIntent rejects an outfit from a different universe instead of guessing", () => {
  assert.throws(() => buildVisualIntentV1({
    creationIntent: intent(),
    characters: [
      { characterKey: "hero", profileRef: "profile:hero", kind: "human", outfitPreference: "selected", ordinaryOutfitDescription: "photo outfit", adventureOutfitId: "reef_explorer" },
      { characterKey: "parent", profileRef: "profile:parent", kind: "human", outfitPreference: "preserve_photo", ordinaryOutfitDescription: "photo outfit" },
    ],
  }), (error) => error.code === "visual_intent_universe_outfit_unknown");
});
