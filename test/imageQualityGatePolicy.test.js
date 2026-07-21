import test from "node:test";
import assert from "node:assert/strict";
import { isImageSafetyRejection, objectiveTechnicalIssues } from "../src/services/imageQualityGate.js";

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
