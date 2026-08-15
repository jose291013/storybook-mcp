import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { ALLOWED_PAGE_COUNTS, UNIVERSE_OPTIONS } from "../src/config/bookOptions.js";
import { createPagePlan } from "../src/config/bookStructure.js";
import { createStoryActContract, storyActContractIssues } from "../src/config/storyActs.js";
import { prepareSyntheticNarrativeBenchmarkFixture } from "../src/services/narrativeModelBenchmark.js";
import {
  buildNarrativeStabilityMatrix,
  inspectNarrativeStabilityMatrix,
  NARRATIVE_STABILITY_LANGUAGES,
  narrativeStabilityFixtureById,
} from "../src/services/narrativeStabilityMatrix.js";

test("stability matrix covers every universe, sellable length and supported narrative language", () => {
  const matrix = buildNarrativeStabilityMatrix();
  const report = inspectNarrativeStabilityMatrix(matrix);
  assert.equal(report.valid, true, report.issues.join("\n"));
  assert.equal(matrix.length, 108);
  assert.equal(report.modelCalls, 0);
  assert.deepEqual(report.dimensions.universes, UNIVERSE_OPTIONS.map((entry) => entry.id));
  assert.deepEqual(report.dimensions.pageCounts, ALLOWED_PAGE_COUNTS);
  assert.deepEqual(report.dimensions.languages, NARRATIVE_STABILITY_LANGUAGES);
});

test("every stability case normalizes into its exact universe contract and scene count", () => {
  for (const fixture of buildNarrativeStabilityMatrix()) {
    const prepared = prepareSyntheticNarrativeBenchmarkFixture(fixture);
    assert.equal(prepared.book.universeId, fixture.matrix.universeId, fixture.id);
    assert.equal(prepared.book.pageCount, fixture.matrix.pageCount, fixture.id);
    assert.equal(prepared.book.language, fixture.matrix.language, fixture.id);
    assert.equal(
      prepared.normalized.answers.universe_story_contract.id,
      fixture.matrix.universeId,
      fixture.id,
    );
    assert.equal(
      createPagePlan(fixture.matrix.pageCount).filter((page) => page.page_type === "image").length,
      (fixture.matrix.pageCount - 2) / 2,
      fixture.id,
    );
    assert.deepEqual(
      storyActContractIssues(createStoryActContract(createPagePlan(fixture.matrix.pageCount))),
      [],
      fixture.id,
    );
  }
});

test("matrix fixtures are synthetic, contain no photos and have stable unique identifiers", () => {
  const matrix = buildNarrativeStabilityMatrix();
  assert.equal(new Set(matrix.map((fixture) => fixture.id)).size, matrix.length);
  for (const fixture of matrix) {
    assert.equal(fixture.synthetic, true);
    assert.equal("photos" in fixture, false);
    assert.match(fixture.questionnaire.creator_situation, /synthetic|synthétique|sintética/i);
  }
  assert.equal(
    narrativeStabilityFixtureById("matrix-coral_ocean-44-fr", matrix)?.matrix.pageCount,
    44,
  );
});

test("stability scripts keep local inspection free and require one explicit paid case", async () => {
  const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
  const localScript = await fs.readFile("scripts/checkNarrativeStabilityMatrix.js", "utf8");
  const paidScript = await fs.readFile("scripts/benchmarkNarrativeStabilityCase.js", "utf8");
  assert.equal(
    packageJson.scripts["check:narrative-stability"],
    "node scripts/checkNarrativeStabilityMatrix.js",
  );
  assert.equal(
    packageJson.scripts["benchmark:narrative-stability"],
    "node scripts/benchmarkNarrativeStabilityCase.js",
  );
  assert.doesNotMatch(localScript, /benchmarkNarrativeModels|runAgent|openai/i);
  assert.match(paidScript, /Choose exactly one paid synthetic case/);
  assert.match(paidScript, /Choose exactly one billable model/);
  assert.doesNotMatch(paidScript, /--all/);
});
