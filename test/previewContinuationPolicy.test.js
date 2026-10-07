import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  generationCheckpoint, mergeGenerationCheckpoint, ORDINARY_OUTFIT_BINDING_VERSION,
  PREVIEW_RETRY_POLICY_VERSION, previewContinuationPolicy, technicalPreviewRetryAvailable,
} from "../src/services/previewGenerationCheckpoint.js";
import { prepareVisualProofTransition, previewResultForVisualProofTransition } from "../src/services/visualProofRetryTransaction.js";

function projectAt(status, patch = {}) {
  return {
    status,
    continuitySnapshot: mergeGenerationCheckpoint({}, {
      fingerprint: "synthetic-book", retryPolicyVersion: PREVIEW_RETRY_POLICY_VERSION,
      visualProof: { status: "awaiting_approval", attempts: 1 }, ...patch,
    }),
  };
}

function policy(project, visualProofTransition) {
  return previewContinuationPolicy({ project, checkpoint: generationCheckpoint(project), visualProofTransition });
}

test("cover approval and included regeneration reuse entitlement without consuming technical recovery", () => {
  for (const action of ["approve", "regenerate"]) {
    const project = projectAt("preview_generating");
    const transition = prepareVisualProofTransition({ visualProof: generationCheckpoint(project).visualProof, requestedAction: action });
    assert.deepEqual(policy(project, transition), { technicalRetry: false, reusesEntitlement: true, exhausted: false });
  }
});

test("the first interior failure retains one retry and a subsequent failure exhausts it", () => {
  const firstFailure = projectAt("preview_failed", {
    visualProof: { status: "approved", attempts: 1 }, retryAvailable: true,
    ordinaryOutfitBindingVersion: ORDINARY_OUTFIT_BINDING_VERSION,
  });
  const transition = prepareVisualProofTransition({ visualProof: generationCheckpoint(firstFailure).visualProof, resume: true });
  assert.equal(policy(firstFailure, transition).technicalRetry, true);
  const exhausted = projectAt("preview_failed", {
    ...generationCheckpoint(firstFailure), retryAvailable: false, retryExhausted: true, retryConsumedAt: "2026-10-07T09:00:00Z",
  });
  assert.deepEqual(policy(exhausted, transition), { technicalRetry: false, reusesEntitlement: true, exhausted: true });
});

test("a preserved pending cover decision does not spend a retry after interrupted queuing", () => {
  const project = projectAt("preview_failed", { retryAvailable: true });
  const transition = prepareVisualProofTransition({ visualProof: generationCheckpoint(project).visualProof, requestedAction: "approve" });
  assert.equal(policy(project, transition).technicalRetry, false);
  assert.equal(policy(project, transition).exhausted, false);
});

test("an interrupted approved run still resumes as a technical continuation", () => {
  const project = projectAt("preview_generating", { visualProof: { status: "approved", attempts: 1 } });
  const transition = prepareVisualProofTransition({ visualProof: generationCheckpoint(project).visualProof, resume: true });
  assert.equal(policy(project, transition).technicalRetry, true);
});

test("legacy pre-wardrobe failure gets one migration continuation with its approved cover and pages preserved", () => {
  const project = projectAt("preview_failed", {
    visualProof: { status: "approved", attempts: 1 }, retryAvailable: false, retryExhausted: true,
    retryConsumedAt: "2026-09-17T08:00:00Z", failureReason: "preview_generation_failed", phase: "v3-text-authority",
  });
  const original = structuredClone(project);
  const transition = prepareVisualProofTransition({ visualProof: generationCheckpoint(project).visualProof, resume: true });
  const assets = { coverStorageKey: "private/synthetic-cover.png", draftPages: [{ page_number: 3, storageKey: "private/synthetic-page.png" }] };
  assert.equal(policy(project, transition).technicalRetry, true);
  assert.equal(technicalPreviewRetryAvailable(project), true);
  assert.equal(previewResultForVisualProofTransition(assets, transition), assets);
  assert.deepEqual(project, original);
  const consumed = projectAt("preview_failed", { ...generationCheckpoint(project), ordinaryOutfitBindingVersion: ORDINARY_OUTFIT_BINDING_VERSION });
  assert.equal(technicalPreviewRetryAvailable(consumed), false);
  assert.equal(policy(consumed, transition).exhausted, true);
});

test("migration recovery does not reopen unrelated exhausted jobs or purchased books", () => {
  const legacy = {
    retryExhausted: true, retryAvailable: false, visualProof: { status: "approved" },
    failureReason: "preview_generation_failed", phase: "v3-text-authority",
  };
  for (const patch of [{ phase: "page:8" }, { visualProof: { status: "awaiting_approval" } }, { wardrobeVisualAuthority: { assets: [] } }]) {
    assert.equal(technicalPreviewRetryAvailable(projectAt("preview_failed", { ...legacy, ...patch })), false);
  }
  assert.equal(technicalPreviewRetryAvailable(projectAt("preview_ready", legacy)), false);
});

test("the shared preflight runs before cover generation and recovery version is installed transactionally", async () => {
  const route = await fs.readFile("src/routes/preview.js", "utf8");
  const preflight = route.indexOf('step: "draft:scene-render-preflight"');
  const cover = route.indexOf('step: "draft:cover"');
  assert.ok(preflight > 0 && cover > preflight);
  assert.match(route.slice(preflight, cover), /buildBookSceneContinuity/);
  assert.match(route.slice(preflight, cover), /compileWardrobeVisualAuthorityPlan/);
  assert.match(route, /ordinaryOutfitBindingVersion: ORDINARY_OUTFIT_BINDING_VERSION/);
  assert.match(route, /if \(isTechnicalGenerationRetry\)[\s\S]*?retryConsumedAt:/);
  assert.match(route, /continuation\.exhausted[\s\S]*?preview_retry_exhausted/);
});
