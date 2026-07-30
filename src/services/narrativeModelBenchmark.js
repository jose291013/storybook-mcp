import crypto from "node:crypto";

import { compileNarrativeBookSpec } from "../contracts/compileNarrativeBookSpec.js";
import { childSafetyContract } from "./childSafety.js";
import { normalizeBookRequest } from "./normalizeBookRequest.js";
import {
  canonicalNarrativeV2Safety,
  narrativeV2BookConfiguration,
} from "./narrativeV2Shadow.js";
import { withOpenAICostContext } from "./openaiCostContext.js";
import { getBookCostDetails } from "./openaiCostLedger.js";
import { generateValidatedScenario } from "./storyScenarioGeneration.js";
import { storySensitivityContract } from "./storySensitivity.js";

const VARIANTS = [
  {
    id: "sol",
    modelRole: "narrative_benchmark_sol",
  },
  {
    id: "luna",
    modelRole: "narrative_benchmark_luna",
  },
];

function clean(value, maximum = 120) {
  return String(value || "").trim().slice(0, maximum);
}

function approveForCompilation(scenario, now) {
  return {
    ...scenario,
    status: "approved",
    revision: Math.max(1, Number(scenario?.revision || 1)),
    approvedAt: scenario?.approvedAt || now,
  };
}

export function prepareSyntheticNarrativeBenchmarkFixture(fixture = {}) {
  if (fixture.synthetic !== true) {
    throw new Error("Narrative model benchmarks accept synthetic fixtures only");
  }
  if (fixture.normalized && fixture.book && fixture.canonicalSafety) return fixture;
  const questionnaire = fixture.questionnaire;
  if (!questionnaire || typeof questionnaire !== "object") {
    throw new Error(`Synthetic fixture ${clean(fixture.id) || "unknown"} is incomplete`);
  }
  const project = {
    id: `synthetic-${clean(fixture.id) || "fixture"}`,
    locale: questionnaire.language || "FR",
    questionnaire,
    productConfiguration: {},
  };
  return {
    ...fixture,
    normalized: normalizeBookRequest({ questionnaire }),
    book: narrativeV2BookConfiguration(project),
    canonicalSafety: canonicalNarrativeV2Safety(project),
    safetyContract: childSafetyContract(questionnaire.child_safety_profile),
    sensitivityContract: storySensitivityContract(
      questionnaire.story_sensitivity_profile,
    ),
  };
}

async function runVariant({
  fixture,
  variant,
  generate,
  compile,
  costDetails,
  now,
}) {
  const costProjectId = crypto.randomUUID();
  let stage = "scenario:architect:attempt:1";
  const startedAt = Date.now();
  const generated = await withOpenAICostContext({
    projectId: costProjectId,
    runId: `benchmark:${clean(fixture.id)}:${variant.id}`,
    workflow: "narrative_benchmark",
    getStage: () => stage,
  }, () => generate({
    normalized: fixture.normalized,
    previousScenario: null,
    creatorClarifications: {},
    sceneEdits: [],
    addedCharacters: [],
    feedback: "",
    safetyContract: fixture.safetyContract || null,
    sensitivityContract: fixture.sensitivityContract || null,
    modelRoles: {
      architect: variant.modelRole,
      repair: variant.modelRole,
      editor: variant.modelRole,
      jsonRepair: variant.modelRole,
    },
    onStep: async ({ phase, attempt }) => {
      stage = `benchmark:${variant.id}:${clean(phase)}:attempt:${Number(attempt || 0)}`;
    },
  }));
  const durationMs = Date.now() - startedAt;
  let compiled = null;
  let compileIssues = [];
  if (generated?.validation?.valid) {
    try {
      compiled = compile({
        projectId: `synthetic-benchmark-${clean(fixture.id)}-${variant.id}`,
        scenario: approveForCompilation(generated.scenario, now),
        book: fixture.book,
        safety: fixture.canonicalSafety,
      });
    } catch (error) {
      compileIssues = (Array.isArray(error?.issues) ? error.issues : [])
        .slice(0, 20)
        .map((issue) => clean(issue?.code, 80))
        .filter(Boolean);
    }
  }
  const costs = await costDetails(costProjectId);
  return {
    id: variant.id,
    modelRole: variant.modelRole,
    scenarioValid: generated?.validation?.valid === true,
    scenarioIssueCount: Array.isArray(generated?.validation?.issues)
      ? generated.validation.issues.length : 0,
    canonicalCompiled: Boolean(compiled),
    canonicalIssueCodes: compileIssues,
    sceneCount: Array.isArray(compiled?.scenes) ? compiled.scenes.length : 0,
    artifactDigest: clean(compiled?.validation?.artifactDigest, 64),
    durationMs,
    costUsdMicros: Number(costs?.summary?.totalCostUsdMicros || 0),
    requestCount: Number(costs?.summary?.requestCount || 0),
    pricingComplete: costs?.summary?.pricingComplete === true,
  };
}

export async function benchmarkNarrativeModels(
  fixtures = [],
  {
    generate = generateValidatedScenario,
    compile = compileNarrativeBookSpec,
    costDetails = getBookCostDetails,
    now = () => new Date().toISOString(),
  } = {},
) {
  const source = Array.isArray(fixtures) ? fixtures : [];
  if (!source.length) throw new Error("At least one synthetic benchmark fixture is required");
  if (source.some((fixture) => fixture?.synthetic !== true)) {
    throw new Error("Narrative model benchmarks accept synthetic fixtures only");
  }
  const results = [];
  for (const rawFixture of source) {
    const fixture = prepareSyntheticNarrativeBenchmarkFixture(rawFixture);
    const variants = [];
    for (const variant of VARIANTS) {
      variants.push(await runVariant({
        fixture,
        variant,
        generate,
        compile,
        costDetails,
        now: now(),
      }));
    }
    results.push({
      fixtureId: clean(fixture.id) || "synthetic-fixture",
      variants,
    });
  }
  return {
    version: 1,
    syntheticOnly: true,
    fixtureCount: results.length,
    results,
  };
}
