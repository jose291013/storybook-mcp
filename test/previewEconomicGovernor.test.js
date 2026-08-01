import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluatePreviewEconomicGovernor,
  previewEconomicDecision,
} from "../src/services/previewEconomicGovernor.js";

const policy = {
  previewTargetUsd: 2,
  previewHardLimitUsd: 3,
};

test("economic governor contains optional retries without blocking the customer", () => {
  const normal = previewEconomicDecision(1_999_999, policy);
  assert.equal(normal.mode, "normal");
  assert.equal(normal.optionalVisualRetry, true);

  const containment = previewEconomicDecision(2_000_000, policy);
  assert.equal(containment.mode, "containment");
  assert.equal(containment.optionalVisualRetry, false);
  assert.equal(containment.mustCompleteRequiredPages, true);
  assert.equal(containment.customerBlocking, false);

  const completion = previewEconomicDecision(3_000_000, policy);
  assert.equal(completion.mode, "completion_first");
  assert.equal(completion.optionalNarrativeAudit, false);
  assert.equal(completion.customerBlocking, false);
});

test("economic governor reads private attributed cost only", async () => {
  const result = await evaluatePreviewEconomicGovernor("private-project", {
    readCost: async (projectId) => projectId === "private-project" ? 2_500_000 : 0,
    policy,
  });
  assert.equal(result.mode, "containment");
  assert.equal(Object.hasOwn(result, "spentUsdMicros"), false);
});
