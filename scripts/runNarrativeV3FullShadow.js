import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { JsonNarrativeV3ArtifactStore } from "../src/services/narrativeV3ArtifactStore.js";
import { evaluateNarrativeV3ReleaseGates, narrativeV3FullShadowMatrix } from "../src/services/narrativeV3FullShadow.js";
import { runNarrativeV3ObjectLifecycleFixture } from "../src/services/narrativeV3ObjectLifecycleMatrix.js";
import { JsonNarrativeV3RunStore } from "../src/services/narrativeV3StateMachine.js";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-full-shadow-"));
try {
  const reports = [];
  let replayVerified = false;
  for (const [index, fixture] of narrativeV3FullShadowMatrix().entries()) {
    const fixtureDirectory = path.join(directory, `${fixture.language}-${fixture.universeId}-${fixture.pageCount}`);
    const artifactStore = new JsonNarrativeV3ArtifactStore(path.join(fixtureDirectory, "artifacts.json"));
    const runStore = new JsonNarrativeV3RunStore(path.join(fixtureDirectory, "runs.json"));
    const projectId = crypto.randomUUID();
    const input = { projectId, artifactStore, runStore, fixture };
    const report = await runNarrativeV3ObjectLifecycleFixture(input);
    reports.push(report);
    if (index === 0) replayVerified = JSON.stringify(await runNarrativeV3ObjectLifecycleFixture(input)) === JSON.stringify(report);
  }
  const gates = evaluateNarrativeV3ReleaseGates(reports, { replayVerified });
  process.stdout.write(`${JSON.stringify({ ...gates, reports }, null, 2)}\n`);
  if (!gates.eligible) process.exitCode = 1;
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
