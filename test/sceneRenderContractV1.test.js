import assert from "node:assert/strict";
import test from "node:test";

import {
  compileSceneRenderContractV1,
  SCENE_RENDER_CONTRACT_ID,
} from "../src/contracts/sceneRenderContractV1.js";
import { buildSceneContinuity } from "../src/services/visualContinuity.js";

function source(overrides = {}) {
  return {
    contract_source: "narrative_book_spec_v3_scene_render_contract_v1",
    artifact_digest: "a".repeat(64),
    universe_id: "enchanted_forest",
    scene_number: 4,
    image_page_number: 9,
    character_registry: [
      { character_id: "character_hero", name: "Mathéo", kind: "human" },
      { character_id: "character_brother", name: "Nolan", kind: "human" },
      { character_id: "character_mother", name: "Alexandra", kind: "human" },
    ],
    visible_character_ids: ["character_hero", "character_brother"],
    forbidden_character_ids: ["character_mother"],
    wardrobe_states: [
      { character_id: "character_hero", outfit_state_id: "forest_explorer", equipment_state_ids: [] },
      { character_id: "character_brother", outfit_state_id: "ordinary_outfit", equipment_state_ids: [] },
    ],
    named_characters: [
      { character_id: "character_hero", name: "Mathéo", action: "observe le pont" },
      { character_id: "character_brother", name: "Nolan", action: "attend" },
    ],
    main_action: { subject: "Mathéo", verb: "observe", target: "le pont" },
    visual_entity_states: [],
    forbidden_elements: ["no duplicate bridge"],
    render_snapshot: {
      location: "vieux pont",
      physical_medium: "breathable_air",
      visible_phase: "after",
      camera_environment: null,
      forbidden: [],
    },
    ...overrides,
  };
}

test("SceneRenderContract v1 resolves one exact cast partition and concrete outfit per visible identity", () => {
  const contract = compileSceneRenderContractV1({
    sceneContract: source(),
    aliases: [
      { name: "Mathéo", alias: "hero child" },
      { name: "Nolan", alias: "family member 2" },
      { name: "Alexandra", alias: "family member 3" },
    ],
    ordinaryOutfits: new Map([["Nolan", "plain white T-shirt, red shorts and red sandals"]]),
  });
  assert.equal(contract.contract_id, SCENE_RENDER_CONTRACT_ID);
  assert.equal(contract.cast.required.length, 2);
  assert.equal(contract.cast.forbidden.length, 1);
  assert.match(contract.cast.required[0].outfit.description, /moss-green explorer jacket/u);
  assert.equal(contract.cast.required[1].outfit.description, "plain white T-shirt, red shorts and red sandals");
  assert.equal(contract.cast.forbidden[0].exact_quantity, 0);
  assert.match(contract.validation.artifact_digest, /^[a-f0-9]{64}$/u);
});

test("SceneRenderContract v1 fails before generation when a wardrobe state has no concrete binding", () => {
  assert.throws(
    () => compileSceneRenderContractV1({
      sceneContract: source({
        wardrobe_states: [
          { character_id: "character_hero", outfit_state_id: "unknown_outfit", equipment_state_ids: [] },
          { character_id: "character_brother", outfit_state_id: "ordinary_outfit", equipment_state_ids: [] },
        ],
      }),
      ordinaryOutfits: new Map([["Nolan", "plain white T-shirt"]]),
    }),
    (error) => error.code === "scene_render_outfit_state_unknown",
  );
});

test("the same compiler resolves the first canonical outfit in every sellable universe", () => {
  const cases = [
    ["enchanted_forest", "forest_explorer", /moss-green explorer jacket/u],
    ["starry_space", "space_explorer", /navy and turquoise child-safe space suit/u],
    ["coral_ocean", "reef_explorer", /turquoise and coral full-body/u],
    ["cloud_castle", "sky_explorer", /pale-blue windproof jacket/u],
    ["dinosaur_valley", "field_explorer", /sand-colored long-sleeve field shirt/u],
    ["wonder_city", "workshop_apprentice", /teal rolled-sleeve top/u],
  ];
  for (const [universeId, outfitStateId, expected] of cases) {
    const contract = compileSceneRenderContractV1({
      sceneContract: source({
        universe_id: universeId,
        character_registry: [{ character_id: "character_hero", name: "Mathéo", kind: "human" }],
        visible_character_ids: ["character_hero"],
        forbidden_character_ids: [],
        wardrobe_states: [{ character_id: "character_hero", outfit_state_id: outfitStateId, equipment_state_ids: [] }],
        named_characters: [{ character_id: "character_hero", name: "Mathéo", action: "observe" }],
      }),
    });
    assert.match(contract.cast.required[0].outfit.description, expected);
  }
});

test("an incomplete or overlapping cast partition fails before image generation", () => {
  assert.throws(
    () => compileSceneRenderContractV1({
      sceneContract: source({ forbidden_character_ids: ["character_hero", "character_mother"] }),
      ordinaryOutfits: new Map([["Nolan", "plain white T-shirt"]]),
    }),
    (error) => error.code === "scene_render_cast_partition_overlap",
  );
  assert.throws(
    () => compileSceneRenderContractV1({
      sceneContract: source({ forbidden_character_ids: [] }),
      ordinaryOutfits: new Map([["Nolan", "plain white T-shirt"]]),
    }),
    (error) => error.code === "scene_render_cast_partition_incomplete",
  );
});

test("the V3 image adapter uses the concrete render contract instead of photo wardrobe fallback", () => {
  const continuity = buildSceneContinuity({
    blueprint: {
      hero: { name: "Mathéo", outfit_lock: "blue photo T-shirt" },
      cast: [
        { name: "Nolan", role: "family", outfit_lock: "white photo T-shirt" },
        { name: "Alexandra", role: "family", outfit_lock: "turquoise photo top" },
      ],
    },
    characterCanons: [
      { name: "Mathéo", role: "child", photoId: "matheo.jpg", outfit_lock: "blue photo T-shirt" },
      { name: "Nolan", role: "family", photoId: "nolan.jpg", outfit_lock: "white photo T-shirt" },
      { name: "Alexandra", role: "family", outfit_lock: "turquoise photo top" },
    ],
    castPresent: ["Mathéo", "Nolan"],
    structuredSceneContract: source(),
  });
  assert.ok(continuity.sceneFidelityContract.scene_render_contract);
  assert.match(continuity.sceneContract, /SOLE VISUAL AUTHORITY/u);
  assert.match(continuity.characterFingerprints[0], /moss-green explorer jacket/u);
  assert.doesNotMatch(continuity.characterFingerprints[0], /blue photo T-shirt/u);
  assert.equal(
    continuity.sceneFidelityContract.wardrobe_contracts[1].required_outfit,
    "white photo T-shirt",
  );
  assert.equal(continuity.referenceImages[0].kind, "wardrobe");
  assert.match(continuity.referenceImages[0].label, /ordinary_outfit/u);
  assert.equal(continuity.referenceImages[0].characterId, "character_brother");
  assert.equal(continuity.referenceImages[0].outfitStateId, "ordinary_outfit");
  assert.match(continuity.referenceImages[0].authorityId, /private_identity_binding/u);
  assert.equal(continuity.referenceImages.filter((reference) => reference.kind === "identity").length, 2);
});

test("split wardrobe authorities keep raw identity only for garment-only outfits", () => {
  const wardrobeAuthorities = [
    { kind: "wardrobe", characterId: "character_hero", outfitStateId: "forest_explorer", authorityId: "wardrobe_hero_forest", storageKey: "private/hero-forest.png", identityBearing: false },
    { kind: "wardrobe", characterId: "character_brother", outfitStateId: "ordinary_outfit", authorityId: "wardrobe_brother_ordinary", storageKey: "reference-photos/nolan.jpg", identityBearing: true },
  ];
  const continuity = buildSceneContinuity({
    blueprint: {
      hero: { name: "Mathéo", outfit_lock: "blue photo T-shirt" },
      cast: [{ name: "Nolan", role: "family", outfit_lock: "white photo T-shirt" }],
    },
    characterCanons: [
      { name: "Mathéo", role: "child", photoId: "matheo.jpg", outfit_lock: "blue photo T-shirt" },
      { name: "Nolan", role: "family", photoId: "nolan.jpg", outfit_lock: "white photo T-shirt" },
    ],
    castPresent: ["Mathéo", "Nolan"],
    structuredSceneContract: source(),
    wardrobeAuthorityReferences: wardrobeAuthorities,
  });
  assert.deepEqual(
    continuity.referenceImages.filter((reference) => reference.kind === "wardrobe").map((reference) => reference.authorityId),
    ["wardrobe_hero_forest", "wardrobe_brother_ordinary"],
  );
  assert.equal(continuity.referenceImages.filter((reference) => reference.kind === "identity").length, 2);
  const identities = continuity.referenceImages.filter((reference) => reference.kind === "identity");
  assert.equal(identities.find((reference) => reference.characterId === "character_hero").generationEligible, true);
  assert.equal(identities.find((reference) => reference.characterId === "character_brother").generationEligible, false);
  assert.equal(continuity.referenceImages.some((reference) => String(reference.authorityId || "").startsWith("private_identity_binding:")), false);
});
