import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

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

test("benchmark runs identical synthetic input through isolated Sol and Luna roles", async () => {
  const roles = [];
  const report = await benchmarkNarrativeModels([fixture()], {
    now: () => "2026-07-31T12:00:00.000Z",
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
  assert.deepEqual(report.results[0].variants.map((variant) => variant.id), [
    "sol",
    "luna",
  ]);
  assert.deepEqual(roles.map((role) => role.architect), [
    "narrative_benchmark_sol",
    "narrative_benchmark_luna",
  ]);
  assert.equal(report.results[0].variants[1].canonicalCompiled, true);
  assert.equal(report.results[0].variants[1].costUsdMicros, 1234);
  assert.equal("scenario" in report.results[0].variants[1], false);
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
});
