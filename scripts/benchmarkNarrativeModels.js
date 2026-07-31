import fs from "node:fs/promises";
import path from "node:path";

import { parseNarrativeBenchmarkCli } from "../src/services/narrativeBenchmarkCli.js";
import { benchmarkNarrativeModels } from "../src/services/narrativeModelBenchmark.js";

const {
  fixturePath,
  allFixtures,
  fixtureId,
  variantIds,
} = parseNarrativeBenchmarkCli(process.argv.slice(2));

const absolutePath = path.resolve(fixturePath);
const fixtures = JSON.parse(await fs.readFile(absolutePath, "utf8"));
const selected = allFixtures
  ? fixtures
  : fixtures.filter((fixture) => fixture.id === fixtureId);
if (!selected.length) {
  throw new Error(`Unknown synthetic fixture: ${fixtureId}`);
}
const paidRunCount = selected.length * variantIds.length;
process.stderr.write(
  `[benchmark] ${selected.length} synthetic fixture(s), `
  + `${paidRunCount} paid model run(s), variants=${variantIds.join(",")}\n`,
);
const report = await benchmarkNarrativeModels(selected, {
  variantIds,
  onProgress: async ({ event, fixtureId, variantId, endToEndPassed }) => {
    const result = event === "variant_completed"
      ? ` result=${endToEndPassed ? "passed" : "failed"}`
      : "";
    process.stderr.write(
      `[benchmark] ${event} fixture=${fixtureId} variant=${variantId}${result}\n`,
    );
  },
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
