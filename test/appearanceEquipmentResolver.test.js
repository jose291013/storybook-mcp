import test from "node:test";
import assert from "node:assert/strict";

import {
  coverEquipmentLocksForWorld,
  garmentOnlyDescription,
  resolveAppearanceEquipment,
} from "../src/services/appearanceEquipmentResolver.js";
import { buildSceneContinuity } from "../src/services/visualContinuity.js";

test("appearance resolver separates clothing from underwater life-support equipment", () => {
  const appearance = resolveAppearanceEquipment({
    characterName: "Mathéo",
    outfitDescription: "a turquoise wetsuit with reef shoes and the story-established transparent breathing bubble or helmet",
    equipmentStateIds: ["breathing_voice_bubble_worn"],
  });

  assert.equal(appearance.outfit_description, "a turquoise wetsuit with reef shoes");
  assert.equal(appearance.equipment.length, 1);
  assert.deepEqual(appearance.equipment[0].provides, ["breathing", "communication", "clear_vision", "pressure_protection"]);
  assert.ok(appearance.forbidden_equipment.some((item) => item.includes("goggles")));
  assert.ok(appearance.forbidden_equipment.some((item) => item.includes("snorkel")));
});

test("garment-only normalization also repairs legacy helmet and goggle outfit locks", () => {
  assert.equal(
    garmentOnlyDescription("a navy space suit with boots and a transparent helmet whenever outside the protected cabin"),
    "a navy space suit with boots",
  );
  assert.equal(
    garmentOnlyDescription("a teal flight suit, secured boots and protective goggles only when useful"),
    "a teal flight suit, secured boots",
  );
});

test("coral-ocean cover receives exactly one canonical equipment state per visible traveler", () => {
  assert.deepEqual(coverEquipmentLocksForWorld({
    universeId: "coral_ocean",
    characterNames: ["Mathéo", "Mathéo", "Nolan"],
  }), [
    { name: "Mathéo", equipment_state_ids: ["breathing_voice_bubble_worn"] },
    { name: "Nolan", equipment_state_ids: ["breathing_voice_bubble_worn"] },
  ]);
});

test("cover continuity forbids redundant goggles when the canonical bubble is worn", () => {
  const continuity = buildSceneContinuity({
    blueprint: { hero: { name: "Mathéo", outfit_lock: "a turquoise wetsuit and reef shoes" }, cast: [] },
    characterCanons: [{ name: "Mathéo", role: "child", outfit_lock: "a grey t-shirt and shorts" }],
    castPresent: ["Mathéo"],
    scenePrompt: "Mathéo floats underwater above a coral reef",
    wardrobeLocks: [{ name: "Mathéo", outfit: "a turquoise wetsuit and reef shoes" }],
    equipmentLocks: [{ name: "Mathéo", equipment_state_ids: ["breathing_voice_bubble_worn"] }],
  });

  assert.match(continuity.sceneContract, /EXCLUSIVE FUNCTIONAL EQUIPMENT/u);
  assert.match(continuity.sceneContract, /diving goggles/u);
  assert.equal(continuity.sceneFidelityContract.equipment_contracts[0].required_equipment.length, 1);
  assert.ok(continuity.sceneFidelityContract.equipment_contracts[0].forbidden_equipment.includes("a snorkel"));
});
