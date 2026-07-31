import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { parseNarrativeBenchmarkCli } from "../src/services/narrativeBenchmarkCli.js";
import {
  benchmarkNarrativeModels,
  prepareSyntheticNarrativeBenchmarkFixture,
} from "../src/services/narrativeModelBenchmark.js";

function fixture() {
  return {
    id: "forest-courage-fr-8",
    synthetic: true,
    normalized: {
      answers: {
        language: "FR",
        page_count: 24,
      },
      photos: [],
    },
    book: {
      language: "FR",
      audienceAge: 8,
      pageCount: 24,
      universeId: "enchanted_forest",
    },
    canonicalSafety: {
      childSafety: {
        profileVersion: 2,
        category: "general",
        action: "allow",
        restricted: false,
      },
      sensitivity: {
        profileVersion: 2,
        level: 1,
        category: "everyday_challenge",
        restricted: false,
        approach: "light_action_led",
        contractVersion: 1,
        contractDigest: "d".repeat(64),
      },
    },
  };
}

test("benchmark runs identical synthetic input through isolated Sol, Terra and Luna roles", async () => {
  const roles = [];
  const progress = [];
  const report = await benchmarkNarrativeModels([fixture()], {
    now: () => "2026-07-31T12:00:00.000Z",
    onProgress: async (event) => progress.push(event),
    generate: async (input) => {
      roles.push(input.modelRoles);
      await input.onStep({ phase: "editor", attempt: 1 });
      return {
        scenario: {
          revision: 1,
          auditEvidence: { digest: "a".repeat(64) },
        },
        validation: { valid: true, issues: [] },
      };
    },
    compile: ({ scenario }) => ({
      sourceScenario: { digest: scenario.auditEvidence.digest },
      scenes: [{ id: "scene_1" }],
      validation: { artifactDigest: "b".repeat(64) },
    }),
    costDetails: async () => ({
      summary: {
        totalCostUsdMicros: 1234,
        requestCount: 2,
        pricingComplete: true,
      },
    }),
  });

  assert.equal(report.fixtureCount, 1);
  assert.equal(report.version, 2);
  assert.deepEqual(report.results[0].variants.map((variant) => variant.id), [
    "sol",
    "terra",
    "luna",
  ]);
  assert.deepEqual(roles.map((role) => role.architect), [
    "narrative_benchmark_sol",
    "narrative_benchmark_terra",
    "narrative_benchmark_luna",
  ]);
  assert.equal(report.variantCount, 3);
  assert.equal(report.results[0].variants[2].canonicalCompiled, true);
  assert.equal(report.results[0].variants[2].endToEndPassed, true);
  assert.equal(report.results[0].variants[2].costUsdMicros, 1234);
  assert.equal("scenario" in report.results[0].variants[2], false);
  assert.deepEqual(report.summary.map((variant) => ({
    id: variant.id,
    passRate: variant.endToEndPassRatePercent,
    medianCost: variant.medianCostUsdMicros,
  })), [
    { id: "sol", passRate: 100, medianCost: 1234 },
    { id: "terra", passRate: 100, medianCost: 1234 },
    { id: "luna", passRate: 100, medianCost: 1234 },
  ]);
  assert.deepEqual(progress.map((event) => `${event.event}:${event.variantId}`), [
    "variant_started:sol",
    "variant_completed:sol",
    "variant_started:terra",
    "variant_completed:terra",
    "variant_started:luna",
    "variant_completed:luna",
  ]);
});

test("benchmark exposes bounded mechanical diagnostics without generated prose", async () => {
  const report = await benchmarkNarrativeModels([fixture()], {
    generate: async (input) => {
      if (input.modelRoles.architect === "narrative_benchmark_luna") {
        return {
          scenario: { privateProse: "must not be returned" },
          validation: {
            valid: false,
            issues: ["scene-4: private explanation"],
            diagnostics: [{
              code: "passage_endpoints_missing",
              sceneNumber: 4,
              explanation: "private explanation",
            }],
          },
        };
      }
      return {
        scenario: {
          revision: 1,
          auditEvidence: { digest: "a".repeat(64) },
        },
        validation: { valid: true, issues: [] },
      };
    },
    compile: () => {
      const error = new Error("private compiler explanation");
      error.issues = [{
        code: "ambiguous_passage_endpoints",
        path: "registries.passages",
        message: "private compiler explanation",
      }];
      throw error;
    },
    costDetails: async () => ({
      summary: {
        totalCostUsdMicros: 500,
        requestCount: 1,
        pricingComplete: true,
      },
    }),
  });

  const [sol, terra, luna] = report.results[0].variants;
  assert.deepEqual(sol.canonicalIssues, [{
    code: "ambiguous_passage_endpoints",
    path: "registries.passages",
  }]);
  assert.deepEqual(terra.canonicalIssues, [{
    code: "ambiguous_passage_endpoints",
    path: "registries.passages",
  }]);
  assert.deepEqual(luna.scenarioDiagnostics.issues, [{
    code: "passage_endpoints_missing",
    sceneNumber: 4,
  }]);
  assert.equal(JSON.stringify(report).includes("private explanation"), false);
  assert.equal(JSON.stringify(report).includes("must not be returned"), false);
  assert.equal(report.summary[0].endToEndPassRatePercent, 0);
  assert.equal(report.summary[2].scenarioValidCount, 0);
});

test("benchmark classifies deterministic object-ledger failures without exposing prose", async () => {
  const report = await benchmarkNarrativeModels([fixture()], {
    variantIds: ["terra"],
    generate: async () => ({
      scenario: { privateProse: "must not be returned" },
      validation: {
        valid: false,
        issues: [
          "scene-10: Lina cannot held the lantern while not physically present",
        ],
      },
    }),
    costDetails: async () => ({
      summary: {
        totalCostUsdMicros: 500,
        requestCount: 1,
        pricingComplete: true,
      },
    }),
  });

  assert.deepEqual(report.results[0].variants[0].scenarioDiagnostics.issues, [{
    code: "object_owner_not_physically_present",
    sceneNumber: 10,
  }]);
  assert.equal(JSON.stringify(report).includes("Lina"), false);
  assert.equal(JSON.stringify(report).includes("lantern"), false);
  assert.equal(JSON.stringify(report).includes("must not be returned"), false);
});

test("one model execution failure does not discard the other benchmark result", async () => {
  const report = await benchmarkNarrativeModels([fixture()], {
    generate: async (input) => {
      if (input.modelRoles.architect === "narrative_benchmark_luna") {
        const error = new Error("private provider response");
        error.code = "scenario_timeout";
        throw error;
      }
      return {
        scenario: {
          revision: 1,
          auditEvidence: { digest: "a".repeat(64) },
        },
        validation: { valid: true, issues: [] },
      };
    },
    compile: () => ({
      scenes: [{ id: "scene_1" }],
      validation: { artifactDigest: "b".repeat(64) },
    }),
    costDetails: async () => ({
      summary: {
        totalCostUsdMicros: 250,
        requestCount: 1,
        pricingComplete: true,
      },
    }),
  });

  const [sol, terra, luna] = report.results[0].variants;
  assert.equal(sol.endToEndPassed, true);
  assert.equal(terra.endToEndPassed, true);
  assert.equal(luna.executionSucceeded, false);
  assert.equal(luna.executionErrorCode, "scenario_timeout");
  assert.equal(JSON.stringify(report).includes("private provider response"), false);
});

test("benchmark refuses non-synthetic fixtures before any model call", async () => {
  let calls = 0;
  await assert.rejects(
    () => benchmarkNarrativeModels([{ ...fixture(), synthetic: false }], {
      generate: async () => {
        calls += 1;
      },
    }),
    /synthetic fixtures only/,
  );
  assert.equal(calls, 0);
});

test("benchmark runs only the explicitly selected paid variant", async () => {
  const roles = [];
  const report = await benchmarkNarrativeModels([fixture()], {
    variantIds: ["terra"],
    generate: async (input) => {
      roles.push(input.modelRoles.architect);
      return {
        scenario: {
          revision: 1,
          auditEvidence: { digest: "a".repeat(64) },
        },
        validation: { valid: true, issues: [] },
      };
    },
    compile: () => ({
      scenes: [{ id: "scene_1" }],
      validation: { artifactDigest: "b".repeat(64) },
    }),
    costDetails: async () => ({
      summary: {
        totalCostUsdMicros: 100,
        requestCount: 1,
        pricingComplete: true,
      },
    }),
  });

  assert.deepEqual(roles, ["narrative_benchmark_terra"]);
  assert.equal(report.variantCount, 1);
  assert.deepEqual(report.summary.map((variant) => variant.id), ["terra"]);
  assert.deepEqual(
    report.results[0].variants.map((variant) => variant.id),
    ["terra"],
  );
});

test("benchmark rejects an unknown variant before any model call", async () => {
  let calls = 0;
  await assert.rejects(
    () => benchmarkNarrativeModels([fixture()], {
      variantIds: ["terar"],
      generate: async () => {
        calls += 1;
      },
    }),
    /Unknown narrative benchmark variant: terar/,
  );
  assert.equal(calls, 0);
});

test("documented synthetic questionnaire fixture is normalized without customer data", async () => {
  const fixtures = JSON.parse(await fs.readFile(
    "test/fixtures/narrative-benchmark.synthetic.example.json",
    "utf8",
  ));
  const prepared = prepareSyntheticNarrativeBenchmarkFixture(fixtures[0]);
  assert.equal(prepared.normalized.answers.hero_name, "Lina");
  assert.equal(prepared.book.pageCount, 24);
  assert.equal(prepared.canonicalSafety.childSafety.category, "general");
  assert.equal(prepared.canonicalSafety.sensitivity.level, 1);
  assert.equal(fixtures.length, 6);
  const preparedCorpus = fixtures.map(prepareSyntheticNarrativeBenchmarkFixture);
  assert.deepEqual(
    preparedCorpus.map((entry) => entry.book.language).sort(),
    ["EN", "ES", "ES", "FR", "FR", "FR"],
  );
  const arrivals = prepareSyntheticNarrativeBenchmarkFixture(
    fixtures.find((fixtureEntry) => fixtureEntry.id === "late-arrival-memory-en-9"),
  );
  assert.deepEqual(arrivals.normalized.photos.map((photo) => photo.name), [
    "Maya",
    "Uncle Theo",
    "Grandma June",
  ]);
  const loss = preparedCorpus.find((entry) => entry.id === "gentle-loss-fr-10");
  assert.equal(loss.sensitivityContract.level, 3);
  assert.equal(loss.sensitivityContract.approach, "symbolic_open_ended");
  const protective = preparedCorpus.find(
    (entry) => entry.id === "protective-boundaries-es-8",
  );
  assert.equal(protective.safetyContract.id, "body_safety_v1");
  assert.equal(protective.canonicalSafety.childSafety.category, "protective_education");
});

test("CLI requires explicit paid fixture scope and emits bounded progress", async () => {
  const script = await fs.readFile("scripts/benchmarkNarrativeModels.js", "utf8");
  const parser = await fs.readFile("src/services/narrativeBenchmarkCli.js", "utf8");
  assert.match(parser, /--fixture <id>/);
  assert.match(parser, /--variant <sol\|terra\|luna\|all>/);
  assert.match(parser, /Unknown benchmark option/);
  assert.match(parser, /--all/);
  assert.match(script, /\[benchmark\]/);
  assert.match(script, /paid model run/);
  assert.doesNotMatch(script, /questionnaire|creator_situation|generated\.scenario/);
});

test("CLI selects Terra alone and rejects unknown or ambiguous paid options", () => {
  assert.deepEqual(
    parseNarrativeBenchmarkCli([
      "fixtures.json",
      "--fixture",
      "seed-lifecycle-fr-8",
      "--variant",
      "terra",
    ]),
    {
      fixturePath: "fixtures.json",
      allFixtures: false,
      fixtureId: "seed-lifecycle-fr-8",
      variantIds: ["terra"],
    },
  );
  assert.throws(
    () => parseNarrativeBenchmarkCli([
      "fixtures.json",
      "--fixture",
      "seed-lifecycle-fr-8",
      "--variant",
      "terra",
      "--varaint",
      "luna",
    ]),
    /Unknown benchmark option: --varaint/,
  );
  assert.throws(
    () => parseNarrativeBenchmarkCli([
      "fixtures.json",
      "--fixture",
      "seed-lifecycle-fr-8",
    ]),
    /Choose exactly which model is billable/,
  );
  assert.throws(
    () => parseNarrativeBenchmarkCli([
      "fixtures.json",
      "--fixture",
      "seed-lifecycle-fr-8",
      "--all",
      "--variant",
      "terra",
    ]),
    /either --fixture <id> or --all/,
  );
});
