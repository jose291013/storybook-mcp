import test from "node:test";
import assert from "node:assert/strict";
import {
  generationCheckpoint,
  isReusableDraftPage,
  mergeGenerationCheckpoint,
  previewRequestFingerprint,
  technicalPreviewRetryAvailable,
  technicalPreviewRetryExhausted,
} from "../src/services/previewGenerationCheckpoint.js";

test("preview checkpoint fingerprints are stable and retain unrelated continuity data", () => {
  const left = { answers: { age: "5", hero_name: "Noa" }, photos: [{ id: "1", storageKey: "reference-photos/1.jpg", role: "child" }] };
  const right = { photos: [{ role: "child", storageKey: "reference-photos/1.jpg", id: "1" }], answers: { hero_name: "Noa", age: "5" } };
  const fingerprint = previewRequestFingerprint(left);
  assert.equal(fingerprint, previewRequestFingerprint(right));
  const continuitySnapshot = mergeGenerationCheckpoint({ referenceRecovery: { available: false } }, {
    fingerprint,
    draftTexts: { 1: "Il était une fois…" },
    retryAvailable: true,
  });
  const project = { continuitySnapshot };
  assert.equal(generationCheckpoint(project, fingerprint).draftTexts[1], "Il était une fois…");
  assert.equal(project.continuitySnapshot.referenceRecovery.available, false);
  assert.equal(technicalPreviewRetryAvailable(project), true);
  assert.equal(technicalPreviewRetryExhausted(project), false);
});

test("only fully persisted draft pages are reused after an interrupted Render job", () => {
  assert.equal(isReusableDraftPage({ page_number: 12, storageKey: "previews/p12.png", previewUrl: "/api/p12.png" }), true);
  assert.equal(isReusableDraftPage({ page_number: 12, previewUrl: "/api/p12.png" }), false);
  assert.equal(isReusableDraftPage(null), false);
});
