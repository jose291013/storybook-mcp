import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { sceneContractImagePrompt } from "../src/agents/storyScenePlanner.js";
import {
  blockingSceneContractIssues,
  blockingStyleContinuityIssues,
  classifyVisualIssue,
  IllustrationQualityError,
  isImageSafetyRejection,
  isTransientImageGenerationError,
  objectiveSceneContractIssues,
  objectiveTechnicalIssues,
  targetedVisualRepairPolicy,
} from "../src/services/imageQualityGate.js";
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

test("scene QA discards wardrobe-only reports but keeps narrative and object-state contradictions", () => {
  assert.deepEqual(objectiveSceneContractIssues([
    "Nolan does not wear the locked grey Sonic T-shirt and red Crocs.",
    "Mathéo ne porte pas sa casquette noire ni la tenue décrite.",
    "Jérôme no lleva la camiseta ni la gorra solicitadas.",
  ]), []);
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
  assert.equal(policy.version, 2);
  assert.equal(policy.automaticRepair, true);
  assert.deepEqual(policy.targetCodes, ["identity_duplicate", "required_cast_missing"]);
  assert.ok(policy.verificationCodes.includes("identity_fusion"));
});

test("a targeted repair edits the preserved candidate before continuity and identity references", () => {
  const references = prioritizeVisualReferences([
    { kind: "identity", label: "hero" },
    { kind: "continuity", label: "cover" },
    { kind: "repair_source", label: "page candidate" },
  ]);
  assert.deepEqual(references.map((item) => item.kind), ["repair_source", "continuity", "identity"]);
  const prompt = buildFinalPrompt({
    prompt: "Remove only the duplicated hero.",
    referenceImages: references,
  });
  assert.match(prompt, /TARGET IMAGE TO EDIT/);
  assert.match(prompt, /smallest local correction/);
  assert.match(prompt, /do not redesign or regenerate the scene/);
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

test("a final-attempt safety rejection receives one bounded continuity-only replacement", async () => {
  const [qualityGate, app] = await Promise.all([
    fs.readFile("src/services/imageQualityGate.js", "utf8"),
    fs.readFile("public/app.js", "utf8"),
  ]);
  assert.match(qualityGate, /let attemptLimit = maximumAttempts/);
  assert.match(qualityGate, /if \(attempt === attemptLimit\) attemptLimit \+= 1/);
  assert.match(qualityGate, /omitReferenceImages/);
  assert.match(qualityGate, /filter\(\(reference\) => reference\?\.kind === "continuity"\)/);
  assert.match(app, /if \(error\?\.technical\) \{\s*await showGenerationFailure\(\)/);
});
