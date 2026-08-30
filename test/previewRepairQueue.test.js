import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPreviewRepairQueue,
  finalizePreviewRepairQueue,
  startPreviewRepairQueue,
} from "../src/services/previewRepairQueue.js";

function imagePage(pageNumber, overrides = {}) {
  return {
    page_number: pageNumber,
    page_type: "image",
    storageKey: `private/page-${pageNumber}`,
    imageStorageKey: `private/image-${pageNumber}`,
    previewUrl: `/preview/page-${pageNumber}`,
    qualityStatus: "strict_accepted",
    strictEvidenceVersion: 2,
    ...overrides,
  };
}

test("repair queue aggregates provider gaps and strict quarantines without customer content", () => {
  const queue = buildPreviewRepairQueue({
    totalPageCount: 36,
    previewResult: {
      deferredIllustrationPages: [{
        pageNumber: 8,
        kind: "provider_safety",
        issueCodes: ["provider_safety_rejection"],
        prompt: "must never persist",
      }],
      draftPages: [
        imagePage(3),
        imagePage(11, {
          qualityStatus: "strict_quarantined",
          qualityKind: "scene",
          qualityIssueCodes: ["wrong_physical_medium", "main_action_mismatch"],
          qualityIssues: ["private evaluator prose"],
        }),
        imagePage(35, {
          qualityStatus: "strict_quarantined",
          qualityKind: "scene",
          qualityIssueCodes: ["wardrobe_state_mismatch"],
        }),
      ],
    },
  });

  assert.equal(queue.version, 1);
  assert.equal(queue.totalPageCount, 36);
  assert.equal(queue.readyPageCount, 33);
  assert.equal(queue.pendingPageCount, 3);
  assert.deepEqual(queue.pendingPageNumbers, [8, 11, 35]);
  assert.deepEqual(queue.pages[1].issueCodes, ["main_action_mismatch", "wrong_physical_medium"]);
  assert.doesNotMatch(JSON.stringify(queue), /must never persist|private evaluator prose/);
});

test("repair queue lifecycle is bounded and preserves its immutable blocker digest", () => {
  const queue = buildPreviewRepairQueue({
    totalPageCount: 24,
    previewResult: {
      deferredIllustrationPages: [{ pageNumber: 8, issueCodes: ["provider_safety_rejection"] }],
    },
  });
  const running = startPreviewRepairQueue(queue, "2026-08-30T10:00:00.000Z");
  assert.equal(running.status, "repairing");
  assert.equal(running.attemptCount, 1);
  assert.equal(running.digest, queue.digest);

  const retryable = finalizePreviewRepairQueue(running, { retryAvailable: true });
  assert.equal(retryable.status, "awaiting_retry");
  assert.equal(retryable.retryAvailable, true);

  const exhausted = finalizePreviewRepairQueue(running, { retryAvailable: false });
  assert.equal(exhausted.status, "exhausted");
  assert.equal(exhausted.retryAvailable, false);
});

test("repair queue collapses duplicate evidence for the same page", () => {
  const queue = buildPreviewRepairQueue({
    totalPageCount: 24,
    previewResult: {
      deferredIllustrationPages: [{ pageNumber: 8, issueCodes: ["provider_safety_rejection"] }],
      draftPages: [imagePage(8, {
        qualityStatus: "strict_quarantined",
        qualityIssueCodes: ["wardrobe_state_mismatch"],
      })],
    },
  });
  assert.equal(queue.pendingPageCount, 1);
  assert.deepEqual(queue.pages[0].issueCodes, ["provider_safety_rejection", "wardrobe_state_mismatch"]);
  assert.equal(queue.pages[0].source, "provider_and_quality");
});
