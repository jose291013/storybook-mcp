import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSceneStateBoundaryV1,
  sceneStateBoundaryRenderRules,
  sceneTimelineForJourneyPhase,
} from "../src/contracts/sceneStateBoundaryV1.js";

const phases = [
  "origin_ordinary",
  "passage_discovery",
  "journey_preparation",
  "outbound_crossing",
  "adventure",
  "inbound_crossing",
  "restoration_and_storage",
  "origin_ordinary",
];

const lifecycle = {
  travelerKeys: ["hero", "nolan"],
  validation: { artifactDigest: "a".repeat(64) },
};

const characterIdsByKey = new Map([
  ["hero", "character_hero"],
  ["nolan", "character_nolan"],
  ["alexandra", "character_alexandra"],
  ["jerome", "character_jerome"],
]);

test("the scene boundary prevents future world, wardrobe and cast state from leaking backward", () => {
  const boundaries = phases.map((phase, index) => buildSceneStateBoundaryV1({
    journeyLifecycle: lifecycle,
    sceneState: { phase, sceneNumber: index + 1 },
    characterIdsByKey,
  }));

  for (const boundary of boundaries.slice(0, 3)) {
    assert.equal(boundary.cameraSide, "origin");
    assert.equal(boundary.destinationEnvironmentAllowed, false);
    assert.ok(boundary.forbiddenStateIds.includes("cover_location_inherited"));
    assert.ok(boundary.forbiddenStateIds.includes("cover_wardrobe_inherited"));
    assert.ok(sceneStateBoundaryRenderRules(boundary).some((rule) => rule.includes("identity and rendering style only")));
  }
  assert.equal(boundaries[0].passageMode, "forbidden");
  assert.equal(boundaries[1].passageMode, "required_closed");
  assert.ok(boundaries[1].requiredStateIds.includes("adventure_outfits_beside_passage"));
  assert.ok(boundaries[1].forbiddenStateIds.includes("adventure_outfits_worn"));
  assert.equal(boundaries[2].travelerOutfitMode, "adventure");
  assert.ok(boundaries[2].forbiddenStateIds.includes("traveler_beyond_passage"));
});

test("both crossings select the boundary instant and witnesses never acquire destination presence", () => {
  const outbound = buildSceneStateBoundaryV1({
    journeyLifecycle: lifecycle,
    sceneState: { phase: "outbound_crossing" },
    characterIdsByKey,
  });
  const adventure = buildSceneStateBoundaryV1({
    journeyLifecycle: lifecycle,
    sceneState: { phase: "adventure" },
    characterIdsByKey,
  });
  const inbound = buildSceneStateBoundaryV1({
    journeyLifecycle: lifecycle,
    sceneState: { phase: "inbound_crossing" },
    characterIdsByKey,
  });

  assert.deepEqual(sceneTimelineForJourneyPhase({ phase: "outbound_crossing" }), {
    locationBeforeId: "location_origin",
    locationAfterId: "location_adventure",
    visiblePhase: "during",
  });
  assert.deepEqual(sceneTimelineForJourneyPhase({ phase: "inbound_crossing" }), {
    locationBeforeId: "location_adventure",
    locationAfterId: "location_origin",
    visiblePhase: "during",
  });
  assert.equal(outbound.cameraSide, "boundary");
  assert.equal(inbound.cameraSide, "boundary");
  assert.deepEqual(adventure.originWitnessCharacterIds, ["character_alexandra", "character_jerome"]);
  assert.ok(adventure.forbiddenStateIds.includes("origin_witness_in_adventure"));
});

test("restoration retires adventure wardrobe and equipment only on the origin side", () => {
  const restoration = buildSceneStateBoundaryV1({
    journeyLifecycle: lifecycle,
    sceneState: { phase: "restoration_and_storage" },
    characterIdsByKey,
  });
  assert.equal(restoration.cameraSide, "origin");
  assert.equal(restoration.travelerOutfitMode, "ordinary");
  assert.ok(restoration.requiredStateIds.includes("adventure_outfits_stored_at_boundary"));
  assert.ok(restoration.requiredStateIds.includes("journey_equipment_stored"));
  assert.ok(restoration.forbiddenStateIds.includes("adventure_outfits_worn"));
  assert.match(restoration.digest, /^[a-f0-9]{64}$/u);
});
