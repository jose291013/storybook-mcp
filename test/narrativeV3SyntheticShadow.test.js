import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { JsonNarrativeV3ArtifactStore } from "../src/services/narrativeV3ArtifactStore.js";
import {
  narrativeV3SyntheticShadowMatrix,
  runNarrativeV3SyntheticShadowFixture,
} from "../src/services/narrativeV3SyntheticShadow.js";
import { JsonNarrativeV3RunStore } from "../src/services/narrativeV3StateMachine.js";

async function withStores(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-shadow-test-"));
  try {
    const artifactStore = new JsonNarrativeV3ArtifactStore(path.join(directory, "artifacts.json"));
    const runStore = new JsonNarrativeV3RunStore(path.join(directory, "runs.json"));
    return await run({ artifactStore, runStore });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("synthetic shadow runs the real ledger and state machine without provider or customer traffic", async () => {
  await withStores(async ({ artifactStore, runStore }) => {
    const report = await runNarrativeV3SyntheticShadowFixture({
      projectId: crypto.randomUUID(),
      artifactStore,
      runStore,
      fixture: { language: "FR", universeId: "coral_ocean", pageCount: 32 },
    });

    assert.equal(report.status, "passed");
    assert.equal(report.sceneCount, 15);
    assert.deepEqual(report.movementCounts, { cross_passage: 1, return_travel: 1 });
    assert.equal(report.providerCalls, 0);
    assert.equal(report.paidModelCalls, 0);
    assert.equal(report.customerRoutesTouched, false);
    assert.deepEqual(Object.keys(report.artifactDigests), ["creationIntent", "storyConcept", "canonicalStoryGraph"]);
    assert.doesNotMatch(JSON.stringify(report), /synthetic-profile|Le chemin|Moment narratif/);
  });
});

test("replaying one fixture is artifact and pointer idempotent", async () => {
  await withStores(async ({ artifactStore, runStore }) => {
    const projectId = crypto.randomUUID();
    const input = {
      projectId,
      artifactStore,
      runStore,
      fixture: { language: "ES", universeId: "dinosaur_valley", pageCount: 44 },
    };
    const first = await runNarrativeV3SyntheticShadowFixture(input);
    const replay = await runNarrativeV3SyntheticShadowFixture(input);

    assert.deepEqual(replay, first);
    assert.equal((await artifactStore.listArtifacts(projectId)).length, 3);
    for (const artifactType of ["creation_intent", "story_concept", "canonical_story_graph"]) {
      assert.equal((await artifactStore.getCurrentPointer(projectId, artifactType)).pointerRevision, 1);
    }
  });
});

test("the complete language, universe and format matrix passes deterministically", async () => {
  const matrix = narrativeV3SyntheticShadowMatrix();
  assert.equal(matrix.length, 108);
  for (const fixture of matrix) {
    await withStores(async ({ artifactStore, runStore }) => {
      const report = await runNarrativeV3SyntheticShadowFixture({
        projectId: crypto.randomUUID(),
        artifactStore,
        runStore,
        fixture,
      });
      assert.equal(report.status, "passed", report.fixtureId);
      assert.equal(report.sceneCount, (fixture.pageCount - 2) / 2, report.fixtureId);
      assert.equal(Object.values(report.actCounts).reduce((sum, count) => sum + count, 0), report.sceneCount);
    });
  }
});

test("the synthetic shadow has no production, route, credit or model dependency", async () => {
  const implementation = await fs.readFile("src/services/narrativeV3SyntheticShadow.js", "utf8");
  const script = await fs.readFile("scripts/runNarrativeV3SyntheticShadow.js", "utf8");
  assert.doesNotMatch(implementation, /from ["'][^"']*(openai|routes|credits|server)/i);
  assert.doesNotMatch(script, /from ["'][^"']*(openai|routes|credits|server)/i);
  assert.doesNotMatch(`${implementation}\n${script}`, /process\.env/);
});
