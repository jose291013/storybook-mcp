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

test("legacy wardrobe defaults keep their fingerprint while explicit choices invalidate it", () => {
  const legacy = {
    answers: { age: "8", hero_name: "Nolan", universe_id: "coral_ocean" },
    photos: [{ id: "1", storageKey: "reference-photos/1.jpg", role: "child", story_role: "hero", name: "Nolan" }],
  };
  const normalizedLegacy = {
    ...legacy,
    photos: [{
      ...legacy.photos[0],
      outfit_preference: "preserve_photo",
      outfit_id: "",
      outfit_contract: "reference outfit",
      outfit_selection_explicit: false,
    }],
  };
  assert.equal(previewRequestFingerprint(legacy), previewRequestFingerprint(normalizedLegacy));
  const explicit = {
    ...normalizedLegacy,
    photos: [{
      ...normalizedLegacy.photos[0],
      outfit_preference: "selected",
      outfit_id: "reef_explorer",
      outfit_contract: "turquoise wetsuit",
      outfit_selection_explicit: true,
    }],
  };
  assert.notEqual(previewRequestFingerprint(legacy), previewRequestFingerprint(explicit));
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

test("a preview exhausted under policy five receives the deterministic cast-guard recovery", () => {
  const exhaustedStory = {
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "story-cast-guard-book",
      retryPolicyVersion: 5,
      retryAvailable: false,
      retryExhausted: true,
      retryConsumedAt: "2026-07-24T20:05:00.000Z",
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

test("a preview exhausted under policy six receives the relation-first cast recovery", () => {
  const exhaustedImage = {
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "sibling-cast-book",
      retryPolicyVersion: 6,
      retryAvailable: false,
      retryExhausted: true,
      retryConsumedAt: "2026-07-25T07:30:00.000Z",
      failureReason: "preview_generation_failed",
    }),
  };
  assert.equal(technicalPreviewRetryAvailable(exhaustedImage), true);
  assert.equal(technicalPreviewRetryExhausted(exhaustedImage), false);
});

test("a preview exhausted under policy seven receives the resumable audit recovery", () => {
  const exhaustedAudit = {
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "story-audit-timeout-book",
      retryPolicyVersion: 7,
      retryAvailable: false,
      retryExhausted: true,
      retryConsumedAt: "2026-07-29T16:30:00.000Z",
      failureReason: "preview_generation_failed",
      phase: "text:24",
    }),
  };
  assert.equal(technicalPreviewRetryAvailable(exhaustedAudit), true);
  assert.equal(technicalPreviewRetryExhausted(exhaustedAudit), false);
});

test("a preview exhausted under policy eight receives the full-plan repair recovery", () => {
  const exhaustedPlanRepair = {
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "story-contract-repair-book",
      retryPolicyVersion: 8,
      retryAvailable: false,
      retryExhausted: true,
      retryConsumedAt: "2026-07-29T18:00:00.000Z",
      failureReason: "preview_generation_failed",
      phase: "story-plan:targeted-candidate",
    }),
  };
  assert.equal(technicalPreviewRetryAvailable(exhaustedPlanRepair), true);
  assert.equal(technicalPreviewRetryExhausted(exhaustedPlanRepair), false);
});

test("a preview exhausted under policy nine receives the narrative compiler recovery", () => {
  const exhaustedCompilerCandidate = {
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "family-address-compiler-book",
      retryPolicyVersion: 9,
      retryAvailable: false,
      retryExhausted: true,
      retryConsumedAt: "2026-07-29T21:00:00.000Z",
      failureReason: "preview_generation_failed",
      phase: "story-plan:targeted-candidate",
    }),
  };
  assert.equal(technicalPreviewRetryAvailable(exhaustedCompilerCandidate), true);
  assert.equal(technicalPreviewRetryExhausted(exhaustedCompilerCandidate), false);
});

test("a preview exhausted under policy ten receives the legacy audit compatibility recovery", () => {
  const exhaustedLegacyAuditCandidate = {
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "legacy-family-audit-book",
      retryPolicyVersion: 10,
      retryAvailable: false,
      retryExhausted: true,
      retryConsumedAt: "2026-07-29T22:00:00.000Z",
      failureReason: "preview_generation_failed",
      phase: "story-plan:targeted-candidate",
    }),
  };
  assert.equal(technicalPreviewRetryAvailable(exhaustedLegacyAuditCandidate), true);
  assert.equal(technicalPreviewRetryExhausted(exhaustedLegacyAuditCandidate), false);
});

test("a preview exhausted under policy eleven receives the authoritative audit recovery", () => {
  const exhaustedStaleAuditCandidate = {
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "stale-non-rendered-audit-context",
      retryPolicyVersion: 11,
      retryAvailable: false,
      retryExhausted: true,
      retryConsumedAt: "2026-07-30T10:00:00.000Z",
      failureReason: "preview_generation_failed",
      phase: "story-plan:targeted-candidate",
    }),
  };
  assert.equal(technicalPreviewRetryAvailable(exhaustedStaleAuditCandidate), true);
  assert.equal(technicalPreviewRetryExhausted(exhaustedStaleAuditCandidate), false);
});

test("a preview exhausted under policy twelve receives the versioned audit-checkpoint recovery", () => {
  const exhaustedCachedAudit = {
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "cached-targeted-audit-response",
      retryPolicyVersion: 12,
      retryAvailable: false,
      retryExhausted: true,
      retryConsumedAt: "2026-07-30T11:00:00.000Z",
      failureReason: "preview_generation_failed",
      phase: "story-plan:targeted-candidate",
      storyPlanProviderResponses: {
        "audit:targeted:primary": {
          responseId: "resp_legacy_targeted_audit",
          status: "completed",
        },
      },
    }),
  };
  assert.equal(technicalPreviewRetryAvailable(exhaustedCachedAudit), true);
  assert.equal(technicalPreviewRetryExhausted(exhaustedCachedAudit), false);
});

test("a targeted candidate exhausted under policy fourteen receives the structured repair recovery", () => {
  const exhaustedTargetedCandidate = {
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "structured-targeted-repair-book",
      retryPolicyVersion: 14,
      retryAvailable: false,
      retryExhausted: true,
      retryConsumedAt: "2026-07-30T18:30:00.000Z",
      failureReason: "preview_generation_failed",
      phase: "story-plan:targeted-candidate",
      storyScenePlanCandidateStage: "targeted-plan",
      storyScenePlanCandidateRepairVersion: 0,
    }),
  };
  assert.equal(technicalPreviewRetryAvailable(exhaustedTargetedCandidate), true);
  assert.equal(technicalPreviewRetryExhausted(exhaustedTargetedCandidate), false);
});

test("a structured plan exhausted under policy fifteen receives the targeted text recovery", () => {
  const exhaustedStructuredPlan = {
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "targeted-text-repair-book",
      retryPolicyVersion: 15,
      retryAvailable: false,
      retryExhausted: true,
      retryConsumedAt: "2026-07-30T20:15:00.000Z",
      failureReason: "preview_generation_failed",
      phase: "story-plan:targeted-candidate",
      storyScenePlanCandidateStage: "targeted-plan",
      storyScenePlanCandidateRepairVersion: 2,
    }),
  };
  assert.equal(technicalPreviewRetryAvailable(exhaustedStructuredPlan), true);
  assert.equal(technicalPreviewRetryExhausted(exhaustedStructuredPlan), false);
});

test("the strict V3 quarantine recovery policy is version eighteen", () => {
  assert.equal(PREVIEW_RETRY_POLICY_VERSION, 18);
});

test("a book exhausted before strict V3 quarantine recovery receives one checkpoint resume", () => {
  const exhaustedBeforeQuarantineRecovery = {
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "strict-quarantine-book",
      retryPolicyVersion: 17,
      retryAvailable: false,
      retryExhausted: true,
      retryConsumedAt: "2026-08-21T10:30:00.000Z",
      failureReason: "narrative_v3_illustration_evidence_incomplete",
      phase: "page:32",
    }),
  };
  assert.equal(technicalPreviewRetryAvailable(exhaustedBeforeQuarantineRecovery), true);
  assert.equal(technicalPreviewRetryExhausted(exhaustedBeforeQuarantineRecovery), false);
});

test("a book exhausted before provider-safety page isolation receives one checkpoint resume", () => {
  const exhaustedBeforeIsolation = {
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "provider-safety-gap-book",
      retryPolicyVersion: 16,
      retryAvailable: false,
      retryExhausted: true,
      retryConsumedAt: "2026-08-21T09:00:00.000Z",
      failureReason: "preview_generation_failed",
      phase: "page:10",
    }),
  };
  assert.equal(technicalPreviewRetryAvailable(exhaustedBeforeIsolation), true);
  assert.equal(technicalPreviewRetryExhausted(exhaustedBeforeIsolation), false);
});
