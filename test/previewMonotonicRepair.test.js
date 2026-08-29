import assert from "node:assert/strict";
import test from "node:test";
import { monotonicWardrobeRepairProgress } from "../src/services/previewMonotonicRepair.js";

function target(characterId) {
  return {
    characterId,
    outfitStateId: "ordinary_outfit",
    wardrobeAuthorityId: `wardrobe_${characterId}_ordinary`,
    evidenceMode: "broad_garment_attributes",
    semanticSignature: `${characterId}-signature`,
  };
}

function policy(targets, { domains = ["wardrobe"], complete = true } = {}) {
  return {
    version: 7,
    targetDomains: domains,
    targetCodes: domains.map((domain) => `${domain}_failure`),
    classifications: domains.map((domain) => ({ domain })),
    wardrobeTargets: targets,
    wardrobeDiagnostics: {
      targetingComplete: complete,
      failedTargets: targets,
    },
  };
}

test("strict wardrobe QA may checkpoint an exact two-to-one target improvement", () => {
  const hero = target("character_hero");
  const adult = target("character_jerome");
  const progress = monotonicWardrobeRepairProgress(
    policy([hero, adult]),
    policy([hero]),
  );

  assert.equal(progress.previousTargetCount, 2);
  assert.equal(progress.remainingTargetCount, 1);
  assert.equal(progress.resolvedTargetCount, 1);
  assert.deepEqual(progress.policy.wardrobeTargets, [hero]);
  assert.equal(progress.policy.monotonicProgress.eligibleForTargetedEdit, true);
  assert.deepEqual(progress.policy.targetDomains, ["wardrobe"]);
});

test("monotonic repair rejects no-progress, replacement targets and mixed domains", () => {
  const hero = target("character_hero");
  const adult = target("character_jerome");
  const stranger = target("character_stranger");
  assert.equal(monotonicWardrobeRepairProgress(policy([hero, adult]), policy([hero, adult])), null);
  assert.equal(monotonicWardrobeRepairProgress(policy([hero, adult]), policy([stranger])), null);
  assert.equal(monotonicWardrobeRepairProgress(policy([hero, adult]), policy([hero], {
    domains: ["wardrobe", "identity"],
  })), null);
  assert.equal(monotonicWardrobeRepairProgress(policy([hero, adult]), policy([hero], {
    complete: false,
  })), null);
});
