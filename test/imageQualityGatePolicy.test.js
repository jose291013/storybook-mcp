import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { sceneContractImagePrompt } from "../src/agents/storyScenePlanner.js";
import {
  blockingSceneContractIssues,
  blockingStyleContinuityIssues,
  classifyVisualIssue,
  inspectNamedCastCardinality,
  inspectStrictV3IllustrationEvidence,
  normalizeStrictV3IllustrationEvidence,
  inspectRevisionNonRegression,
  reconcileFocusedCastInspection,
  inspectSceneFidelity,
  IMAGE_SAFETY_FALLBACK_STAGES,
  imageSafetyFallbackReferences,
  IllustrationQualityError,
  IllustrationSafetyQuarantineError,
  isImageSafetyRejection,
  isTransientImageGenerationError,
  nextImageSafetyFallbackStage,
  objectiveSceneContractIssues,
  objectiveTechnicalIssues,
  requiresFocusedCastVerification,
  strictV3IllustrationRetryStrategy,
  strictV3TargetedRepairPolicy,
  strictV3WardrobeDiagnosticTargets,
  strictV3WardrobeRepairDirective,
  targetedVisualRepairPolicy,
} from "../src/services/imageQualityGate.js";

const STRICT_DOMAINS = [
  "identity_cardinality", "forbidden_cast", "wardrobe", "equipment",
  "physical_medium", "location_boundary", "main_action", "object_cardinality",
  "landmarks", "style_continuity",
];

test("strict V3 evidence requires explicit verification in all eleven delivery domains", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-strict-v3-image-"));
  const imagePath = path.join(directory, "scene.png");
  await sharp({ create: { width: 640, height: 640, channels: 3, background: "#88bbcc" } }).png().toFile(imagePath);
  let instruction = "";
  const client = { responses: { create: async ({ input }) => {
    instruction = input[0].content[0].text;
    return { output_text: JSON.stringify({
      domains: Object.fromEntries(STRICT_DOMAINS.map((domain) => [domain, { status: "pass", evidence_code: "verified" }])),
      wardrobe_observations: [{
        character_id: "character_hero",
        outfit_state_id: "reef_explorer",
        status: "pass",
        evidence_code: "verified",
        observation_code: "matches_expected_state",
      }],
    }) };
  } } };
  try {
    const evidence = await inspectStrictV3IllustrationEvidence({
      imagePath,
      client,
      sceneContract: {
        render_snapshot: { physical_medium: "fully_underwater" },
        scene_render_contract: {
          cast: { required: [{
            character_id: "character_hero",
            kind: "human",
            outfit: { state_id: "reef_explorer" },
          }] },
        },
      },
      referenceImages: [{
        path: imagePath,
        kind: "wardrobe",
        characterId: "character_hero",
        outfitStateId: "reef_explorer",
        authorityId: "wardrobe_hero",
      }],
    });
    assert.equal(evidence.approved, true);
    assert.equal(Object.keys(evidence.domains).length, 11);
    assert.match(instruction, /gravity or buoyancy/);
    assert.match(instruction, /One entity in two positions is a duplicate/);
    assert.match(instruction, /ordinary source-photo clothing is forbidden/);
    assert.match(instruction, /WARDROBE DIAGNOSTIC TARGETS/u);
    assert.equal(evidence.wardrobeDiagnostics.observations[0].wardrobeAuthorityId, "wardrobe_hero");
    assert.equal(evidence.wardrobeDiagnostics.observations[0].status, "pass");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("missing or malformed strict V3 domains quarantine the candidate instead of guessing", () => {
  const evidence = normalizeStrictV3IllustrationEvidence({
    identity_cardinality: { status: "pass", evidence_code: "verified" },
    physical_medium: { status: "fail", evidence_code: "wrong_physical_medium" },
  });
  assert.equal(evidence.approved, false);
  assert.deepEqual(evidence.failedDomains, ["physical_medium"]);
  assert.ok(evidence.uncertainDomains.includes("wardrobe"));
  assert.equal(evidence.domains.wardrobe.evidence_code, "insufficient_evidence");
  assert.match(evidence.issues.join(" "), /remains private/);
});

test("adaptive V3 accepts a complete harmless variation of ordinary clothing", () => {
  const rawDomains = Object.fromEntries(STRICT_DOMAINS.map((domain) => [
    domain,
    {
      status: domain === "wardrobe" ? "fail" : "pass",
      evidence_code: domain === "wardrobe" ? "wardrobe_state_mismatch" : "verified",
    },
  ]));
  const evidence = normalizeStrictV3IllustrationEvidence(rawDomains, {
    expectedWardrobeTargets: [{
      characterId: "character_hero",
      outfitStateId: "ordinary_outfit",
      wardrobeAuthorityId: "wardrobe_hero_ordinary",
      evidenceMode: "broad_garment_attributes",
      semanticSignature: "ordinary-signature",
    }],
    rawWardrobeObservations: [{
      character_id: "character_hero",
      outfit_state_id: "ordinary_outfit",
      status: "pass",
      evidence_code: "verified",
      observation_code: "acceptable_ordinary_variation",
    }],
  });

  assert.equal(evidence.approved, true);
  assert.equal(evidence.domains.wardrobe.status, "pass");
  assert.equal(evidence.wardrobeDiagnostics.assessmentComplete, true);
  assert.equal(evidence.adaptiveQuality.acceptedOrdinaryVariationCount, 1);
  assert.equal(evidence.adaptiveQuality.wardrobeDecisionSource, "character_specific_evidence");
});

test("adaptive V3 keeps a wrong ordinary-versus-adventure outfit mode blocking", () => {
  const rawDomains = Object.fromEntries(STRICT_DOMAINS.map((domain) => [
    domain,
    { status: "pass", evidence_code: "verified" },
  ]));
  const evidence = normalizeStrictV3IllustrationEvidence(rawDomains, {
    expectedWardrobeTargets: [{
      characterId: "character_hero",
      outfitStateId: "ordinary_outfit",
      wardrobeAuthorityId: "wardrobe_hero_ordinary",
      evidenceMode: "broad_garment_attributes",
      semanticSignature: "ordinary-signature",
    }],
    rawWardrobeObservations: [{
      character_id: "character_hero",
      outfit_state_id: "ordinary_outfit",
      status: "fail",
      evidence_code: "wardrobe_state_mismatch",
      observation_code: "wrong_outfit_mode",
    }],
  });

  assert.equal(evidence.approved, false);
  assert.deepEqual(evidence.failedDomains, ["wardrobe"]);
  assert.equal(evidence.wardrobeDiagnostics.failedTargets[0].observationCode, "wrong_outfit_mode");
});

test("adaptive V3 never relaxes an exact special-garment authority", () => {
  const rawDomains = Object.fromEntries(STRICT_DOMAINS.map((domain) => [
    domain,
    {
      status: domain === "wardrobe" ? "fail" : "pass",
      evidence_code: domain === "wardrobe" ? "wardrobe_state_mismatch" : "verified",
    },
  ]));
  const evidence = normalizeStrictV3IllustrationEvidence(rawDomains, {
    expectedWardrobeTargets: [{
      characterId: "character_hero",
      outfitStateId: "reef_explorer",
      wardrobeAuthorityId: "wardrobe_hero_reef",
      evidenceMode: "exact_garment_design",
      semanticSignature: "reef-signature",
    }],
    rawWardrobeObservations: [{
      character_id: "character_hero",
      outfit_state_id: "reef_explorer",
      status: "pass",
      evidence_code: "verified",
      observation_code: "acceptable_ordinary_variation",
    }],
  });

  assert.equal(evidence.approved, false);
  assert.deepEqual(evidence.failedDomains, ["wardrobe"]);
  assert.equal(evidence.wardrobeDiagnostics.observations[0].status, "uncertain");
  assert.equal(evidence.adaptiveQuality.wardrobeDecisionSource, "aggregate_evidence");
});

test("strict V3 retries a full candidate when several independent domains fail", () => {
  const evidence = normalizeStrictV3IllustrationEvidence(Object.fromEntries(STRICT_DOMAINS.map((domain) => [
    domain,
    { status: "pass", evidence_code: "verified" },
  ])));
  evidence.approved = false;
  evidence.failedDomains = ["wardrobe", "equipment", "style_continuity"];
  evidence.uncertainDomains = [];

  const strategy = strictV3IllustrationRetryStrategy(evidence, {
    attempt: 1,
    maximumAttempts: 2,
    targetedRepairAvailable: true,
  });
  const policy = strictV3TargetedRepairPolicy(evidence, {
    attempt: 1,
    maximumAttempts: 2,
    targetedRepairAvailable: true,
  });

  assert.equal(strategy.mode, "regenerate");
  assert.equal(strategy.reason, "multiple_domains_failed");
  assert.equal(policy.automaticRepair, false);
  assert.deepEqual(policy.targetCodes, []);
});

test("strict V3 enters targeted editing only after convergence to one confirmed local defect", () => {
  const evidence = {
    approved: false,
    failedDomains: ["wardrobe"],
    uncertainDomains: [],
    wardrobeDiagnostics: {
      targetingComplete: true,
      failedTargets: [{
        characterId: "character_hero",
        outfitStateId: "reef_explorer",
        wardrobeAuthorityId: "wardrobe_123",
        status: "fail",
        evidenceCode: "wardrobe_state_mismatch",
        observationCode: "categorically_different_state",
      }],
    },
  };
  const policy = strictV3TargetedRepairPolicy(evidence, {
    attempt: 2,
    maximumAttempts: 2,
    targetedRepairAvailable: true,
  });

  assert.equal(policy.strategy.mode, "targeted_repair");
  assert.equal(policy.automaticRepair, true);
  assert.deepEqual(policy.targetDomains, ["wardrobe"]);
  assert.deepEqual(policy.targetCodes, ["wardrobe_state_mismatch"]);
  assert.deepEqual(policy.wardrobeTargets.map((entry) => entry.characterId), ["character_hero"]);
  assert.match(strictV3WardrobeRepairDirective(policy), /character_hero/u);
  assert.doesNotMatch(strictV3WardrobeRepairDirective(policy), /child_1/u);
});

test("strict V3 hands every confirmed wardrobe target to one canonical final recompose", () => {
  const evidence = {
    approved: false,
    failedDomains: ["wardrobe"],
    uncertainDomains: [],
    wardrobeDiagnostics: {
      targetingComplete: true,
      failedTargets: [
        {
          characterId: "character_hero",
          outfitStateId: "ordinary_outfit",
          wardrobeAuthorityId: "wardrobe_hero_ordinary",
          status: "fail",
          evidenceCode: "wardrobe_state_mismatch",
          observationCode: "categorically_different_state",
        },
        {
          characterId: "character_jerome",
          outfitStateId: "ordinary_outfit",
          wardrobeAuthorityId: "wardrobe_jerome_ordinary",
          status: "fail",
          evidenceCode: "wardrobe_state_mismatch",
          observationCode: "categorically_different_state",
        },
      ],
    },
  };

  const policy = strictV3TargetedRepairPolicy(evidence, {
    attempt: 3,
    maximumAttempts: 3,
    targetedRepairAvailable: true,
  });

  assert.equal(policy.strategy.mode, "targeted_repair");
  assert.equal(policy.automaticRepair, true);
  assert.deepEqual(policy.wardrobeTargets.map((target) => target.characterId), [
    "character_hero",
    "character_jerome",
  ]);
  const directive = strictV3WardrobeRepairDirective(policy);
  assert.match(directive, /character_hero/u);
  assert.match(directive, /character_jerome/u);
});

test("strict V3 wardrobe repair binds each target to its canonical alias and garment description", () => {
  const policy = {
    wardrobeTargets: [
      {
        characterId: "character_hero",
        outfitStateId: "ordinary_outfit",
        wardrobeAuthorityId: "wardrobe_hero",
        evidenceMode: "broad_garment_attributes",
        semanticSignature: "hero-signature",
      },
      {
        characterId: "character_jerome",
        outfitStateId: "ordinary_outfit",
        wardrobeAuthorityId: "wardrobe_jerome",
        evidenceMode: "broad_garment_attributes",
        semanticSignature: "jerome-signature",
      },
    ],
  };
  const directive = strictV3WardrobeRepairDirective(policy, [
    {
      kind: "wardrobe",
      characterId: "character_hero",
      characterName: "child alpha",
      outfitStateId: "ordinary_outfit",
      authorityId: "wardrobe_hero",
      semanticSignature: "hero-signature",
      description: "a pale blue short-sleeved shirt, navy trousers and white trainers",
    },
    {
      kind: "wardrobe",
      characterId: "character_jerome",
      characterName: "adult beta",
      outfitStateId: "ordinary_outfit",
      authorityId: "wardrobe_jerome",
      semanticSignature: "jerome-signature",
      description: "a black short-sleeved shirt, beige trousers and grey shoes",
    },
    {
      kind: "wardrobe",
      characterId: "unrelated",
      characterName: "unrelated gamma",
      outfitStateId: "ordinary_outfit",
      authorityId: "unrelated-authority",
      description: "a forbidden unrelated red coat",
    },
  ]);

  assert.match(directive, /child alpha/u);
  assert.match(directive, /pale blue short-sleeved shirt/u);
  assert.match(directive, /"wardrobe_reference_number":1/u);
  assert.match(directive, /adult beta/u);
  assert.match(directive, /black short-sleeved shirt/u);
  assert.match(directive, /"wardrobe_reference_number":2/u);
  assert.match(directive, /never exchange clothes between targets/u);
  assert.doesNotMatch(directive, /forbidden unrelated red coat/u);
});

test("strict V3 attributes a wardrobe conflict to the exact canonical character and authority", () => {
  const expectedWardrobeTargets = [
    { characterId: "character_hero", outfitStateId: "reef_explorer", wardrobeAuthorityId: "wardrobe_hero", evidenceMode: "exact_garment_design", semanticSignature: "hero-signature" },
    { characterId: "character_brother", outfitStateId: "reef_explorer", wardrobeAuthorityId: "wardrobe_brother", evidenceMode: "exact_garment_design", semanticSignature: "brother-signature" },
  ];
  const rawDomains = Object.fromEntries(STRICT_DOMAINS.map((domain) => [
    domain,
    { status: domain === "wardrobe" ? "fail" : "pass", evidence_code: domain === "wardrobe" ? "wardrobe_state_mismatch" : "verified" },
  ]));
  const evidence = normalizeStrictV3IllustrationEvidence(rawDomains, {
    expectedWardrobeTargets,
    rawWardrobeObservations: [
      {
        character_id: "character_hero",
        outfit_state_id: "reef_explorer",
        status: "fail",
        evidence_code: "wardrobe_state_mismatch",
        observation_code: "categorically_different_state",
        ignored_free_text: "never persisted",
      },
      {
        character_id: "character_brother",
        outfit_state_id: "reef_explorer",
        status: "pass",
        evidence_code: "verified",
        observation_code: "matches_expected_state",
      },
    ],
  });
  const policy = strictV3TargetedRepairPolicy(evidence, {
    attempt: 2,
    maximumAttempts: 2,
    targetedRepairAvailable: true,
  });

  assert.equal(evidence.wardrobeDiagnostics.targetingComplete, true);
  assert.deepEqual(policy.wardrobeTargets, [{
    characterId: "character_hero",
    outfitStateId: "reef_explorer",
    wardrobeAuthorityId: "wardrobe_hero",
    evidenceMode: "exact_garment_design",
    semanticSignature: "hero-signature",
    status: "fail",
    evidenceCode: "wardrobe_state_mismatch",
    observationCode: "categorically_different_state",
  }]);
  assert.equal(JSON.stringify(policy).includes("ignored_free_text"), false);
  assert.equal(policy.automaticRepair, true);
});

test("strict V3 refuses a blind wardrobe edit when nominative evidence is incomplete", () => {
  const evidence = {
    approved: false,
    failedDomains: ["wardrobe"],
    uncertainDomains: [],
    wardrobeDiagnostics: {
      targetingComplete: false,
      failedTargets: [],
    },
  };
  const policy = strictV3TargetedRepairPolicy(evidence, {
    attempt: 2,
    maximumAttempts: 2,
    targetedRepairAvailable: true,
  });
  assert.equal(policy.strategy.mode, "quarantine");
  assert.equal(policy.strategy.reason, "wardrobe_target_unresolved");
  assert.equal(policy.automaticRepair, false);
});

test("strict V3 refuses a nominative wardrobe edit without the exact pixel authority", () => {
  const rawDomains = Object.fromEntries(STRICT_DOMAINS.map((domain) => [
    domain,
    { status: domain === "wardrobe" ? "fail" : "pass", evidence_code: domain === "wardrobe" ? "wardrobe_state_mismatch" : "verified" },
  ]));
  const evidence = normalizeStrictV3IllustrationEvidence(rawDomains, {
    expectedWardrobeTargets: [{
      characterId: "character_hero",
      outfitStateId: "reef_explorer",
      wardrobeAuthorityId: "",
    }],
    rawWardrobeObservations: [{
      character_id: "character_hero",
      outfit_state_id: "reef_explorer",
      status: "fail",
      evidence_code: "wardrobe_state_mismatch",
      observation_code: "categorically_different_state",
    }],
  });
  const policy = strictV3TargetedRepairPolicy(evidence, {
    attempt: 2,
    maximumAttempts: 2,
    targetedRepairAvailable: true,
  });
  assert.equal(evidence.wardrobeDiagnostics.targetingComplete, false);
  assert.equal(policy.strategy.reason, "wardrobe_target_unresolved");
  assert.equal(policy.automaticRepair, false);
});

test("wardrobe diagnostic targets bind exact cast ids to exact pixel authorities", () => {
  const sceneContract = {
    scene_render_contract: {
      cast: {
        required: [
          { character_id: "character_hero", kind: "human", outfit: { state_id: "reef_explorer" } },
          { character_id: "character_dog", kind: "animal", outfit: { state_id: "ordinary_outfit" } },
        ],
      },
    },
  };
  assert.deepEqual(strictV3WardrobeDiagnosticTargets(sceneContract, [{
    kind: "wardrobe",
    characterId: "character_hero",
    outfitStateId: "reef_explorer",
    authorityId: "wardrobe_hero",
  }]), [{
    characterId: "character_hero",
    outfitStateId: "reef_explorer",
    wardrobeAuthorityId: "wardrobe_hero",
    evidenceMode: "exact_garment_design",
    semanticSignature: "",
  }]);
});

test("strict V3 regenerates uncertain or structural evidence and never targets it blindly", () => {
  assert.equal(strictV3IllustrationRetryStrategy({
    approved: false,
    failedDomains: [],
    uncertainDomains: ["identity_cardinality"],
  }, {
    attempt: 1,
    maximumAttempts: 2,
    targetedRepairAvailable: true,
  }).mode, "regenerate");

  const exhausted = strictV3TargetedRepairPolicy({
    approved: false,
    failedDomains: ["physical_medium"],
    uncertainDomains: [],
  }, {
    attempt: 2,
    maximumAttempts: 2,
    targetedRepairAvailable: true,
  });
  assert.equal(exhausted.strategy.mode, "quarantine");
  assert.equal(exhausted.automaticRepair, false);
});
import {
  buildFinalPrompt,
  prioritizeVisualReferences,
  sanitizeBrandSensitiveText,
} from "../src/services/imageRunner.js";

test("image QA ignores artistic preferences and retains objective file defects", () => {
  assert.deepEqual(objectiveTechnicalIssues(["photo-realistic style, not an illustration"]), []);
  assert.deepEqual(objectiveTechnicalIssues([
    "No coherent children's-book illustration scene; image is a photo of real people rather than an illustrated scene",
  ]), []);
  assert.deepEqual(objectiveTechnicalIssues([
    "The subjects are recognizable, but the result uses photographic rendering instead of soft watercolor",
  ]), []);
  assert.deepEqual(objectiveTechnicalIssues(["different outfit and preferred composition"]), []);
  assert.deepEqual(
    objectiveTechnicalIssues([
      "repeated bands and corrupted pixels",
      "photo-realistic style",
      "The image fuses a human head with an animal body into a hybrid.",
      "The child has an extra left hand attached below the elbow.",
      "La main gauche du garçon est dupliquée dans une position anatomiquement impossible.",
      "La niña tiene un brazo extra unido al hombro.",
    ]),
    [
      "repeated bands and corrupted pixels",
      "The image fuses a human head with an animal body into a hybrid.",
      "The child has an extra left hand attached below the elbow.",
      "La main gauche du garçon est dupliquée dans une position anatomiquement impossible.",
      "La niña tiene un brazo extra unido al hombro.",
    ],
  );
  assert.deepEqual(objectiveTechnicalIssues([
    "The child's left hand is partly hidden by the flower.",
    "La perspective rend la position de la main ambiguë.",
    "The hero has two hands, as expected.",
  ]), []);
});

test("OpenAI safety rejections are identified for a safer continuity-only retry", () => {
  assert.equal(isImageSafetyRejection(new Error("Your request was rejected by the safety system.")), true);
  assert.equal(isImageSafetyRejection(new Error("Network timeout")), false);
});

test("temporary image-service failures consume the next bounded image attempt", async () => {
  assert.equal(isTransientImageGenerationError(Object.assign(new Error("request failed"), { status: 500 })), true);
  assert.equal(isTransientImageGenerationError(Object.assign(new Error("request failed"), { status: 429 })), true);
  assert.equal(isTransientImageGenerationError(Object.assign(new Error("request failed"), { code: "ECONNRESET" })), true);
  assert.equal(isTransientImageGenerationError(new Error("The server had an error processing your request. Sorry about that!")), true);
  assert.equal(isTransientImageGenerationError(new Error("The request is invalid and cannot be processed.")), false);
  assert.equal(isTransientImageGenerationError(new Error("Your request was rejected by the safety system.")), false);

  const qualityGate = await fs.readFile("src/services/imageQualityGate.js", "utf8");
  assert.match(qualityGate, /attempt < attemptLimit && isTransientImageGenerationError\(error\)/);
});

test("scene QA ignores minor wardrobe detail but keeps an explicit active-outfit contradiction", () => {
  assert.deepEqual(objectiveSceneContractIssues([
    "Nolan does not wear the locked grey Sonic T-shirt and red Crocs.",
    "Mathéo ne porte pas sa casquette noire ni la tenue décrite.",
    "Jérôme no lleva la camiseta ni la gorra solicitadas.",
  ]), []);
  assert.deepEqual(objectiveSceneContractIssues([
    "Required wardrobe state conflicts. The hero child wears casual clothes instead of the required full space suit.",
  ]), [
    "Required wardrobe state conflicts. The hero child wears casual clothes instead of the required full space suit.",
  ]);
  assert.deepEqual(objectiveSceneContractIssues([
    "Mathéo is shown smiling but does not perform the central action of placing a hand on Nolan's shoulder.",
    "The required giant dinosaur is absent.",
    "The red cap is duplicated: one copy is held while another is worn.",
    "Nolan should be holding the red cap but is wearing it instead.",
    "Matheo wears the requested shirt but does not perform the central action.",
  ]), [
    "Mathéo is shown smiling but does not perform the central action of placing a hand on Nolan's shoulder.",
    "The required giant dinosaur is absent.",
    "The red cap is duplicated: one copy is held while another is worn.",
    "Nolan should be holding the red cap but is wearing it instead.",
    "Matheo wears the requested shirt but does not perform the central action.",
  ]);
  assert.deepEqual(objectiveSceneContractIssues([
    "La peluche Winnie est présente et parle à Nolan comme demandé.",
    "La vallée des dinosaures est visible conformément à l'échelle et description, avec fougères géantes.",
    "Coq en or is not visible or suggested, so no issue.",
  ]), []);
  assert.deepEqual(objectiveSceneContractIssues([
    "Collier avec un tout petit cœur visible autour du cou of hero child is not visible.",
    "The tiny necklace pendant is hidden by the child's pose.",
  ]), []);
});

test("missing required cast and fused identities remain blocking after the final image attempt", () => {
  assert.deepEqual(blockingSceneContractIssues([
    "Required named character family member 2 is missing.",
    "Required identities are fused into one hybrid body.",
    "Required named identity is duplicated. Bastien is shown twice in two different positions.",
    "Le même personnage Bastien apparaît deux fois dans la scène.",
    "El mismo personaje aparece dos veces en posiciones distintas.",
    "The giant bridge is not large enough.",
  ]), [
    "Required named character family member 2 is missing.",
    "Required identities are fused into one hybrid body.",
    "Required named identity is duplicated. Bastien is shown twice in two different positions.",
    "Le même personnage Bastien apparaît deux fois dans la scène.",
    "El mismo personaje aparece dos veces en posiciones distintas.",
  ]);
  assert.deepEqual(blockingSceneContractIssues([
    "Two different named children appear together as required.",
    "Bastien appears once beside his reflection, which is explicitly required by the scene contract.",
    "The group contains multiple background people.",
  ]), []);
});

test("a low-detail missing-cast suspicion needs high-detail confirmation", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-cast-qa-"));
  const imagePath = path.join(directory, "scene.png");
  await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#d7f0ff" },
  }).png().toFile(imagePath);
  let calls = 0;
  const client = {
    responses: {
      create: async () => {
        calls += 1;
        return calls === 1
          ? { output_text: JSON.stringify({ approved: false, issues: ["Required named character Papa is missing."] }) }
          : { output_text: JSON.stringify({ confirmed_missing: [] }) };
      },
    },
  };
  try {
    const result = await inspectSceneFidelity({
      imagePath,
      client,
      sceneContract: {
        named_characters: [{ name: "Papa", visual_role: "local departure supporter", action: "waves goodbye" }],
      },
    });
    assert.equal(calls, 2);
    assert.deepEqual(result, { approved: true, issues: [] });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("a persistent entity count suspicion needs high-detail confirmation", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-entity-qa-"));
  const imagePath = path.join(directory, "scene.png");
  await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#d7f0ff" },
  }).png().toFile(imagePath);
  let calls = 0;
  const client = {
    responses: {
      create: async ({ input }) => {
        calls += 1;
        if (calls === 1) {
          return { output_text: JSON.stringify({ approved: false, issues: ["Persistent visual entity is duplicated. The ball appears in two positions."] }) };
        }
        assert.match(input[0].content[0].text, /Count every physical copy across the entire image/);
        return { output_text: JSON.stringify({
          confirmed_issues: [{ entity_id: "object_ball", kind: "quantity", observed_quantity: 2 }],
        }) };
      },
    },
  };
  try {
    const result = await inspectSceneFidelity({
      imagePath,
      client,
      sceneContract: {
        visual_entity_states: [{
          entity_id: "object_ball",
          name: "luminous ball",
          visibility: "required",
          exact_quantity: 1,
          state: "visible",
          location: "workshop floor",
          appearance_lock: { colors: ["gold"] },
        }],
      },
    });
    assert.equal(calls, 2);
    assert.equal(result.approved, false);
    assert.match(result.issues[0], /requires 1 total and shows 2/);
    assert.equal(classifyVisualIssue(result.issues[0]).code, "object_state");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("visual QA policy assigns stable codes and reserves automatic repair for high-confidence defects", () => {
  assert.deepEqual(
    classifyVisualIssue("Required named identity is duplicated. Noa appears twice."),
    {
      code: "identity_duplicate",
      severity: "blocking",
      confidence: "high",
      automaticRepair: true,
      issue: "Required named identity is duplicated. Noa appears twice.",
    },
  );
  assert.equal(
    classifyVisualIssue("Required named character family member 3 is missing.").code,
    "required_cast_missing",
  );
  assert.deepEqual(
    classifyVisualIssue("The giant ferns look smaller than preferred."),
    {
      code: "composition_or_scale",
      severity: "local",
      confidence: "medium",
      automaticRepair: false,
      issue: "The giant ferns look smaller than preferred.",
    },
  );
  const policy = targetedVisualRepairPolicy([
    "Required named identity is duplicated.",
    "Required named character family member 3 is missing.",
  ]);
  assert.equal(policy.version, 4);
  assert.equal(policy.automaticRepair, true);
  assert.deepEqual(policy.targetCodes, ["identity_duplicate", "required_cast_missing"]);
  assert.ok(policy.verificationCodes.includes("identity_fusion"));
  const wardrobePolicy = targetedVisualRepairPolicy([
    "Required wardrobe state conflicts. The hero child wears casual clothes instead of the required full space suit.",
  ]);
  assert.equal(wardrobePolicy.automaticRepair, true);
  assert.deepEqual(wardrobePolicy.targetCodes, ["wardrobe_state_mismatch"]);
  assert.ok(wardrobePolicy.verificationCodes.includes("wardrobe_state_mismatch"));
});

test("the existing scene-fidelity call checks only gross declared wardrobe states", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-wardrobe-qa-"));
  const imagePath = path.join(directory, "scene.png");
  await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#d7f0ff" },
  }).png().toFile(imagePath);
  let instruction = "";
  const client = {
    responses: {
      create: async ({ input }) => {
        instruction = input[0].content[0].text;
        return {
          output_text: JSON.stringify({
            approved: false,
            issues: ["Required wardrobe state conflicts. The hero child wears a blue T-shirt instead of the required full space suit."],
          }),
        };
      },
    },
  };
  try {
    const result = await inspectSceneFidelity({
      imagePath,
      client,
      sceneContract: {
        named_characters: [{ name: "hero child", action: "listens inside the cabin" }],
        wardrobe_contracts: [{
          name: "hero child",
          required_outfit: "a navy and turquoise full space suit",
        }],
      },
    });
    assert.match(instruction, /categorically different outfit/u);
    assert.match(instruction, /wardrobe_contracts/u);
    assert.deepEqual(result, {
      approved: false,
      issues: ["Required wardrobe state conflicts. The hero child wears a blue T-shirt instead of the required full space suit."],
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("targeted cast repairs require one high-detail occurrence of every named identity", async () => {
  assert.equal(requiresFocusedCastVerification(["required_cast_missing"]), true);
  assert.equal(requiresFocusedCastVerification(["identity_substitution"]), true);
  assert.equal(requiresFocusedCastVerification(["main_action"]), false);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-cardinality-qa-"));
  const imagePath = path.join(directory, "scene.png");
  await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#d7f0ff" },
  }).png().toFile(imagePath);
  const responses = [
    {
      cast: [
        { name: "Noa", observed: "one", candidate_ids: ["subject_1"], structural_state: "separate" },
        { name: "Eva", observed: "two_or_more", candidate_ids: ["subject_2", "subject_3"], structural_state: "separate" },
      ],
    },
    {
      cast: [
        { name: "Noa", observed: "one", candidate_ids: ["subject_1"], structural_state: "separate" },
        { name: "Eva", observed: "one", candidate_ids: ["subject_2"], structural_state: "separate" },
      ],
    },
    {
      cast: [
        { name: "Noa", observed: "one", candidate_ids: ["subject_1"], structural_state: "separate" },
        { name: "Eva", observed: "one", candidate_ids: ["subject_1"], structural_state: "separate" },
      ],
    },
    {
      cast: [
        { name: "Noa", observed: "uncertain", candidate_ids: [], structural_state: "uncertain" },
        { name: "Eva", observed: "one", candidate_ids: ["subject_2"], structural_state: "separate" },
      ],
    },
  ];
  const client = {
    responses: {
      create: async (request) => {
        assert.equal(request.input[0].content.filter((item) => item.type === "input_image").length, 2);
        assert.match(request.input[0].content[0].text, /Image 2: Eva, supporter/);
        return { output_text: JSON.stringify(responses.shift()) };
      },
    },
  };
  const sceneContract = {
    named_characters: [
      { name: "Noa", visual_role: "actor", action: "leads the game" },
      { name: "Eva", visual_role: "supporter", action: "walks beside Noa" },
    ],
  };
  const identityReferences = [{
    buffer: await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#ffe7d6" },
    }).png().toBuffer(),
    kind: "identity",
    label: "Eva, supporter: private identity-only reference",
  }];
  try {
    const duplicated = await inspectNamedCastCardinality({ imagePath, sceneContract, identityReferences, client });
    assert.deepEqual(duplicated, {
      approved: false,
      issues: ["Required named identity is duplicated. Eva appears two or more times after high-detail identity-cardinality verification."],
      issueCodes: ["identity_duplicate"],
      authoritative: true,
    });
    const exact = await inspectNamedCastCardinality({ imagePath, sceneContract, identityReferences, client });
    assert.deepEqual(exact, { approved: true, issues: [], issueCodes: [], authoritative: true });
    const fused = await inspectNamedCastCardinality({ imagePath, sceneContract, identityReferences, client });
    assert.deepEqual(fused, {
      approved: false,
      issues: ["Required identities are fused. Noa and Eva share candidate subject_1 after high-detail identity arbitration."],
      issueCodes: ["identity_fusion"],
      authoritative: true,
    });
    const uncertain = await inspectNamedCastCardinality({ imagePath, sceneContract, identityReferences, client });
    assert.deepEqual(uncertain, { approved: true, issues: [], issueCodes: [], authoritative: true });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("the focused V3 verifier rejects one categorically wrong active outfit", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-wardrobe-qa-"));
  const imagePath = path.join(directory, "scene.png");
  await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#d7f0ff" },
  }).png().toFile(imagePath);
  const sceneContract = {
    named_characters: [{ name: "hero child", visual_role: "actor", action: "crosses the bridge" }],
    scene_render_contract: {
      cast: {
        required: [{
          character_id: "character_hero",
          name: "hero child",
          outfit: { description: "a moss-green explorer jacket, ochre trousers and brown boots" },
        }],
      },
    },
  };
  const client = {
    responses: {
      create: async () => ({
        output_text: JSON.stringify({
          cast: [{
            name: "hero child",
            observed: "one",
            candidate_ids: ["subject_1"],
            structural_state: "separate",
            wardrobe_state: "conflicts",
          }],
        }),
      }),
    },
  };
  try {
    const result = await inspectNamedCastCardinality({ imagePath, sceneContract, client });
    assert.equal(result.authoritative, true);
    assert.deepEqual(result.issueCodes, ["wardrobe_state_mismatch"]);
    assert.match(result.issues[0], /Required wardrobe state conflicts/u);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("focused identity cardinality replaces contradictory anonymous cast findings", () => {
  const reconciled = reconcileFocusedCastInspection({
    approved: false,
    issues: [
      "Required named identity is duplicated: family member 3 appears twice.",
      "Required named character human friend 4 is missing after high-detail confirmation.",
      "Required object basket is missing.",
    ],
  }, {
    approved: false,
    issues: ["Required named identity is duplicated. Eva appears two or more times after high-detail identity-cardinality verification."],
    issueCodes: ["identity_duplicate"],
    authoritative: true,
  });
  assert.deepEqual(reconciled.issues, [
    "Required object basket is missing.",
    "Required named identity is duplicated. Eva appears two or more times after high-detail identity-cardinality verification.",
  ]);
  assert.deepEqual(reconciled.issueCodes, ["object_state", "identity_duplicate"]);
});

test("an incomplete focused cast response preserves the original scene evidence", () => {
  const original = {
    approved: false,
    issues: ["Required named character human friend 4 is missing after high-detail confirmation."],
  };
  assert.deepEqual(reconcileFocusedCastInspection(original, {
    approved: true,
    issues: [],
    authoritative: false,
  }), {
    ...original,
    issueCodes: ["required_cast_missing"],
  });
});

test("an unconfirmed initial cast suspicion becomes advisory while independent defects remain", () => {
  const original = {
    approved: false,
    issues: [
      "Required identities are fused into one body.",
      "Required object basket is missing.",
    ],
  };
  assert.deepEqual(reconcileFocusedCastInspection(original, {
    approved: true,
    issues: [],
    authoritative: false,
  }, { unconfirmed: "advisory" }), {
    ...original,
    approved: false,
    issues: ["Required object basket is missing."],
    issueCodes: ["object_state"],
    unconfirmedCastIssues: ["Required identities are fused into one body."],
  });
});

test("revision comparison keeps structured cast regressions separate from stable-scene regressions", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-revision-qa-"));
  const imagePath = path.join(directory, "candidate.png");
  const sourcePath = path.join(directory, "source.png");
  await Promise.all([imagePath, sourcePath].map((target) => sharp({
    create: { width: 32, height: 32, channels: 3, background: "#d7f0ff" },
  }).png().toFile(target)));
  const client = {
    responses: {
      create: async () => ({ output_text: JSON.stringify({
        approved: false,
        issues: [
          { kind: "identity_or_cast", detail: "Eva is missing" },
          { kind: "stable_visual_invariant", detail: "the unique nest house moved" },
        ],
      }) }),
    },
  };
  try {
    const result = await inspectRevisionNonRegression({
      imagePath,
      repairSourceReference: { path: sourcePath },
      client,
    });
    assert.deepEqual(result.issueCodes, ["identity_regression", "revision_invariant_regression"]);
    assert.match(result.issues[0], /Identity likeness regressed/);
    assert.match(result.issues[1], /stable visual invariant regressed/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("quality-review copy uses structured defect codes before legacy text matching", async () => {
  const app = await fs.readFile("public/app.js", "utf8");
  const preview = await fs.readFile("src/routes/preview.js", "utf8");
  const qualityReview = await fs.readFile("src/routes/qualityReview.js", "utf8");
  const qualityGate = await fs.readFile("src/services/imageQualityGate.js", "utf8");
  assert.match(app, /codes\.has\("identity_duplicate"\)/);
  assert.match(app, /codes\.has\("identity_substitution"\).*codes\.has\("identity_regression"\)/s);
  assert.match(app, /draftPage\?\.qualityIssueCodes/);
  assert.match(preview, /qualityIssueCodes: qualityError \? error\.issueCodes : repairPolicy\.targetCodes/);
  assert.match(qualityReview, /verifyExactCast: true/);
  assert.match(qualityReview, /Preserve exactly one complete visible instance/);
  assert.match(qualityGate, /Boolean\(verifyExactCast\)/);
  assert.match(qualityGate, /const initialCastArbitration/);
  assert.match(qualityGate, /unconfirmed: initialCastArbitration \? "advisory" : "preserve"/);
});

test("a targeted repair edits the preserved candidate before continuity and identity references", () => {
  const references = prioritizeVisualReferences([
    { kind: "identity", label: "hero" },
    { kind: "adjacent_scene", label: "previous approved scene" },
    { kind: "continuity", label: "cover" },
    { kind: "repair_source", label: "page candidate" },
  ]);
  assert.deepEqual(references.map((item) => item.kind), ["repair_source", "continuity", "adjacent_scene", "identity"]);
  const prompt = buildFinalPrompt({
    prompt: "Remove only the duplicated hero.",
    referenceImages: references,
  });
  assert.match(prompt, /TARGET IMAGE TO EDIT/);
  assert.match(prompt, /smallest local correction/);
  assert.match(prompt, /do not redesign or regenerate the scene/);
  assert.match(prompt, /ADJACENT APPROVED SCENE/);
  assert.match(prompt, /never copy their prior action, pose, composition, camera/i);
});

test("generation applies the same broad-versus-exact wardrobe evidence modes as strict QA", () => {
  const prompt = buildFinalPrompt({
    prompt: "Illustrate the immutable scene.",
    referenceImages: [
      {
        kind: "wardrobe",
        label: "hero ordinary source",
        evidenceMode: "broad_garment_attributes",
      },
      {
        kind: "wardrobe",
        label: "companion adventure sheet",
        evidenceMode: "exact_garment_design",
      },
    ],
  });
  assert.match(prompt, /LOCKED ORDINARY WARDROBE ATTRIBUTES/);
  assert.match(prompt, /broad garment categories, dominant colors and footwear/i);
  assert.match(prompt, /ignoring logos, print, minor texture, folds, fit and hidden details/i);
  assert.match(prompt, /LOCKED EXACT WARDROBE DESIGN/);
  assert.match(prompt, /preserve its exact design, colors, material and footwear/i);
});

test("a likeness or invariant regression against the preserved revision source is blocking", () => {
  for (const [issue, code] of [
    ["Identity likeness regressed from preserved source: the child became a different person.", "identity_regression"],
    ["Unrequested stable visual invariant regressed from preserved source: the unique arch was duplicated.", "revision_invariant_regression"],
  ]) {
    assert.deepEqual(objectiveSceneContractIssues([issue]), [issue]);
    assert.deepEqual(blockingSceneContractIssues([issue]), [issue]);
    const classification = classifyVisualIssue(issue);
    assert.equal(classification.code, code);
    assert.equal(classification.severity, "blocking");
    assert.equal(classification.automaticRepair, true);
  }
});

test("a categorical style mismatch remains blocking after the final image attempt", () => {
  assert.deepEqual(blockingStyleContinuityIssues([
    "Image 1 is soft_painterly while Image 2 is realistic_dimensional.",
  ]), [
    "Image 1 is soft_painterly while Image 2 is realistic_dimensional.",
  ]);
  assert.deepEqual(blockingStyleContinuityIssues([]), []);
});

test("an unresolved page-quality decision carries its preserved candidate into targeted repair", () => {
  const error = new IllustrationQualityError({
    candidateImageUrl: "/outputs/page-7-attempt2.png",
    rejectionKind: "scene",
    issues: ["Required named character Maïté is missing."],
    attemptCount: 2,
  });
  assert.equal(error.code, "illustration_quality_review");
  assert.equal(error.candidateImageUrl, "/outputs/page-7-attempt2.png");
  assert.equal(error.rejectionKind, "scene");
  assert.equal(error.attemptCount, 2);
  assert.deepEqual(error.issueCodes, ["required_cast_missing"]);
  assert.equal(error.repairPolicy.automaticRepair, true);
  assert.deepEqual(error.issues, ["Required named character Maïté is missing."]);
});

test("objective identity defects skip a second full regeneration and enter targeted repair", async () => {
  const qualityGate = await fs.readFile("src/services/imageQualityGate.js", "utf8");
  assert.match(qualityGate, /quarantined-for-targeted-repair/);
  assert.match(qualityGate, /automaticRepairPolicy\.automaticRepair/);
  assert.match(qualityGate, /attemptLimit = attempt/);
  assert.match(qualityGate, /TARGETED REPAIR VERIFICATION/);
  assert.match(qualityGate, /issueScope: qualityReviewScope/);
});

test("physical snapshot contradictions are blocking and automatically repairable", () => {
  for (const [issue, code] of [
    ["Physical environment is wrong. The people are still submerged.", "wrong_physical_environment"],
    ["Conditional equipment state conflicts. Bastien still wears the stored bubble.", "conditional_equipment_state"],
    ["Conditional equipment is duplicated. Marie wears one bubble and stores another.", "conditional_equipment_duplicate"],
    ["Multiple causal phases are combined. Arrival and storage appear together.", "multi_phase_composite"],
  ]) {
    const policy = targetedVisualRepairPolicy([issue]);
    assert.equal(policy.automaticRepair, true);
    assert.deepEqual(policy.targetCodes, [code]);
  }
});

test("unique landmark defects are blocking and automatically repairable", () => {
  for (const [issue, code] of [
    ["Unique landmark is duplicated. The lighthouse appears twice.", "unique_landmark_duplicate"],
    ["Landmark location is wrong. The underwater lighthouse stands on the dry beach.", "landmark_wrong_location"],
  ]) {
    assert.deepEqual(objectiveSceneContractIssues([issue]), [issue]);
    const policy = targetedVisualRepairPolicy([issue]);
    assert.equal(policy.automaticRepair, true);
    assert.deepEqual(policy.targetCodes, [code]);
  }
});

test("image prompts lock fixed landmarks to one canonical home and adjacent visibility", () => {
  const prompt = sceneContractImagePrompt({
    contract: {
      main_action: { subject: "Bastien", verb: "dessine", target: "une pousse" },
      render_snapshot: {
        visible_phase: "after",
        location: "atelier sec",
        physical_medium: "breathable_air",
        main_action: { subject: "Bastien", verb: "dessine", target: "une pousse" },
        equipment: [],
        fixed_entities: [{
          id: "phare_jardin_corail",
          name: "phare du jardin de corail",
          home_location: "jardin de corail",
          home_side: "adventure",
          camera_location: "atelier sec",
          camera_side: "origin",
          status: "other_side_only",
          camera_quantity: 0,
          other_side_quantity_limit: 1,
          global_quantity_limit: 1,
          adjacent_visibility: [
            { scene_number: 10, location: "jardin de corail", status: "visible_once" },
            { scene_number: 11, location: "atelier sec", status: "other_side_only" },
            { scene_number: 12, location: "atelier sec", status: "other_side_only" },
          ],
          rule: "Camera-side quantity is zero; only beyond the established bounded passage.",
        }],
        forbidden: [],
      },
    },
  });

  assert.match(prompt, /UNIQUE FIXED ENTITIES/iu);
  assert.match(prompt, /whole-story limit 1/iu);
  assert.match(prompt, /scene 10 jardin de corail = visible_once/iu);
  assert.match(prompt, /Never invent a second instance/iu);
});

test("image prompts carry the signed deterministic composition without weakening scene facts", () => {
  const prompt = sceneContractImagePrompt({
    contract: {
      artifact_digest: "artifact-1",
      main_action: { subject: "Bastien", verb: "place", target: "the pearl" },
      visual_composition: {
        version: 1,
        composition_id: "choice_triangle",
        framing: "single square illustration",
        shot_scale: "medium decision view",
        viewpoint: "eye-level three-quarter view",
        subject_placement: "hero, choice and consequence form a clean visual triangle",
        depth_plan: "choice foreground, deciding hero middle ground and supporting cast behind",
        visual_rhythm: "held decision",
        cast_readability: "keep every required character complete, separate and readable",
        action_readability: "composition may vary, but the signed main action may not change",
      },
      scene_density: {
        version: 1,
        age_band: "6-8",
        density_mode: "clear_layered",
        high_salience_limit: 2,
        decorative_detail_limit: 3,
        primary_focus: ["Bastien", "the pearl"],
        supporting_cast: ["Maman"],
        supporting_elements: ["the coral gate"],
        background_states: ["the map: visible"],
        hierarchy_rule: "Only the primary focus may carry maximum contrast and detail.",
        decoration_rule: "Add at most 3 non-canonical decorative accents.",
      },
    },
  });
  assert.match(prompt, /LOCKED VISUAL COMPOSITION/iu);
  assert.match(prompt, /medium decision view/iu);
  assert.match(prompt, /MAIN ACTION: hero child place recurring story companion 1/iu);
  assert.match(prompt, /signed main action may not change/iu);
  assert.match(prompt, /LOCKED SCENE DENSITY for age band 6-8/iu);
  assert.match(prompt, /maximum 2 high-salience entities/iu);
  assert.match(prompt, /Only the primary focus may carry maximum contrast/iu);
});

test("image prompts remove brands and product comparisons while preserving generic clothing", () => {
  const sanitized = sanitizeBrandSensitiveText('FIXED OUTFIT: t-shirt gris à l’effigie de Sonic bleu, short rouge, sandales rouges type Crocs, casquette avec inscription "NYC" blanche.');
  assert.doesNotMatch(sanitized, /Sonic|Crocs|NYC/iu);
  assert.match(sanitized, /t-shirt gris/iu);
  assert.match(sanitized, /short rouge/iu);
  assert.match(sanitized, /plain generic unbranded detail/iu);
  assert.match(sanitized, /generic unbranded design/iu);
});

test("the failed page 12 becomes a compact neutral visual contract without dialogue or commercial names", () => {
  const contract = {
    story_beat: "Montrer la naissance d'une relation de confiance essentielle pour l'aventure.",
    source_prose: 'Nolan avoua : "Parfois, j’ai peur de parler, Winnie." L’ours en peluche lui répondit longuement.',
    main_action: { subject: "Nolan", verb: "écoute et échange avec", target: "Winnie" },
    named_characters: [
      { name: "Nolan", visual_role: "actor", action: "écoute Winnie avec un sourire" },
      { name: "Winnie", visual_role: "actor", action: "rassure Nolan" },
      { name: "Mathéo", visual_role: "observer", action: "encourage Nolan" },
    ],
    required_elements: [{ description: "vallée des dinosaures avec fougères géantes", quantity: "1", scale: "large" }],
    object_states: [
      { name: "casquette rouge spéciale", owner: "Nolan", state: "worn", quantity: 1, instruction: "Nolan porte sa casquette rouge" },
      { name: "coq en or", state: "absent", quantity: 1, instruction: "reste invisible" },
    ],
    forbidden_elements: ["coq en or visible"],
    planned_image_context: "t-shirt à l'effigie de Sonic, sandales type Crocs",
  };
  const visualAliases = [
    { name: "Nolan", alias: "hero child" },
    { name: "Winnie", alias: "original unbranded plush-bear companion 1" },
    { name: "Mathéo", alias: "family member 1" },
  ];
  const prompt = sceneContractImagePrompt({ contract, stylePrompt: "gouache douce", visualAliases });
  assert.match(prompt, /every listed person or animal is one complete, separate individual/iu);
  assert.match(prompt, /hero child écoute et échange avec original unbranded plush-bear companion 1/iu);
  assert.match(prompt, /vallée des dinosaures avec fougères géantes/iu);
  assert.match(prompt, /casquette rouge spéciale: state worn/iu);
  assert.doesNotMatch(prompt, /Parfois|source_prose|planned_image_context|Sonic|Crocs|\bWinnie\b|\bNolan\b|\bMathéo\b/iu);

  const fallback = sceneContractImagePrompt({ contract, stylePrompt: "gouache douce", visualAliases, safetyFallback: true });
  assert.match(fallback, /policy-safe/iu);
  assert.doesNotMatch(fallback, /coq en or|FORBIDDEN/iu);
});

test("provider safety fallback removes risky pixels monotonically and ends in private quarantine", async () => {
  const references = [
    { kind: "continuity", storageKey: "cover" },
    { kind: "adjacent_scene", storageKey: "page-3" },
    { kind: "identity", storageKey: "child" },
  ];
  assert.deepEqual(
    imageSafetyFallbackReferences(references, IMAGE_SAFETY_FALLBACK_STAGES.FULL_REFERENCES),
    references,
  );
  assert.deepEqual(
    imageSafetyFallbackReferences(references, IMAGE_SAFETY_FALLBACK_STAGES.CONTINUITY_ONLY),
    [references[0]],
  );
  assert.deepEqual(
    imageSafetyFallbackReferences(references, IMAGE_SAFETY_FALLBACK_STAGES.CONTRACT_ONLY),
    [],
  );
  assert.equal(
    nextImageSafetyFallbackStage(references, IMAGE_SAFETY_FALLBACK_STAGES.FULL_REFERENCES),
    IMAGE_SAFETY_FALLBACK_STAGES.CONTINUITY_ONLY,
  );
  assert.equal(
    nextImageSafetyFallbackStage(references, IMAGE_SAFETY_FALLBACK_STAGES.CONTINUITY_ONLY),
    IMAGE_SAFETY_FALLBACK_STAGES.CONTRACT_ONLY,
  );
  assert.equal(
    nextImageSafetyFallbackStage(references, IMAGE_SAFETY_FALLBACK_STAGES.CONTRACT_ONLY),
    null,
  );
  assert.equal(
    nextImageSafetyFallbackStage([{ kind: "identity" }], IMAGE_SAFETY_FALLBACK_STAGES.FULL_REFERENCES),
    IMAGE_SAFETY_FALLBACK_STAGES.CONTRACT_ONLY,
  );
  const quarantine = new IllustrationSafetyQuarantineError({ attemptCount: 3 });
  assert.equal(quarantine.code, "illustration_provider_safety_quarantine");
  assert.deepEqual(quarantine.issueCodes, ["provider_safety_rejection"]);

  const [qualityGate, app] = await Promise.all([
    fs.readFile("src/services/imageQualityGate.js", "utf8"),
    fs.readFile("public/app.js", "utf8"),
  ]);
  assert.match(qualityGate, /let attemptLimit = maximumAttempts/);
  assert.match(qualityGate, /if \(attempt === attemptLimit\) attemptLimit \+= 1/);
  assert.match(qualityGate, /IMAGE_SAFETY_FALLBACK_STAGES\.CONTINUITY_ONLY/);
  assert.match(qualityGate, /IMAGE_SAFETY_FALLBACK_STAGES\.CONTRACT_ONLY/);
  assert.match(qualityGate, /qualityReferenceImages = null/);
  assert.match(qualityGate, /referenceImages: evidenceReferenceImages/);
  assert.match(app, /if \(error\?\.technical\) \{\s*await showGenerationFailure\(\)/);
});
