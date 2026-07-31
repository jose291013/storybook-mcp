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
import { summarizeStoryScenarioValidation } from "./storyScenario.js";
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

function diagnosticCode(value, fallback = "validation_failed") {
  return clean(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || fallback;
}

function scenarioDiagnostics(validation = {}) {
  const summary = summarizeStoryScenarioValidation(validation);
  const structured = summary.diagnostics.map((diagnostic) => ({
    code: diagnosticCode(diagnostic.code, "semantic_contradiction"),
    sceneNumber: Math.max(0, Number(diagnostic.sceneNumber || 0)),
  }));
  const issues = structured.length
    ? structured
    : summary.categories.map((category) => ({
      code: `${diagnosticCode(category, "incomplete")}_validation_failed`,
      sceneNumbers: summary.categoryScenes?.[category] || [],
    }));
  return {
    categories: summary.categories,
    sceneNumbers: summary.sceneNumbers,
    issues: issues.slice(0, 20),
  };
}

function compileDiagnostics(error) {
  return (Array.isArray(error?.issues) ? error.issues : [])
    .slice(0, 20)
    .map((issue) => ({
      code: diagnosticCode(issue?.code, "canonical_compile_failed"),
      path: clean(issue?.path, 180),
    }));
}

function median(values = []) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function aggregateVariant(results, variantId) {
  const variants = results
    .flatMap((result) => result.variants)
    .filter((variant) => variant.id === variantId);
  const fixtureCount = variants.length;
  const scenarioValidCount = variants.filter((variant) => variant.scenarioValid).length;
  const canonicalCompiledCount = variants.filter((variant) => variant.canonicalCompiled).length;
  const endToEndPassCount = variants.filter((variant) => variant.endToEndPassed).length;
  return {
    id: variantId,
    fixtureCount,
    executionSuccessCount: variants.filter((variant) => variant.executionSucceeded).length,
    scenarioValidCount,
    canonicalCompiledCount,
    endToEndPassCount,
    endToEndPassRatePercent: fixtureCount
      ? Number(((endToEndPassCount / fixtureCount) * 100).toFixed(1))
      : 0,
    totalCostUsdMicros: variants.reduce(
      (total, variant) => total + Number(variant.costUsdMicros || 0),
      0,
    ),
    medianCostUsdMicros: median(variants.map((variant) => variant.costUsdMicros)),
    medianDurationMs: median(variants.map((variant) => variant.durationMs)),
    totalRequestCount: variants.reduce(
      (total, variant) => total + Number(variant.requestCount || 0),
      0,
    ),
    pricingComplete: variants.every((variant) => variant.pricingComplete),
  };
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
  const request = fixture.request && typeof fixture.request === "object"
    ? fixture.request
    : { questionnaire: fixture.questionnaire };
  const questionnaire = request.questionnaire;
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
    normalized: normalizeBookRequest(request),
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
  let generated = null;
  let executionErrorCode = "";
  try {
    generated = await withOpenAICostContext({
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
  } catch (error) {
    executionErrorCode = diagnosticCode(
      error?.code || error?.type || error?.name,
      "model_execution_failed",
    );
  }
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
      compileIssues = compileDiagnostics(error);
    }
  }
  const diagnostics = scenarioDiagnostics(generated?.validation);
  const costs = await costDetails(costProjectId);
  return {
    id: variant.id,
    modelRole: variant.modelRole,
    executionSucceeded: Boolean(generated) && !executionErrorCode,
    executionErrorCode,
    scenarioValid: generated?.validation?.valid === true,
    scenarioIssueCount: Array.isArray(generated?.validation?.issues)
      ? generated.validation.issues.length : 0,
    scenarioDiagnostics: diagnostics,
    canonicalCompiled: Boolean(compiled),
    canonicalIssueCodes: compileIssues.map((issue) => issue.code),
    canonicalIssues: compileIssues,
    endToEndPassed: generated?.validation?.valid === true && Boolean(compiled),
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
    onProgress = async () => {},
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
      await onProgress({
        event: "variant_started",
        fixtureId: clean(fixture.id) || "synthetic-fixture",
        variantId: variant.id,
      });
      const result = await runVariant({
        fixture,
        variant,
        generate,
        compile,
        costDetails,
        now: now(),
      });
      variants.push(result);
      await onProgress({
        event: "variant_completed",
        fixtureId: clean(fixture.id) || "synthetic-fixture",
        variantId: variant.id,
        endToEndPassed: result.endToEndPassed,
      });
    }
    results.push({
      fixtureId: clean(fixture.id) || "synthetic-fixture",
      variants,
    });
  }
  return {
    version: 2,
    syntheticOnly: true,
    fixtureCount: results.length,
    summary: VARIANTS.map((variant) => aggregateVariant(results, variant.id)),
    results,
  };
}
