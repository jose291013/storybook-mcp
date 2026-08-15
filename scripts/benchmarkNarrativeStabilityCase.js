import { benchmarkNarrativeModels } from "../src/services/narrativeModelBenchmark.js";
import { NARRATIVE_BENCHMARK_VARIANT_IDS } from "../src/services/narrativeBenchmarkCli.js";
import {
  buildNarrativeStabilityMatrix,
  narrativeStabilityFixtureById,
} from "../src/services/narrativeStabilityMatrix.js";

function optionValue(options, index, name) {
  const value = String(options[index + 1] || "").trim();
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

function parseOptions(argv = []) {
  let caseId = "";
  let variant = "";
  for (let index = 0; index < argv.length; index += 1) {
    const option = String(argv[index] || "");
    if (option === "--case") {
      if (caseId) throw new Error("--case may be provided only once");
      caseId = optionValue(argv, index, "--case");
      index += 1;
      continue;
    }
    if (option === "--variant") {
      if (variant) throw new Error("--variant may be provided only once");
      variant = optionValue(argv, index, "--variant").toLowerCase();
      index += 1;
      continue;
    }
    throw new Error(`Unknown stability benchmark option: ${option || "(empty)"}`);
  }
  if (!caseId) throw new Error("Choose exactly one paid synthetic case with --case <id>");
  if (!NARRATIVE_BENCHMARK_VARIANT_IDS.includes(variant)) {
    throw new Error("Choose exactly one billable model with --variant <sol|terra|luna>");
  }
  return { caseId, variant };
}

const { caseId, variant } = parseOptions(process.argv.slice(2));
const fixture = narrativeStabilityFixtureById(caseId, buildNarrativeStabilityMatrix());
if (!fixture) throw new Error(`Unknown narrative stability case: ${caseId}`);
process.stderr.write(`[stability-benchmark] 1 synthetic fixture, 1 paid model run, case=${caseId}, variant=${variant}\n`);
const report = await benchmarkNarrativeModels([fixture], {
  variantIds: [variant],
  onProgress: async ({ event, fixtureId, variantId, endToEndPassed }) => {
    const result = event === "variant_completed"
      ? ` result=${endToEndPassed ? "passed" : "failed"}`
      : "";
    process.stderr.write(`[stability-benchmark] ${event} fixture=${fixtureId} variant=${variantId}${result}\n`);
  },
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
