import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { isImageSafetyRejection, objectiveSceneContractIssues, objectiveTechnicalIssues } from "../src/services/imageQualityGate.js";
import { sanitizeBrandSensitiveText } from "../src/services/imageRunner.js";

test("image QA ignores artistic preferences and retains objective file defects", () => {
  assert.deepEqual(objectiveTechnicalIssues(["photo-realistic style, not an illustration"]), []);
  assert.deepEqual(objectiveTechnicalIssues(["different outfit and preferred composition"]), []);
  assert.deepEqual(
    objectiveTechnicalIssues(["repeated bands and corrupted pixels", "photo-realistic style"]),
    ["repeated bands and corrupted pixels"],
  );
});

test("OpenAI safety rejections are identified for a safer continuity-only retry", () => {
  assert.equal(isImageSafetyRejection(new Error("Your request was rejected by the safety system.")), true);
  assert.equal(isImageSafetyRejection(new Error("Network timeout")), false);
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
});

test("image prompts remove explicit brand inscriptions while preserving generic clothing", () => {
  const sanitized = sanitizeBrandSensitiveText('FIXED OUTFIT: t-shirt gris à l’effigie de Sonic bleu, short rouge, casquette avec inscription "NYC" blanche.');
  assert.doesNotMatch(sanitized, /Sonic|NYC/iu);
  assert.match(sanitized, /t-shirt gris/iu);
  assert.match(sanitized, /short rouge/iu);
  assert.match(sanitized, /plain generic unbranded detail/iu);
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
