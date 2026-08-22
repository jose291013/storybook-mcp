import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  acceptedWardrobeAuthorityAssets,
  assertWardrobeVisualAuthorityCoverage,
  compileWardrobeVisualAuthorityPlan,
  inspectWardrobeVisualAuthority,
  wardrobeAuthorityPrompt,
  wardrobeRepairReferencePlan,
  wardrobeVisualReferencesForScene,
  wardrobeVisualReferencesFromCheckpoint,
  WARDROBE_VISUAL_AUTHORITY_VERSION,
  WARDROBE_VISUAL_AUTHORITY_POLICY_VERSION,
} from "../src/services/wardrobeVisualAuthorityV1.js";

async function createTinyPng(filePath, background) {
  await sharp({
    create: { width: 24, height: 24, channels: 3, background },
  }).png().toFile(filePath);
}

function qaClient(result) {
  return { responses: { create: async () => ({ output_text: JSON.stringify(result) }) } };
}

function contract({ scene = 4, page = 7, outfit = "reef_explorer", description = "turquoise reef explorer suit" } = {}) {
  return {
    contract_id: "calitiki.scene-render-contract.v1",
    source: { scene_number: scene, image_page_number: page },
    cast: {
      required: [{
        character_id: "character_hero",
        name: "child_1",
        kind: "human",
        outfit: { state_id: outfit, description, source: outfit === "ordinary_outfit" ? "private_identity_binding" : "universe_outfit_registry" },
      }],
    },
  };
}

test("V1 compiles one stable generated authority for every ordinary and adventure outfit interval", () => {
  const plan = compileWardrobeVisualAuthorityPlan([
    contract(),
    contract({ scene: 5, page: 8 }),
    contract({ scene: 15, page: 31, outfit: "ordinary_outfit", description: "blue shirt and dark trousers" }),
  ]);
  assert.equal(plan.version, WARDROBE_VISUAL_AUTHORITY_VERSION);
  assert.equal(plan.authorities.length, 2);
  const adventure = plan.authorities.find((entry) => entry.stateId === "reef_explorer");
  const ordinary = plan.authorities.find((entry) => entry.stateId === "ordinary_outfit");
  assert.deepEqual(adventure.sceneNumbers, [4, 5]);
  assert.deepEqual(adventure.imagePageNumbers, [7, 8]);
  assert.deepEqual(ordinary.sceneNumbers, [15]);
  assert.deepEqual(ordinary.imagePageNumbers, [31]);
  assert.match(wardrobeAuthorityPrompt(adventure), /exactly one complete full-body child_1/i);
  assert.match(wardrobeAuthorityPrompt(adventure), /turquoise reef explorer suit/i);
  assert.match(wardrobeAuthorityPrompt(ordinary), /copy the broad garment types/i);
  assert.match(wardrobeAuthorityPrompt(ordinary), /Do not replace it with adventure clothing/i);
});

test("an accepted checkpoint is reusable only for the exact sealed wardrobe plan", () => {
  const plan = compileWardrobeVisualAuthorityPlan([contract()]);
  const entry = plan.authorities[0];
  const checkpoint = {
    version: WARDROBE_VISUAL_AUTHORITY_VERSION,
    policyVersion: WARDROBE_VISUAL_AUTHORITY_POLICY_VERSION,
    planDigest: plan.validation.artifactDigest,
    assets: [{ ...entry, status: "accepted", storageKey: "private/wardrobe.png" }],
  };
  const accepted = acceptedWardrobeAuthorityAssets(plan, checkpoint);
  assert.equal(accepted.get(entry.authorityId).storageKey, "private/wardrobe.png");
  assert.equal(assertWardrobeVisualAuthorityCoverage(plan, accepted), true);

  const changed = compileWardrobeVisualAuthorityPlan([contract({ description: "different red suit" })]);
  assert.equal(acceptedWardrobeAuthorityAssets(changed, checkpoint).size, 0);
  assert.throws(
    () => assertWardrobeVisualAuthorityCoverage(changed, new Map()),
    (error) => error.code === "wardrobe_visual_authority_incomplete",
  );
});

test("post-preview repair paths reuse the same accepted authority checkpoint", () => {
  const plan = compileWardrobeVisualAuthorityPlan([contract()]);
  const entry = plan.authorities[0];
  const checkpoint = {
    version: WARDROBE_VISUAL_AUTHORITY_VERSION,
    policyVersion: WARDROBE_VISUAL_AUTHORITY_POLICY_VERSION,
    planDigest: plan.validation.artifactDigest,
    assets: [{ ...entry, status: "accepted", storageKey: "private/wardrobe.png" }],
  };
  const references = wardrobeVisualReferencesFromCheckpoint(contract(), checkpoint);
  assert.equal(references.length, 1);
  assert.equal(references[0].storageKey, "private/wardrobe.png");
  assert.equal(wardrobeVisualReferencesFromCheckpoint(contract(), { ...checkpoint, policyVersion: 0 }).length, 0);
});

test("policy two reuses exact accepted adventure sheets from policy one and fills ordinary outfits", () => {
  const plan = compileWardrobeVisualAuthorityPlan([
    contract(),
    contract({ scene: 15, page: 31, outfit: "ordinary_outfit", description: "blue shirt and dark trousers" }),
  ]);
  const adventure = plan.authorities.find((entry) => entry.stateId === "reef_explorer");
  const legacy = {
    version: WARDROBE_VISUAL_AUTHORITY_VERSION,
    policyVersion: 1,
    planDigest: "legacy-plan-without-ordinary-outfits",
    assets: [{ ...adventure, status: "accepted", storageKey: "private/adventure.png" }],
  };
  const accepted = acceptedWardrobeAuthorityAssets(plan, legacy);
  assert.equal(accepted.size, 1);
  assert.equal(accepted.get(adventure.authorityId).storageKey, "private/adventure.png");
});

test("a scene receives only the exact active outfit authority for each character", () => {
  const scene = contract();
  const assets = new Map([
    ["active", {
      authorityId: "active",
      characterId: "character_hero",
      stateId: "reef_explorer",
      storageKey: "private/active.png",
    }],
    ["obsolete", {
      authorityId: "obsolete",
      characterId: "character_hero",
      stateId: "space_explorer",
      storageKey: "private/obsolete.png",
    }],
  ]);
  const references = wardrobeVisualReferencesForScene(scene, assets);
  assert.equal(references.length, 1);
  assert.equal(references[0].storageKey, "private/active.png");
  assert.equal(references[0].kind, "wardrobe");
  assert.equal(references[0].authorityId, "active");
  assert.equal(references[0].characterId, "character_hero");
  assert.equal(references[0].outfitStateId, "reef_explorer");
});

test("one failed outfit is edited with only its source, continuity anchor and exact wardrobe authority", () => {
  const plan = wardrobeRepairReferencePlan({
    repairPolicy: {
      targetDomains: ["wardrobe"],
      wardrobeTargets: [{
        characterId: "character_hero",
        outfitStateId: "ordinary_outfit",
        wardrobeAuthorityId: "wardrobe_hero_ordinary",
      }],
    },
    repairSource: { kind: "repair_source", path: "candidate.png" },
    sceneReferences: [
      { kind: "continuity", storageKey: "cover.png" },
      { kind: "wardrobe", characterId: "character_hero", outfitStateId: "ordinary_outfit", authorityId: "wardrobe_hero_ordinary", storageKey: "hero.png" },
      { kind: "wardrobe", characterId: "character_friend", outfitStateId: "ordinary_outfit", authorityId: "wardrobe_friend_ordinary", storageKey: "friend.png" },
      { kind: "adjacent_scene", storageKey: "previous.png" },
      { kind: "identity", characterId: "character_hero", storageKey: "raw-hero.png" },
    ],
  });
  assert.equal(plan.complete, true);
  assert.equal(plan.mode, "targeted_edit");
  assert.deepEqual(plan.references.map((reference) => reference.kind), ["repair_source", "continuity", "wardrobe"]);
  assert.equal(plan.references.at(-1).authorityId, "wardrobe_hero_ordinary");
});

test("several failed outfits recompose the scene from canonical sheets without defective or adjacent pixels", () => {
  const plan = wardrobeRepairReferencePlan({
    repairPolicy: {
      targetDomains: ["wardrobe"],
      wardrobeTargets: [
        { characterId: "character_hero", outfitStateId: "ordinary_outfit", wardrobeAuthorityId: "wardrobe_hero_ordinary" },
        { characterId: "character_friend", outfitStateId: "ordinary_outfit", wardrobeAuthorityId: "wardrobe_friend_ordinary" },
      ],
    },
    repairSource: { kind: "repair_source", path: "candidate.png" },
    sceneReferences: [
      { kind: "continuity", storageKey: "cover.png" },
      { kind: "wardrobe", characterId: "character_hero", outfitStateId: "ordinary_outfit", authorityId: "wardrobe_hero_ordinary", storageKey: "hero.png" },
      { kind: "wardrobe", characterId: "character_friend", outfitStateId: "ordinary_outfit", authorityId: "wardrobe_friend_ordinary", storageKey: "friend.png" },
      { kind: "adjacent_scene", storageKey: "previous.png" },
      { kind: "identity", characterId: "character_hero", storageKey: "raw-hero.png" },
      { kind: "identity", characterId: "character_dog", storageKey: "dog.png" },
    ],
  });
  assert.equal(plan.complete, true);
  assert.equal(plan.mode, "canonical_scene_recompose");
  assert.deepEqual(plan.references.map((reference) => reference.kind), ["continuity", "wardrobe", "wardrobe", "identity"]);
  assert.equal(plan.references.at(-1).characterId, "character_dog");
});

test("a wardrobe repair is quarantined when its exact accepted authority is absent", () => {
  const plan = wardrobeRepairReferencePlan({
    repairPolicy: {
      targetDomains: ["wardrobe"],
      wardrobeTargets: [{
        characterId: "character_hero",
        outfitStateId: "ordinary_outfit",
        wardrobeAuthorityId: "missing_authority",
      }],
    },
    repairSource: { kind: "repair_source", path: "candidate.png" },
    sceneReferences: [{ kind: "continuity", storageKey: "cover.png" }],
  });
  assert.equal(plan.complete, false);
  assert.equal(plan.mode, "quarantine");
  assert.deepEqual(plan.references, []);
});

test("conflicting descriptions for one canonical outfit fail before image spend", () => {
  assert.throws(
    () => compileWardrobeVisualAuthorityPlan([
      contract(),
      contract({ scene: 5, page: 8, description: "a contradictory red outfit" }),
    ]),
    (error) => error.code === "wardrobe_visual_authority_description_conflict",
  );
});

test("model-sheet style is advisory while identity cardinality and wardrobe stay blocking", async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "wardrobe-authority-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const imagePath = path.join(folder, "candidate.png");
  const identityPath = path.join(folder, "identity.png");
  const stylePath = path.join(folder, "style.png");
  await Promise.all([
    createTinyPng(imagePath, "#4a90e2"),
    createTinyPng(identityPath, "#d7a77b"),
    createTinyPng(stylePath, "#f4eadc"),
  ]);
  const entry = compileWardrobeVisualAuthorityPlan([contract()]).authorities[0];
  const references = {
    imagePath,
    entry,
    identityReference: { path: identityPath },
    styleReference: { path: stylePath },
  };
  const advisory = await inspectWardrobeVisualAuthority({
    ...references,
    client: qaClient({ identity: "pass", cardinality: "pass", wardrobe: "pass", style: "fail" }),
  });
  assert.equal(advisory.approved, true);
  assert.deepEqual(advisory.issueCodes, []);
  assert.deepEqual(advisory.advisoryIssueCodes, ["wardrobe_authority_style_failed"]);

  const blocked = await inspectWardrobeVisualAuthority({
    ...references,
    client: qaClient({ identity: "fail", cardinality: "pass", wardrobe: "pass", style: "pass" }),
  });
  assert.equal(blocked.approved, false);
  assert.deepEqual(blocked.issueCodes, ["wardrobe_authority_identity_failed"]);
  assert.deepEqual(blocked.advisoryIssueCodes, []);
});
