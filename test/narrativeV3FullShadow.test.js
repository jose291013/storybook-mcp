import assert from "node:assert/strict";
import test from "node:test";

import {
  NARRATIVE_V3_FULL_SHADOW_EXPECTED_FIXTURES,
  evaluateNarrativeV3ReleaseGates,
  narrativeV3FullShadowMatrix,
} from "../src/services/narrativeV3FullShadow.js";
import {
  createNarrativeV3RolloutAssignment,
  narrativeV3RolloutAssignment,
  narrativeV3RolloutBucket,
} from "../src/services/narrativeV3Rollout.js";

function passingReport(index) {
  return {
    fixtureId: `fixture-${index}`,
    status: "passed",
    deliveryReady: true,
    adversarialCases: 5,
    artifactDigests: Object.fromEntries(Array.from({ length: 11 }, (_, artifact) => [`artifact${artifact}`, String(artifact).padStart(64, "0")])),
    providerCalls: 0,
    paidModelCalls: 0,
    customerRoutesTouched: false,
  };
}

test("the full V3 shadow covers every language, universe and sellable format", () => {
  const matrix = narrativeV3FullShadowMatrix();
  assert.equal(matrix.length, NARRATIVE_V3_FULL_SHADOW_EXPECTED_FIXTURES);
  assert.equal(new Set(matrix.map((entry) => entry.language)).size, 3);
  assert.equal(new Set(matrix.map((entry) => entry.universeId)).size, 6);
  assert.equal(new Set(matrix.map((entry) => entry.pageCount)).size, 6);
});

test("release gates require complete quality, zero synthetic cost, privacy and replay evidence", () => {
  const reports = Array.from({ length: 108 }, (_, index) => passingReport(index));
  const passed = evaluateNarrativeV3ReleaseGates(reports, { replayVerified: true });
  assert.equal(passed.eligible, true);
  assert.match(passed.gateDigest, /^[a-f0-9]{64}$/);
  assert.equal(passed.cost.estimatedUsd, 0);
  assert.equal(evaluateNarrativeV3ReleaseGates(reports.slice(1), { replayVerified: true }).eligible, false);
  const paid = structuredClone(reports);
  paid[0].paidModelCalls = 1;
  assert.equal(evaluateNarrativeV3ReleaseGates(paid, { replayVerified: true }).eligible, false);
  assert.equal(evaluateNarrativeV3ReleaseGates(reports, { replayVerified: false }).eligible, false);
});

test("V3 rollout is off by default and cannot activate without a release gate digest", () => {
  const projectId = "v3-project";
  assert.equal(createNarrativeV3RolloutAssignment(projectId, { mode: "off", percent: 100 }).enabled, false);
  assert.equal(createNarrativeV3RolloutAssignment(projectId, { mode: "on", releaseGateDigest: "" }).enabled, false);
  assert.equal(createNarrativeV3RolloutAssignment(projectId, { mode: "shadow", releaseGateDigest: "a".repeat(64) }).shadow, true);
  assert.equal(createNarrativeV3RolloutAssignment(projectId, { mode: "shadow", releaseGateDigest: "a".repeat(64) }).enabled, false);
});

test("a gated canary is deterministic and a persisted assignment never changes mid-book", () => {
  const projectId = "v3-canary-project";
  const bucket = narrativeV3RolloutBucket(projectId);
  const digest = "b".repeat(64);
  assert.equal(createNarrativeV3RolloutAssignment(projectId, { mode: "canary", percent: bucket, releaseGateDigest: digest }).enabled, false);
  const stored = createNarrativeV3RolloutAssignment(projectId, {
    mode: "canary", percent: bucket + 1, releaseGateDigest: digest,
    now: () => "2026-08-18T12:00:00.000Z",
  });
  assert.equal(stored.enabled, true);
  const project = { id: projectId, continuitySnapshot: { narrativeV3Rollout: stored } };
  assert.equal(narrativeV3RolloutAssignment(project, { mode: "off", percent: 0 }), stored);
});

test("the full-shadow command and environment defaults remain explicit and customer-safe", async () => {
  const [script, env, pkg] = await Promise.all([
    import("node:fs/promises").then((fs) => fs.readFile("scripts/runNarrativeV3FullShadow.js", "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile(".env.example", "utf8")),
    import("node:fs/promises").then((fs) => fs.readFile("package.json", "utf8")),
  ]);
  assert.match(script, /runNarrativeV3ObjectLifecycleFixture/);
  assert.match(script, /replayVerified/);
  assert.match(env, /NARRATIVE_V3_ROLLOUT_MODE=off/);
  assert.match(env, /NARRATIVE_V3_ROLLOUT_PERCENT=0/);
  assert.match(env, /NARRATIVE_V3_RELEASE_GATE_DIGEST=\s*$/m);
  assert.match(pkg, /check:narrative-v3-full/);
});
