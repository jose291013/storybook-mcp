import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("automatic scenario repair has a dedicated non-commerce endpoint and creator control", async () => {
  const [route, app, html, worker] = await Promise.all([
    fs.readFile(new URL("../src/routes/storyScenario.js", import.meta.url), "utf8"),
    fs.readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    fs.readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    fs.readFile(new URL("../src/services/storyScenarioWorker.js", import.meta.url), "utf8"),
  ]);
  assert.match(route, /story-scenario\/auto-repair/);
  assert.match(route, /automaticRepair: true/);
  assert.match(route, /scenario_auto_repair_exhausted/);
  assert.doesNotMatch(route, /reservePreview|capturePreview|credits\/reserve/);
  assert.match(app, /automaticallyRepairStoryScenario/);
  assert.match(app, /automaticRepairFailureFromProject/);
  assert.match(app, /scenarioCardDiagnostics/);
  assert.match(app, /scenarioWhyFlagged/);
  assert.match(app, /automaticRepairRecoveryVersion/);
  assert.match(app, /story-scenario\/auto-repair/);
  assert.match(html, /id="automaticRepairScenarioButton"/);
  assert.match(html, /id="automaticRepairScenarioFailure"/);
  assert.match(worker, /scenario_auto_repair_unresolved/);
  assert.match(worker, /noTechnicalRetry = true/);
  assert.match(worker, /error\.scenarioValidation = validation/);
  assert.match(route, /boundedMetadataRecovery/);
});
