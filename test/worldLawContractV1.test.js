import assert from "node:assert/strict";
import test from "node:test";

import { UNIVERSE_OPTIONS } from "../src/config/bookOptions.js";
import { buildCreationIntent } from "../src/contracts/creationIntent.js";
import { buildWorldLawContractV1, loadWorldLawContractV1 } from "../src/contracts/worldLawContractV1.js";

function intent(universeId) {
  return buildCreationIntent({
    language: "FR", audienceAge: 8, pageCount: 32, universeId,
    intentionId: "confidence", approachId: "observe", sensitivityLevel: 1,
    castRefs: [{ characterKey: "hero", profileRef: "profile:hero", role: "hero", kind: "human" }],
    questionnaireDigest: "a".repeat(64), safetyAssessmentDigest: "b".repeat(64),
  });
}

test("every sellable universe compiles through the same complete WorldLawContract", () => {
  for (const universe of UNIVERSE_OPTIONS) {
    const value = buildWorldLawContractV1(intent(universe.id));
    assert.equal(loadWorldLawContractV1(value).validation.artifactDigest, value.validation.artifactDigest);
    assert.equal(value.universeId, universe.id);
    assert.deepEqual(value.zones.map((entry) => entry.kind), ["origin", "adventure", "boundary"]);
    assert.equal(value.passages[0].originZoneId, "zone_origin");
    assert.equal(value.passages[0].adventureZoneId, "zone_adventure");
    assert.ok(value.scaleRules.every((entry) => entry.maximumMeters >= entry.minimumMeters));
    assert.ok(value.nativeElementIds.length > 0);
    assert.ok(value.forbiddenElementIds.length > 0);
  }
});

test("survival equipment is derived from medium data rather than universe wording", () => {
  const value = buildWorldLawContractV1(intent("coral_ocean"));
  const adventure = value.zones.find((entry) => entry.kind === "adventure");
  assert.equal(adventure.mediumId, "fully_underwater");
  assert.deepEqual(adventure.requiredSurvivalMechanismIds, ["breathing_voice_bubble"]);
  assert.equal(value.survivalMechanisms[0].scope, "per_character");
  assert.equal(value.survivalMechanisms[0].activeStateId, "breathing_voice_bubble_worn");
  assert.deepEqual(buildWorldLawContractV1(intent("starry_space")).survivalMechanisms, []);
});

test("world-law loading fails closed when a physical rule changes after sealing", () => {
  const value = buildWorldLawContractV1(intent("dinosaur_valley"));
  const changed = structuredClone(value);
  changed.zones[1].gravityModelId = "zero_gravity";
  assert.throws(() => loadWorldLawContractV1(changed), (error) => error.code === "world_law_digest_mismatch");
});
