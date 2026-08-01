import assert from "node:assert/strict";
import test from "node:test";

import {
  createNarrativeV2RolloutAssignment,
  narrativeV2RolloutAssignment,
  narrativeV2RolloutBucket,
} from "../src/services/narrativeV2Rollout.js";

test("rollout assignment is deterministic, bounded and off by default", () => {
  const first = narrativeV2RolloutBucket("project-123");
  assert.equal(first, narrativeV2RolloutBucket("project-123"));
  assert.ok(first >= 0 && first < 100);
  const assignment = createNarrativeV2RolloutAssignment("project-123", {
    mode: "off",
    percent: 100,
    now: () => "2026-08-01T12:00:00.000Z",
  });
  assert.equal(assignment.enabled, false);
  assert.equal(assignment.percent, 0);
});

test("canary percentage and full activation have explicit behavior", () => {
  const projectId = "canary-project";
  const bucket = narrativeV2RolloutBucket(projectId);
  assert.equal(createNarrativeV2RolloutAssignment(projectId, {
    mode: "canary",
    percent: bucket,
  }).enabled, false);
  assert.equal(createNarrativeV2RolloutAssignment(projectId, {
    mode: "canary",
    percent: bucket + 1,
  }).enabled, true);
  assert.equal(createNarrativeV2RolloutAssignment(projectId, { mode: "on" }).enabled, true);
});

test("a persisted assignment never changes while a book is in progress", () => {
  const stored = createNarrativeV2RolloutAssignment("stable-project", {
    mode: "canary",
    percent: 50,
    now: () => "2026-08-01T12:00:00.000Z",
  });
  const project = { id: "stable-project", continuitySnapshot: { narrativeV2Rollout: stored } };
  assert.equal(narrativeV2RolloutAssignment(project, { mode: "off", percent: 0 }), stored);
});
