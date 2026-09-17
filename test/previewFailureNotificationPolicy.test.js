import test from "node:test";
import assert from "node:assert/strict";

import { shouldNotifyPreviewGenerationFailure } from "../src/services/previewFailureNotificationPolicy.js";

function resumableQueue(overrides = {}) {
  return {
    version: 1,
    status: "awaiting_retry",
    retryAvailable: true,
    pendingPageCount: 1,
    pendingPageNumbers: [8],
    ...overrides,
  };
}

test("a durable bounded page-repair continuation defers the failure email", () => {
  assert.equal(shouldNotifyPreviewGenerationFailure({
    errorCode: "preview_page_repair_required",
    repairQueue: resumableQueue(),
    retryAvailable: true,
  }), false);
});

test("an exhausted bounded page-repair queue sends the failure email", () => {
  assert.equal(shouldNotifyPreviewGenerationFailure({
    errorCode: "preview_page_repair_required",
    repairQueue: resumableQueue({ status: "exhausted", retryAvailable: false }),
    retryAvailable: false,
  }), true);
});

test("a missing or malformed repair queue cannot silence a failure email", () => {
  assert.equal(shouldNotifyPreviewGenerationFailure({
    errorCode: "preview_page_repair_required",
    repairQueue: null,
    retryAvailable: true,
  }), true);
  assert.equal(shouldNotifyPreviewGenerationFailure({
    errorCode: "preview_page_repair_required",
    repairQueue: resumableQueue({ pendingPageCount: 2 }),
    retryAvailable: true,
  }), true);
});

test("infrastructure and ordinary generation failures keep their notifications", () => {
  for (const errorCode of ["preview_interrupted", "preview_generation_failed", "preview_provider_billing_unavailable"]) {
    assert.equal(shouldNotifyPreviewGenerationFailure({
      errorCode,
      repairQueue: resumableQueue(),
      retryAvailable: true,
    }), true);
  }
});
