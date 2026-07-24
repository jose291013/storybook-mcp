import test from "node:test";
import assert from "node:assert/strict";
import {
  generationCheckpoint,
  isReusableDraftPage,
  mergeGenerationCheckpoint,
  PREVIEW_RETRY_POLICY_VERSION,
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

test("an exhausted legacy preview gets one recovery under the safer image policy", () => {
  const legacy = {
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "legacy-book",
      retryAvailable: false,
      retryExhausted: true,
      retryConsumedAt: "2026-07-21T18:00:00.000Z",
    }),
  };
  assert.equal(technicalPreviewRetryAvailable(legacy), true);
  assert.equal(technicalPreviewRetryExhausted(legacy), false);

  const current = {
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "current-book",
      retryPolicyVersion: PREVIEW_RETRY_POLICY_VERSION,
      retryAvailable: false,
      retryExhausted: true,
      retryConsumedAt: "2026-07-21T19:00:00.000Z",
    }),
  };
  assert.equal(technicalPreviewRetryAvailable(current), false);
  assert.equal(technicalPreviewRetryExhausted(current), true);
});

test("a preview exhausted under policy four receives the targeted story-repair recovery", () => {
  const exhaustedStory = {
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "story-fidelity-book",
      retryPolicyVersion: 4,
      retryAvailable: false,
      retryExhausted: true,
      retryConsumedAt: "2026-07-24T18:30:00.000Z",
      failureReason: "preview_generation_failed",
    }),
  };
  assert.equal(technicalPreviewRetryAvailable(exhaustedStory), true);
  assert.equal(technicalPreviewRetryExhausted(exhaustedStory), false);
});

test("a Render interruption remains recoverable after a retry was already consumed", () => {
  const interrupted = {
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "interrupted-book",
      retryPolicyVersion: PREVIEW_RETRY_POLICY_VERSION,
      retryAvailable: false,
      retryExhausted: true,
      retryConsumedAt: "2026-07-22T08:30:00.000Z",
      failureReason: "preview_interrupted",
    }),
  };
  assert.equal(technicalPreviewRetryAvailable(interrupted), true);
  assert.equal(technicalPreviewRetryExhausted(interrupted), false);
});

test("only fully persisted draft pages are reused after an interrupted Render job", () => {
  assert.equal(isReusableDraftPage({ page_number: 12, storageKey: "previews/p12.png", previewUrl: "/api/p12.png" }), true);
  assert.equal(isReusableDraftPage({ page_number: 12, previewUrl: "/api/p12.png" }), false);
  assert.equal(isReusableDraftPage(null), false);
});

test("the targeted story-repair recovery policy is version five", () => {
  assert.equal(PREVIEW_RETRY_POLICY_VERSION, 5);
});
