import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyQualityReviewFailure,
  qualityReviewInstructionFingerprint,
  qualityReviewRepairStrategy,
} from "../src/services/qualityReviewFailurePolicy.js";

test("quality-review instruction fingerprints are normalized without storing creator wording", () => {
  const first = qualityReviewInstructionFingerprint("  Garder le lieu, changer le geste  ");
  const same = qualityReviewInstructionFingerprint("garder le lieu,   changer le geste");
  assert.equal(first, same);
  assert.equal(first.length, 64);
  assert.doesNotMatch(first, /garder|geste/);
});

test("an incompatible request is not blindly repeated and suggests the other scope", () => {
  const failure = classifyQualityReviewFailure(
    new Error("The revised text conflicts with the approved scene: wrong_location"),
    "text",
  );
  assert.equal(failure.kind, "request_incompatible");
  assert.equal(failure.retrySameInstruction, false);
  assert.equal(failure.suggestedScope, "illustration");
});

test("a temporary provider failure keeps a bounded conservative retry", () => {
  const failure = classifyQualityReviewFailure(new Error("Provider timeout"), "illustration");
  assert.equal(failure.kind, "temporary_failure");
  assert.equal(failure.retrySameInstruction, true);
  assert.equal(qualityReviewRepairStrategy({ attemptNumber: 2, previousFailureKind: failure.kind }), "resilient_source_preserving_retry");
});
