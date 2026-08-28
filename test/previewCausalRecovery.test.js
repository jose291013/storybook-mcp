import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPreviewCausalRecovery,
  causalRecoveryPrompt,
  causalRecoveryReferences,
  consumePreviewCausalRecovery,
  previewCausalRecoveryPage,
} from "../src/services/previewCausalRecovery.js";

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
  assert.deepEqual(previewCausalRecoveryPage(recovery, 8).strategies, ["provider_safe_reexpression"]);
  assert.deepEqual(previewCausalRecoveryPage(recovery, 11).strategies, [
    "canonical_scene_recompose",
    "wardrobe_reference_isolation",
  ]);
  assert.equal(JSON.stringify(recovery).includes("customer sentence"), false);
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

test("provider recovery removes all source pixels and changes the prompt", () => {
  const recovery = buildPreviewCausalRecovery({
    previewResult: { deferredIllustrationPages: [{ pageNumber: 8 }] },
  });
  const page = previewCausalRecoveryPage(recovery, 8);
  assert.deepEqual(causalRecoveryReferences([
    { kind: "continuity", storageKey: "cover" },
    { kind: "identity", storageKey: "child-photo" },
  ], page), []);
  assert.match(causalRecoveryPrompt("BASE CONTRACT", page), /PROVIDER-SAFE RE-EXPRESSION V1/);
  assert.match(causalRecoveryPrompt("BASE CONTRACT", page), /BASE CONTRACT/);
});

test("wardrobe recovery excludes adjacent and rejected pixels and deduplicates identity authority", () => {
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

  assert.deepEqual(references.map((reference) => reference.kind), ["continuity", "wardrobe", "wardrobe", "identity"]);
  assert.equal(references.some((reference) => reference.storageKey === "adjacent"), false);
  assert.equal(references.filter((reference) => reference.storageKey === "hero-photo").length, 1);
  assert.match(causalRecoveryPrompt("BASE CONTRACT", page), /character_hero must wear only ordinary_outfit/);
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
    { kind: "continuity", storageKey: "cover" },
    { kind: "adjacent_scene", storageKey: "previous" },
    { kind: "wardrobe", storageKey: "hero-photo", characterId: "character_hero" },
    { kind: "identity", storageKey: "hero-photo", characterId: "character_hero" },
  ], recovery.pages[0]);
  assert.deepEqual(references.map((reference) => reference.kind), ["wardrobe"]);
  assert.match(causalRecoveryPrompt("BASE CONTRACT", recovery.pages[0]), /SHARED WARDROBE AUTHORITY V1/);
  assert.match(causalRecoveryPrompt("BASE CONTRACT", recovery.pages[0]), /broad garment categories/);
});
