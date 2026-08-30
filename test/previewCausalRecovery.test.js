import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPreviewCausalRecovery,
  causalRecoveryPrompt,
  causalRecoveryReferences,
  consumePreviewCausalRecovery,
  previewCausalRecoveryPage,
  rehydrateCausalWardrobeRepairPolicy,
} from "../src/services/previewCausalRecovery.js";
import {
  wardrobeRepairReferencePlan,
  WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES,
} from "../src/services/wardrobeVisualAuthorityV1.js";

function quarantinedPage(pageNumber, issueCodes, wardrobeTargets = []) {
  return {
    page_number: pageNumber,
    page_type: "image",
    storageKey: `private/layout-${pageNumber}`,
    previewUrl: `/private/layout-${pageNumber}`,
    imageStorageKey: `private/image-${pageNumber}`,
    qualityStatus: "strict_quarantined",
    qualityIssueCodes: issueCodes,
    qualityRepairPolicy: { wardrobeTargets },
  };
}

test("causal recovery compiles distinct page strategies without customer prose", () => {
  const recovery = buildPreviewCausalRecovery({
    previewResult: {
      deferredIllustrationPages: [{ pageNumber: 8, issueCodes: ["provider_safety_rejection"] }],
      draftPages: [quarantinedPage(11, ["wardrobe_state_mismatch"], [{
        characterId: "character_hero",
        outfitStateId: "ordinary_outfit",
        wardrobeAuthorityId: "wardrobe_hero_ordinary",
      }])],
    },
  });

  assert.equal(recovery.available, true);
  assert.deepEqual(recovery.pages.map((page) => page.pageNumber), [8, 11]);
  assert.deepEqual(previewCausalRecoveryPage(recovery, 8).strategies, ["provider_safe_structure_first"]);
  assert.deepEqual(previewCausalRecoveryPage(recovery, 11).strategies, [
    "canonical_scene_recompose",
    "wardrobe_reference_isolation",
  ]);
  assert.equal(JSON.stringify(recovery).includes("customer sentence"), false);
});

test("causal recovery restores exact wardrobe targets retained by complete quarantine diagnostics", () => {
  const page = quarantinedPage(11, ["wardrobe_state_mismatch"]);
  page.qualityRepairPolicy.wardrobeDiagnostics = {
    targetingComplete: true,
    failedTargets: [
      {
        characterId: "character_jerome",
        outfitStateId: "ordinary_outfit",
        wardrobeAuthorityId: "wardrobe_jerome_ordinary",
      },
      {
        characterId: "character_hero",
        outfitStateId: "ordinary_outfit",
        wardrobeAuthorityId: "wardrobe_hero_ordinary",
      },
    ],
  };

  const recovery = buildPreviewCausalRecovery({
    previewResult: { draftPages: [page] },
  });

  assert.deepEqual(recovery.pages[0].wardrobeTargets, [
    {
      characterId: "character_hero",
      outfitStateId: "ordinary_outfit",
      wardrobeAuthorityId: "wardrobe_hero_ordinary",
    },
    {
      characterId: "character_jerome",
      outfitStateId: "ordinary_outfit",
      wardrobeAuthorityId: "wardrobe_jerome_ordinary",
    },
  ]);
  assert.match(causalRecoveryPrompt("BASE CONTRACT", recovery.pages[0]), /character_hero must wear only ordinary_outfit/);
  assert.match(causalRecoveryPrompt("BASE CONTRACT", recovery.pages[0]), /character_jerome must wear only ordinary_outfit/);
});

test("causal recovery never promotes incomplete diagnostic wardrobe guesses", () => {
  const page = quarantinedPage(11, ["wardrobe_state_mismatch"]);
  page.qualityRepairPolicy.wardrobeDiagnostics = {
    targetingComplete: false,
    failedTargets: [{
      characterId: "character_hero",
      outfitStateId: "ordinary_outfit",
      wardrobeAuthorityId: "wardrobe_hero_ordinary",
    }],
  };

  const recovery = buildPreviewCausalRecovery({
    previewResult: { draftPages: [page] },
  });

  assert.deepEqual(recovery.pages[0].wardrobeTargets, []);
});

test("causal recovery rehydrates an exact executable multi-person wardrobe policy from durable diagnostics", () => {
  const repairPolicy = {
    targetCodes: ["wardrobe_state_mismatch"],
    targetDomains: [],
    wardrobeTargets: [],
    wardrobeDiagnostics: {
      targetingComplete: true,
      failedTargets: [
        {
          characterId: "character_hero",
          outfitStateId: "ordinary_outfit",
          wardrobeAuthorityId: "wardrobe_hero_ordinary",
          evidenceMode: WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES,
          semanticSignature: "hero-signature",
        },
        {
          characterId: "character_jerome",
          outfitStateId: "ordinary_outfit",
          wardrobeAuthorityId: "wardrobe_jerome_ordinary",
          evidenceMode: WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES,
          semanticSignature: "jerome-signature",
        },
      ],
    },
  };
  const pageRecovery = {
    issueCodes: ["wardrobe_state_mismatch"],
    strategies: ["canonical_scene_recompose", "wardrobe_reference_isolation"],
    wardrobeTargets: [
      { characterId: "character_hero", outfitStateId: "ordinary_outfit", wardrobeAuthorityId: "wardrobe_hero_ordinary" },
      { characterId: "character_jerome", outfitStateId: "ordinary_outfit", wardrobeAuthorityId: "wardrobe_jerome_ordinary" },
    ],
  };
  const hydrated = rehydrateCausalWardrobeRepairPolicy(repairPolicy, pageRecovery);
  assert.deepEqual(hydrated.targetDomains, ["wardrobe"]);
  assert.equal(hydrated.wardrobeTargets.length, 2);
  assert.equal(hydrated.wardrobeTargets[0].semanticSignature, "hero-signature");
  assert.deepEqual(hydrated.causalRecoveryHydration, {
    version: 1,
    source: "checkpoint_diagnostics",
    targetCount: 2,
  });

  const plan = wardrobeRepairReferencePlan({
    repairPolicy: hydrated,
    repairSource: { kind: "repair_source", storageKey: "rejected.png" },
    sceneReferences: [
      { kind: "continuity", storageKey: "cover.png" },
      { kind: "wardrobe", characterId: "character_hero", characterName: "child alpha", outfitStateId: "ordinary_outfit", authorityId: "wardrobe_hero_ordinary", evidenceMode: WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES, semanticSignature: "hero-signature", description: "blue shirt and navy trousers", storageKey: "hero.png", identityBearing: true },
      { kind: "wardrobe", characterId: "character_jerome", characterName: "adult beta", outfitStateId: "ordinary_outfit", authorityId: "wardrobe_jerome_ordinary", evidenceMode: WARDROBE_EVIDENCE_MODE_BROAD_ATTRIBUTES, semanticSignature: "jerome-signature", description: "black shirt and beige trousers", storageKey: "jerome.png", identityBearing: true },
    ],
  });
  assert.equal(plan.complete, true);
  assert.equal(plan.mode, "canonical_scene_recompose");
  assert.deepEqual(plan.references.map((reference) => reference.kind), ["continuity", "wardrobe", "wardrobe"]);
  assert.equal(plan.references.some((reference) => reference.kind === "repair_source"), false);
});

test("repair-policy rehydration fails closed when diagnostics and recovery targets disagree", () => {
  const repairPolicy = {
    targetDomains: [],
    wardrobeTargets: [],
    wardrobeDiagnostics: {
      targetingComplete: true,
      failedTargets: [{
        characterId: "character_hero",
        outfitStateId: "ordinary_outfit",
        wardrobeAuthorityId: "wardrobe_hero_ordinary",
      }],
    },
  };
  const pageRecovery = {
    issueCodes: ["wardrobe_state_mismatch"],
    strategies: ["wardrobe_reference_isolation"],
    wardrobeTargets: [{
      characterId: "character_jerome",
      outfitStateId: "ordinary_outfit",
      wardrobeAuthorityId: "wardrobe_jerome_ordinary",
    }],
  };
  assert.equal(rehydrateCausalWardrobeRepairPolicy(repairPolicy, pageRecovery), repairPolicy);
  assert.equal(rehydrateCausalWardrobeRepairPolicy(repairPolicy, {
    ...pageRecovery,
    issueCodes: ["wardrobe_state_mismatch", "identity_duplicate"],
  }), repairPolicy);
});

test("an identical consumed blocker signature cannot expose another fake free retry", () => {
  const previewResult = {
    deferredIllustrationPages: [{ pageNumber: 8, issueCodes: ["provider_safety_rejection"] }],
  };
  const first = buildPreviewCausalRecovery({ previewResult });
  const consumed = consumePreviewCausalRecovery(first, "2026-08-28T12:00:00.000Z");
  const repeated = buildPreviewCausalRecovery({ previewResult, priorRecovery: consumed });

  assert.equal(repeated.signature, first.signature);
  assert.equal(repeated.available, false);
  assert.equal(repeated.repeatBlocked, true);
});

test("provider recovery removes all source pixels and selects the minimal projection", () => {
  const recovery = buildPreviewCausalRecovery({
    previewResult: { deferredIllustrationPages: [{ pageNumber: 8 }] },
  });
  const page = previewCausalRecoveryPage(recovery, 8);
  assert.deepEqual(causalRecoveryReferences([
    { kind: "continuity", storageKey: "cover" },
    { kind: "identity", storageKey: "child-photo" },
  ], page), []);
  assert.match(causalRecoveryPrompt("BASE CONTRACT", page), /PROVIDER-SAFE STRUCTURE-FIRST V1/);
  assert.match(causalRecoveryPrompt("BASE CONTRACT", page), /BASE CONTRACT/);
  const once = causalRecoveryPrompt("BASE CONTRACT", page);
  assert.equal(causalRecoveryPrompt(once, page), once);
});

test("wardrobe recovery excludes cover, adjacent and rejected pixels while deduplicating identity authority", () => {
  const recovery = buildPreviewCausalRecovery({
    previewResult: { draftPages: [quarantinedPage(11, ["wardrobe_state_mismatch"], [{
      characterId: "character_hero",
      outfitStateId: "ordinary_outfit",
      wardrobeAuthorityId: "wardrobe_hero_ordinary",
    }])] },
  });
  const page = previewCausalRecoveryPage(recovery, 11);
  const references = causalRecoveryReferences([
    { kind: "repair_source", storageKey: "rejected" },
    { kind: "adjacent_scene", storageKey: "adjacent" },
    { kind: "continuity", storageKey: "cover" },
    { kind: "identity", storageKey: "hero-photo", characterId: "character_hero" },
    { kind: "wardrobe", storageKey: "hero-photo", characterId: "character_hero", identityBearing: true },
    { kind: "wardrobe", storageKey: "garment", characterId: "character_friend" },
    { kind: "identity", storageKey: "friend-photo", characterId: "character_friend" },
  ], page);

  assert.deepEqual(references.map((reference) => reference.kind), ["wardrobe", "wardrobe", "identity"]);
  assert.equal(references.some((reference) => reference.storageKey === "cover"), false);
  assert.equal(references.some((reference) => reference.storageKey === "adjacent"), false);
  assert.equal(references.filter((reference) => reference.storageKey === "hero-photo").length, 1);
  assert.match(causalRecoveryPrompt("BASE CONTRACT", page), /WARDROBE-ISOLATED RECOMPOSITION V2/);
  assert.match(causalRecoveryPrompt("BASE CONTRACT", page), /approved cover remains private QA evidence only/i);
  assert.match(causalRecoveryPrompt("BASE CONTRACT", page), /character_hero must wear only ordinary_outfit/);
});

test("monotonic wardrobe recovery edits the improved candidate with only the residual authority", () => {
  const page = quarantinedPage(11, ["wardrobe_state_mismatch"], [{
    characterId: "character_hero",
    outfitStateId: "ordinary_outfit",
    wardrobeAuthorityId: "wardrobe_hero_ordinary",
  }]);
  page.qualityRepairPolicy.monotonicProgress = { eligibleForTargetedEdit: true, stage: 1 };
  const recovery = buildPreviewCausalRecovery({ previewResult: { draftPages: [page] } });
  const pageRecovery = recovery.pages[0];
  assert.deepEqual(pageRecovery.strategies, ["monotonic_targeted_edit", "wardrobe_reference_isolation"]);

  const references = causalRecoveryReferences([
    { kind: "repair_source", storageKey: "improved-candidate" },
    { kind: "continuity", storageKey: "cover" },
    { kind: "adjacent_scene", storageKey: "previous" },
    { kind: "wardrobe", storageKey: "hero-authority", characterId: "character_hero" },
    { kind: "identity", storageKey: "hero-identity", characterId: "character_hero" },
  ], pageRecovery);
  assert.deepEqual(references.map((reference) => reference.kind), ["repair_source", "wardrobe", "identity"]);
  assert.match(causalRecoveryPrompt("BASE CONTRACT", pageRecovery), /MONOTONIC WARDROBE EDIT V1/);
  assert.doesNotMatch(causalRecoveryPrompt("BASE CONTRACT", pageRecovery), /rejected-candidate pixels are deliberately excluded/i);
});

test("repeated failures of one wardrobe authority escalate once to authority-level reconstruction", () => {
  const target = {
    characterId: "character_hero",
    outfitStateId: "ordinary_outfit",
    wardrobeAuthorityId: "wardrobe_hero_ordinary",
  };
  const recovery = buildPreviewCausalRecovery({
    previewResult: {
      draftPages: [
        quarantinedPage(3, ["wardrobe_state_mismatch"], [target]),
        quarantinedPage(11, ["wardrobe_state_mismatch"], [target]),
      ],
    },
    priorRecovery: {
      version: 1,
      signature: "old-policy-signature",
      consumedAt: "2026-08-28T09:00:00.000Z",
      attemptedSignatures: ["old-policy-signature"],
    },
  });
  assert.equal(recovery.available, true);
  assert.deepEqual(recovery.attemptedSignatures, []);
  for (const page of recovery.pages) {
    assert.deepEqual(page.sharedAuthorityIds, ["wardrobe_hero_ordinary"]);
    assert.ok(page.strategies.includes("wardrobe_authority_satisfiability_recovery"));
  }

  const references = causalRecoveryReferences([
    { kind: "repair_source", storageKey: "rejected-page" },
    { kind: "continuity", storageKey: "cover" },
    { kind: "adjacent_scene", storageKey: "previous" },
    { kind: "wardrobe", storageKey: "hero-photo", characterId: "character_hero" },
    { kind: "identity", storageKey: "hero-photo", characterId: "character_hero" },
  ], recovery.pages[0]);
  assert.deepEqual(references.map((reference) => reference.kind), ["wardrobe"]);
  assert.equal(references.some((reference) => reference.storageKey === "rejected-page"), false);
  assert.match(causalRecoveryPrompt("BASE CONTRACT", recovery.pages[0]), /SHARED WARDROBE AUTHORITY V1/);
  assert.match(causalRecoveryPrompt("BASE CONTRACT", recovery.pages[0]), /broad garment categories/);
});
