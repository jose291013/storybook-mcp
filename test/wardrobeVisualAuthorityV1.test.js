import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  acceptedWardrobeAuthorityAssets,
  assertWardrobeVisualAuthorityCoverage,
  assertWardrobeVisualAuthoritySatisfiability,
  compileWardrobeVisualAuthorityPlan,
  directWardrobeAuthorityAsset,
  inspectWardrobeVisualAuthority,
  wardrobeAuthorityPrompt,
  wardrobeRepairReferencePlan,
  wardrobeVisualReferencesForScene,
  wardrobeVisualReferencesFromCheckpoint,
  WARDROBE_VISUAL_AUTHORITY_VERSION,
  WARDROBE_VISUAL_AUTHORITY_POLICY_VERSION,
  WARDROBE_AUTHORITY_MODE_DIRECT_IDENTITY_OUTFIT,
  WARDROBE_AUTHORITY_MODE_GARMENT_ONLY,
  WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES,
  WARDROBE_EVIDENCE_MODE_EXACT_DESIGN,
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

test("V1 compiles direct identity clothing and garment-only adventure authorities", () => {
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
  assert.equal(adventure.authorityMode, WARDROBE_AUTHORITY_MODE_GARMENT_ONLY);
  assert.equal(ordinary.authorityMode, WARDROBE_AUTHORITY_MODE_DIRECT_IDENTITY_OUTFIT);
  assert.equal(adventure.evidenceMode, WARDROBE_EVIDENCE_MODE_EXACT_DESIGN);
  assert.equal(ordinary.evidenceMode, WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES);
  assert.ok(adventure.semanticSignature);
  assert.ok(ordinary.semanticSignature);
  assert.match(wardrobeAuthorityPrompt(adventure), /anonymous headless mannequin/i);
  assert.match(wardrobeAuthorityPrompt(adventure), /no person, face/i);
  assert.match(wardrobeAuthorityPrompt(adventure), /turquoise reef explorer suit/i);
  assert.throws(
    () => wardrobeAuthorityPrompt(ordinary),
    (error) => error.code === "wardrobe_visual_authority_direct_source",
  );
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

test("the current policy rejects face-bearing garment sheets from older policies", () => {
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
  assert.equal(accepted.size, 0);
});

test("an ordinary outfit is sealed directly from the durable private identity photo", () => {
  const plan = compileWardrobeVisualAuthorityPlan([
    contract({ scene: 15, page: 31, outfit: "ordinary_outfit", description: "blue shirt and dark trousers" }),
  ]);
  const authority = plan.authorities[0];
  const asset = directWardrobeAuthorityAsset(authority, {
    storageKey: "reference-photos/hero.jpg",
  });
  assert.equal(asset.storageKey, "reference-photos/hero.jpg");
  assert.equal(asset.identityBearing, true);
  assert.equal(asset.directSource, true);
  assert.equal(asset.evidenceMode, WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES);
  assert.equal(asset.semanticSignature, authority.semanticSignature);
});

test("a sealed authority is satisfiable only when generation and QA share the immutable binding", () => {
  const plan = compileWardrobeVisualAuthorityPlan([
    contract(),
    contract({ scene: 15, page: 31, outfit: "ordinary_outfit", description: "blue shirt and dark trousers" }),
  ]);
  const assets = new Map(plan.authorities.map((entry) => [entry.authorityId, entry.authorityMode === WARDROBE_AUTHORITY_MODE_DIRECT_IDENTITY_OUTFIT
    ? directWardrobeAuthorityAsset(entry, { storageKey: "reference-photos/hero.jpg" })
    : {
      ...entry,
      identityBearing: false,
      status: "accepted",
      storageKey: "private/reef.png",
    }]));
  const manifest = assertWardrobeVisualAuthoritySatisfiability(plan, assets);
  assert.equal(manifest.bindings.length, 2);
  assert.ok(manifest.bindingDigest);

  const adventure = plan.authorities.find((entry) => entry.stateId === "reef_explorer");
  assets.set(adventure.authorityId, {
    ...assets.get(adventure.authorityId),
    evidenceMode: WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES,
  });
  assert.throws(
    () => assertWardrobeVisualAuthoritySatisfiability(plan, assets),
    (error) => error.code === "wardrobe_visual_authority_unsatisfiable"
      && error.issues.some((issue) => issue.message === "evidence_mode_mismatch"),
  );
});

test("a scene receives only the exact active outfit authority for each character", () => {
  const scene = contract();
  const authority = compileWardrobeVisualAuthorityPlan([scene]).authorities[0];
  const assets = new Map([
    ["active", {
      ...authority,
      authorityId: "active",
      storageKey: "private/active.png",
      identityBearing: false,
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
  assert.equal(references[0].characterName, "child_1");
  assert.equal(references[0].outfitStateId, "reef_explorer");
  assert.equal(references[0].description, authority.description);
  assert.equal(references[0].evidenceMode, WARDROBE_EVIDENCE_MODE_EXACT_DESIGN);
  assert.equal(references[0].semanticSignature, authority.semanticSignature);
  assert.equal(references[0].identityBearing, false);
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
      { kind: "wardrobe", characterId: "character_hero", characterName: "child alpha", outfitStateId: "ordinary_outfit", authorityId: "wardrobe_hero_ordinary", evidenceMode: WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES, description: "blue shirt and navy trousers", storageKey: "hero.png", identityBearing: true },
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

test("one failed adventure outfit retains its separate identity reference", () => {
  const plan = wardrobeRepairReferencePlan({
    repairPolicy: {
      targetDomains: ["wardrobe"],
      wardrobeTargets: [{
        characterId: "character_hero",
        outfitStateId: "reef_explorer",
        wardrobeAuthorityId: "wardrobe_hero_reef",
      }],
    },
    repairSource: { kind: "repair_source", path: "candidate.png" },
    sceneReferences: [
      { kind: "continuity", storageKey: "cover.png" },
      { kind: "wardrobe", characterId: "character_hero", characterName: "child alpha", outfitStateId: "reef_explorer", authorityId: "wardrobe_hero_reef", storageKey: "reef-garment.png", identityBearing: false },
      { kind: "identity", characterId: "character_hero", storageKey: "reference-photos/hero.jpg" },
    ],
  });
  assert.equal(plan.complete, true);
  assert.deepEqual(plan.references.map((reference) => reference.kind), ["repair_source", "continuity", "wardrobe", "identity"]);
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
      { kind: "wardrobe", characterId: "character_hero", characterName: "child alpha", outfitStateId: "ordinary_outfit", authorityId: "wardrobe_hero_ordinary", evidenceMode: WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES, description: "blue shirt and navy trousers", storageKey: "hero.png", identityBearing: true },
      { kind: "wardrobe", characterId: "character_friend", characterName: "adult beta", outfitStateId: "ordinary_outfit", authorityId: "wardrobe_friend_ordinary", evidenceMode: WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES, description: "black shirt and beige trousers", storageKey: "friend.png", identityBearing: true },
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

test("a repair target cannot bind a wardrobe authority with a different semantic signature", () => {
  const plan = wardrobeRepairReferencePlan({
    repairPolicy: {
      targetDomains: ["wardrobe"],
      wardrobeTargets: [{
        characterId: "character_hero",
        outfitStateId: "ordinary_outfit",
        wardrobeAuthorityId: "wardrobe_hero_ordinary",
        semanticSignature: "expected-signature",
      }],
    },
    repairSource: { kind: "repair_source", path: "candidate.png" },
    sceneReferences: [
      { kind: "continuity", storageKey: "cover.png" },
      {
        kind: "wardrobe",
        characterId: "character_hero",
        outfitStateId: "ordinary_outfit",
        authorityId: "wardrobe_hero_ordinary",
        semanticSignature: "foreign-signature",
        storageKey: "hero.png",
        identityBearing: true,
      },
    ],
  });
  assert.equal(plan.complete, false);
  assert.deepEqual(plan.references, []);
});

test("a broad wardrobe recomposition fails closed without its canonical alias and garment description", () => {
  const base = {
    kind: "wardrobe",
    characterId: "character_hero",
    characterName: "child alpha",
    outfitStateId: "ordinary_outfit",
    authorityId: "wardrobe_hero_ordinary",
    evidenceMode: WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES,
    semanticSignature: "expected-signature",
    storageKey: "hero.png",
    identityBearing: true,
  };
  const repairPolicy = {
    targetDomains: ["wardrobe"],
    wardrobeTargets: [{
      characterId: "character_hero",
      outfitStateId: "ordinary_outfit",
      wardrobeAuthorityId: "wardrobe_hero_ordinary",
      evidenceMode: WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES,
      semanticSignature: "expected-signature",
    }],
  };
  for (const reference of [
    { ...base, characterName: "", description: "blue shirt and navy trousers" },
    { ...base, description: "" },
  ]) {
    const plan = wardrobeRepairReferencePlan({
      repairPolicy,
      repairSource: { kind: "repair_source", path: "candidate.png" },
      sceneReferences: [{ kind: "continuity", storageKey: "cover.png" }, reference],
    });
    assert.equal(plan.complete, false);
    assert.deepEqual(plan.references, []);
  }
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

test("garment-sheet style is advisory while mannequin cardinality and wardrobe stay blocking", async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "wardrobe-authority-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const imagePath = path.join(folder, "candidate.png");
  const stylePath = path.join(folder, "style.png");
  await Promise.all([
    createTinyPng(imagePath, "#4a90e2"),
    createTinyPng(stylePath, "#f4eadc"),
  ]);
  const entry = compileWardrobeVisualAuthorityPlan([contract()]).authorities[0];
  const references = {
    imagePath,
    entry,
    styleReference: { path: stylePath },
  };
  const advisory = await inspectWardrobeVisualAuthority({
    ...references,
    client: qaClient({ garment_only: "pass", cardinality: "pass", wardrobe: "pass", style: "fail" }),
  });
  assert.equal(advisory.approved, true);
  assert.deepEqual(advisory.issueCodes, []);
  assert.deepEqual(advisory.advisoryIssueCodes, ["wardrobe_authority_style_failed"]);

  const blocked = await inspectWardrobeVisualAuthority({
    ...references,
    client: qaClient({ garment_only: "fail", cardinality: "pass", wardrobe: "pass", style: "pass" }),
  });
  assert.equal(blocked.approved, false);
  assert.deepEqual(blocked.issueCodes, ["wardrobe_authority_garment_only_failed"]);
  assert.deepEqual(blocked.advisoryIssueCodes, []);
});
