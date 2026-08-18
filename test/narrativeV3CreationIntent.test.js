import assert from "node:assert/strict";
import test from "node:test";

import {
  CREATION_INTENT_ID,
  buildCreationIntent,
  creationIntentDigest,
  creationIntentFingerprint,
  loadCreationIntent,
} from "../src/contracts/creationIntent.js";
import { NarrativeV3ContractError } from "../src/contracts/narrativeV3Canonical.js";

function input(overrides = {}) {
  return {
    language: "fr",
    audienceAge: 8,
    pageCount: 32,
    universeId: "dinosaur_valley",
    intentionId: "build_self_confidence",
    approachId: "patient_observation",
    sensitivityLevel: 1,
    castRefs: [
      { characterKey: "hero", profileRef: "profile:child-1", role: "hero", kind: "human" },
      { characterKey: "guide", profileRef: "profile:adult-1", role: "guide", kind: "human" },
      { characterKey: "companion", profileRef: "profile:dog-1", role: "companion", kind: "animal" },
    ],
    seriesRef: null,
    previousCanonDigest: null,
    questionnaireDigest: "a".repeat(64),
    safetyAssessmentDigest: "b".repeat(64),
    ...overrides,
  };
}

test("the server builds one strict immutable and privacy-safe CreationIntent", () => {
  const intent = buildCreationIntent(input());

  assert.equal(intent.contractId, CREATION_INTENT_ID);
  assert.equal(intent.language, "FR");
  assert.equal(intent.audience.readingBand, "independent");
  assert.equal(intent.cast[0].profileRef, "profile:child-1");
  assert.equal(intent.validation.artifactDigest, creationIntentDigest(intent));
  assert.equal(Object.isFrozen(intent), true);
  assert.equal(Object.isFrozen(intent.cast[0]), true);
  assert.equal(creationIntentFingerprint(intent), creationIntentFingerprint(loadCreationIntent(intent)));
  assert.equal(JSON.stringify(intent).includes("name"), false);
  assert.equal(JSON.stringify(intent).includes("photo"), false);
});

test("reading bands are deterministic at every age boundary", () => {
  assert.equal(buildCreationIntent(input({ audienceAge: 4 })).audience.readingBand, "read_aloud");
  assert.equal(buildCreationIntent(input({ audienceAge: 5 })).audience.readingBand, "emergent");
  assert.equal(buildCreationIntent(input({ audienceAge: 8 })).audience.readingBand, "independent");
  assert.equal(buildCreationIntent(input({ audienceAge: 11 })).audience.readingBand, "upper_middle");
});

test("unknown customer prose and generated mechanics fail at the intent boundary", () => {
  assert.throws(
    () => buildCreationIntent(input({ customerMessage: "Texte privé" })),
    (error) => error instanceof NarrativeV3ContractError && error.code === "creation_intent_input_unknown_field",
  );
  assert.throws(
    () => buildCreationIntent(input({ locations: [{ id: "home" }] })),
    (error) => error instanceof NarrativeV3ContractError && error.code === "creation_intent_input_unknown_field",
  );
});

test("cast identity, hero cardinality and private references fail closed", () => {
  assert.throws(
    () => buildCreationIntent(input({ castRefs: [
      { characterKey: "hero", profileRef: "profile:a", role: "hero", kind: "human" },
      { characterKey: "hero", profileRef: "profile:b", role: "guide", kind: "human" },
    ] })),
    (error) => error.code === "creation_intent_duplicate_character",
  );
  assert.throws(
    () => buildCreationIntent(input({ castRefs: [
      { characterKey: "guide", profileRef: "profile:a", role: "guide", kind: "human" },
    ] })),
    (error) => error.code === "creation_intent_hero_cardinality",
  );
  assert.throws(
    () => buildCreationIntent(input({ castRefs: [
      { characterKey: "hero", profileRef: "../../photo.jpg", role: "hero", kind: "human" },
    ] })),
    (error) => error.code === "creation_intent_reference_invalid",
  );
});

test("sealed intent changes are detected and never repaired", () => {
  const modified = structuredClone(buildCreationIntent(input()));
  modified.book.pageCount = 44;

  assert.throws(
    () => loadCreationIntent(modified),
    (error) => error.code === "creation_intent_digest_mismatch",
  );
  assert.equal(modified.book.pageCount, 44);
});
