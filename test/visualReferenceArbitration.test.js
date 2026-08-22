import assert from "node:assert/strict";
import test from "node:test";
import {
  VISUAL_REFERENCE_ARBITRATION_VERSION,
  VISUAL_REFERENCE_POLICY_STAGES,
  nextVisualReferencePolicyStage,
  referencesForVisualPolicy,
  visualReferenceCompatibility,
} from "../src/services/visualReferenceArbitration.js";
import { strictV3IllustrationRetryStrategy } from "../src/services/imageQualityGate.js";

function page({ medium = "fully_underwater", location = "reef", outfit = "reef_explorer", equipment = ["bubble"] } = {}) {
  return {
    scene_contract: {
      contract_source: "narrative_book_spec_v3_scene_render_contract_v1",
      visible_character_ids: ["hero"],
      wardrobe_states: [{ character_id: "hero", outfit_state_id: outfit, equipment_state_ids: equipment }],
      render_snapshot: {
        physical_medium: medium,
        location,
        visible_phase: "during",
        camera_environment: { camera_zone: location, ambient_medium: medium },
      },
    },
  };
}

test("V19 proves adjacent render-state compatibility instead of trusting proximity", () => {
  assert.equal(VISUAL_REFERENCE_ARBITRATION_VERSION, 24);
  assert.equal(visualReferenceCompatibility(page(), page()).compatible, true);
  const incompatible = visualReferenceCompatibility(
    page({ medium: "breathable_air", location: "dry room", outfit: "ordinary_outfit", equipment: [] }),
    page(),
  );
  assert.equal(incompatible.compatible, false);
  assert.ok(incompatible.reasons.includes("physical_medium"));
  assert.ok(incompatible.reasons.includes("wardrobe:hero"));
  assert.ok(incompatible.reasons.includes("equipment:hero"));
});

test("wardrobe rejection changes pixel authorities monotonically across V19 attempts", () => {
  const references = [
    { kind: "repair_source" },
    { kind: "continuity" },
    { kind: "wardrobe" },
    { kind: "adjacent_scene" },
    { kind: "identity" },
  ];
  const second = nextVisualReferencePolicyStage(
    references,
    VISUAL_REFERENCE_POLICY_STAGES.FULL_COMPATIBLE,
    ["wardrobe_state_mismatch", "style_continuity_mismatch"],
  );
  assert.equal(second, VISUAL_REFERENCE_POLICY_STAGES.ADJACENT_IDENTITY);
  assert.deepEqual(
    referencesForVisualPolicy(references, second).map((reference) => reference.kind),
    ["wardrobe", "adjacent_scene", "identity"],
  );
  const third = nextVisualReferencePolicyStage(references, second, ["wardrobe_state_mismatch"]);
  assert.equal(third, VISUAL_REFERENCE_POLICY_STAGES.CONTRACT_IDENTITY);
  assert.deepEqual(
    referencesForVisualPolicy(references, third).map((reference) => reference.kind),
    ["wardrobe", "identity"],
  );
});

test("V19 spends a distinct reference attempt before using targeted wardrobe editing", () => {
  const evidence = { approved: false, failedDomains: ["wardrobe"], uncertainDomains: [] };
  const regenerate = strictV3IllustrationRetryStrategy(evidence, {
    attempt: 1,
    maximumAttempts: 3,
    targetedRepairAvailable: true,
    referenceArbitrationAvailable: true,
  });
  assert.equal(regenerate.mode, "regenerate");
  const final = strictV3IllustrationRetryStrategy(evidence, {
    attempt: 3,
    maximumAttempts: 3,
    targetedRepairAvailable: true,
    referenceArbitrationAvailable: false,
  });
  assert.equal(final.mode, "targeted_repair");
});
