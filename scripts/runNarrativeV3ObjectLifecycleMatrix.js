import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { JsonNarrativeV3ArtifactStore } from "../src/services/narrativeV3ArtifactStore.js";
import {
  narrativeV3ObjectLifecycleMatrix,
  runNarrativeV3ObjectLifecycleFixture,
} from "../src/services/narrativeV3ObjectLifecycleMatrix.js";
import { JsonNarrativeV3RunStore } from "../src/services/narrativeV3StateMachine.js";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-objects-"));
try {
  const reports = [];
  for (const fixture of narrativeV3ObjectLifecycleMatrix()) {
    const fixtureDirectory = path.join(directory, `${fixture.language}-${fixture.universeId}`);
    reports.push(await runNarrativeV3ObjectLifecycleFixture({
      projectId: crypto.randomUUID(),
      artifactStore: new JsonNarrativeV3ArtifactStore(path.join(fixtureDirectory, "artifacts.json")),
      runStore: new JsonNarrativeV3RunStore(path.join(fixtureDirectory, "runs.json")),
      fixture,
    }));
  }
  const summary = {
    version: 1,
    fixtureCount: reports.length,
    passed: reports.filter((report) => report.status === "passed").length,
    objectCount: reports.reduce((total, report) => total + report.objectCount, 0),
    adversarialCases: reports.reduce((total, report) => total + report.adversarialCases, 0),
    providerCalls: 0,
    paidModelCalls: 0,
    customerRoutesTouched: false,
    reports,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
