import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { JsonNarrativeV3ArtifactStore } from "../src/services/narrativeV3ArtifactStore.js";
import {
  narrativeV3SyntheticShadowMatrix,
  runNarrativeV3SyntheticShadowFixture,
} from "../src/services/narrativeV3SyntheticShadow.js";
import { JsonNarrativeV3RunStore } from "../src/services/narrativeV3StateMachine.js";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-v3-shadow-"));
try {
  const reports = [];
  for (const fixture of narrativeV3SyntheticShadowMatrix()) {
    const fixtureDirectory = path.join(directory, `${fixture.language}-${fixture.universeId}-${fixture.pageCount}`);
    reports.push(await runNarrativeV3SyntheticShadowFixture({
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
    providerCalls: reports.reduce((total, report) => total + report.providerCalls, 0),
    paidModelCalls: reports.reduce((total, report) => total + report.paidModelCalls, 0),
    customerRoutesTouched: reports.some((report) => report.customerRoutesTouched),
    reports,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
