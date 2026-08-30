import test from "node:test";
import assert from "node:assert/strict";

import { buildFinalPrompt } from "../src/services/imageRunner.js";
import {
  providerSafeFinalNeedsFoundation,
  providerSafeFoundationDecision,
  providerSafeFoundationPrompt,
  providerSafeFinishingPrompt,
  providerSafePositiveCorrectionPrompt,
} from "../src/services/imageQualityGate.js";
import {
  buildProviderSafeImageProjection,
  PROVIDER_SAFE_IMAGE_PROJECTION_VERSION,
} from "../src/services/providerSafeImageProjection.js";

function contract() {
  return {
    paired_text: "Mathéo remembers a frightening customer sentence that must stay private.",
    forbidden_elements: ["never show the frightening rejected event"],
    causal_history: ["a rejected provider request"],
    main_action: { subject: "Mathéo", verb: "places", target: "the pearl beside Nolan" },
    named_characters: [
      { name: "Mathéo", entity_type: "human child", action: "Mathéo places the pearl beside Nolan" },
      { name: "Nolan", entity_type: "human child", action: "Nolan watches Mathéo" },
    ],
    visual_entity_states: [{
      name: "pearl",
      state: "resting safely",
      owner: "Mathéo",
      location: "on the coral table beside Nolan",
      visibility: "required",
      exact_quantity: 1,
    }],
    render_snapshot: {
      location: "quiet reef workshop",
      physical_medium: "underwater",
      gravity_model: "buoyant",
    },
    scene_render_contract: {
      physical_world: {
        location: "quiet reef workshop",
        physical_medium: "underwater",
        gravity_model: "buoyant",
        allowed_locomotion: ["float"],
        allowed_postures: ["upright floating"],
        required_survival_mechanisms: ["one breathing bubble per traveler"],
      },
      cast: {
        required: [
          {
            name: "Mathéo",
            kind: "human child",
            exact_quantity: 1,
            outfit: { state_id: "reef_explorer", description: "turquoise full-body suit" },
            equipment: [{ description: "one breathing bubble" }],
          },
          {
            name: "Nolan",
            kind: "human child",
            exact_quantity: 1,
            outfit: { state_id: "reef_explorer", description: "coral full-body suit" },
            equipment: [{ description: "one breathing bubble" }],
          },
        ],
      },
    },
  };
}

test("provider-safe projection is deterministic, pseudonymous and limited to visible facts", () => {
  const source = contract();
  const before = structuredClone(source);
  const first = buildProviderSafeImageProjection({
    sceneFidelityContract: source,
    stylePrompt: "soft watercolor storybook art",
  });
  const second = buildProviderSafeImageProjection({
    sceneFidelityContract: source,
    stylePrompt: "soft watercolor storybook art",
  });

  assert.equal(first.version, PROVIDER_SAFE_IMAGE_PROJECTION_VERSION);
  assert.deepEqual(first, second);
  assert.deepEqual(source, before);
  assert.match(first.prompt, /quiet reef workshop/i);
  assert.match(first.prompt, /underwater/i);
  assert.match(first.prompt, /traveler_1 places the pearl beside traveler_2/i);
  assert.match(first.prompt, /turquoise full-body suit/i);
  assert.match(first.prompt, /one breathing bubble/i);
  assert.match(first.prompt, /1 pearl/i);
  assert.doesNotMatch(first.prompt, /Mathéo|Nolan/u);
  assert.doesNotMatch(first.prompt, /customer sentence|rejected provider|frightening rejected event/i);
});

test("minimal image mode ignores accidental fingerprints and reference pixels", () => {
  const projection = buildProviderSafeImageProjection({ sceneFidelityContract: contract() });
  const finalPrompt = buildFinalPrompt({
    prompt: projection.prompt,
    sceneContract: projection.sceneContract,
    providerSafetyMinimal: true,
    characterFingerprint: "PRIVATE FACE FINGERPRINT SHOULD NOT LEAK",
    referenceImages: [{ kind: "identity", label: "PRIVATE CHILD PHOTO" }],
  });

  assert.match(finalPrompt, /provider-safe minimal scene contract/i);
  assert.doesNotMatch(finalPrompt, /PRIVATE FACE FINGERPRINT|PRIVATE CHILD PHOTO/);
  assert.doesNotMatch(finalPrompt, /LOCKED CHARACTER CANON|REFERENCE IMAGE CONTRACT/);
  assert.doesNotMatch(finalPrompt, /Identity fidelity target|Reference photos may contain/i);
  assert.doesNotMatch(finalPrompt, /injury|restraint|weapon|medical detail/i);
});

test("provider-safe finishing uses private pixels with generic positive-only instructions", () => {
  const projection = buildProviderSafeImageProjection({ sceneFidelityContract: contract() });
  const finishingPrompt = providerSafeFinishingPrompt(projection.prompt, [
    "wardrobe_state_mismatch",
    "wrong_physical_medium",
    "main_action_mismatch",
    "style_continuity_mismatch",
  ]);
  const finalPrompt = buildFinalPrompt({
    prompt: finishingPrompt,
    sceneContract: projection.sceneContract,
    providerSafetyFinishing: true,
    characterFingerprint: "PRIVATE FACE FINGERPRINT SHOULD NOT LEAK",
    referenceImages: [
      { kind: "repair_source", label: "rejected page with Mathéo" },
      { kind: "continuity", label: "cover for Nolan" },
      { kind: "identity", label: "Mathéo customer photo" },
    ],
  });

  assert.match(finalPrompt, /PRIVATE TWO-PASS FINISHING V1/);
  assert.match(finalPrompt, /Dress every traveler in the exact declared outfit state/i);
  assert.match(finalPrompt, /Fill the complete camera environment with the declared physical medium/i);
  assert.match(finalPrompt, /Apply the approved artistic medium consistently/i);
  assert.match(finalPrompt, /Reference 1: scene composition and action/i);
  assert.doesNotMatch(finalPrompt, /Mathéo|Nolan|PRIVATE FACE FINGERPRINT/u);
  assert.doesNotMatch(finalPrompt, /rejected page|customer photo|previous output differed|because Required wardrobe/i);
});

test("positive correction compiler accepts codes rather than raw provider-sensitive prose", () => {
  const prompt = providerSafePositiveCorrectionPrompt([
    "wrong_location_or_boundary",
    "identity_likeness_mismatch",
    "unknown_raw_error_with_sensitive_words",
  ]);
  assert.match(prompt, /declared location on the declared side/i);
  assert.match(prompt, /Apply each identity reference/i);
  assert.doesNotMatch(prompt, /unknown_raw_error|sensitive_words/i);
});

test("structure-first foundation maps visible defects to bounded positive codes", () => {
  const decision = providerSafeFoundationDecision({
    technicalInspection: { approved: true, issues: [] },
    sceneInspection: {
      approved: false,
      issues: [
        "Physical environment is wrong: the people are dry instead of underwater.",
        "Landmark location is wrong: the passage boundary is not respected.",
        "The main action has the wrong subject.",
      ],
    },
  });

  assert.equal(decision.approved, false);
  assert.deepEqual(decision.issueCodes, [
    "wrong_physical_medium",
    "wrong_location_or_boundary",
    "main_action_mismatch",
  ]);
  const prompt = providerSafeFoundationPrompt("MINIMAL CONTRACT", decision.issueCodes);
  assert.match(prompt, /create a fresh complete composition/i);
  assert.match(prompt, /Fill the complete camera environment/i);
  assert.match(prompt, /declared side of the passage boundary/i);
  assert.doesNotMatch(prompt, /people are dry|not respected|wrong subject/i);
});

test("structural final failures restart from the approved foundation while wardrobe and style remain local", () => {
  assert.equal(providerSafeFinalNeedsFoundation(["wrong_physical_medium"]), true);
  assert.equal(providerSafeFinalNeedsFoundation(["main_action_mismatch", "wardrobe_state_mismatch"]), true);
  assert.equal(providerSafeFinalNeedsFoundation(["wardrobe_state_mismatch", "style_continuity_mismatch"]), false);
});
