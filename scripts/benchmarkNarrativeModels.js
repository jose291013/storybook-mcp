import fs from "node:fs/promises";
import path from "node:path";

import { benchmarkNarrativeModels } from "../src/services/narrativeModelBenchmark.js";

const [fixturePath, ...options] = process.argv.slice(2);
if (!fixturePath) {
  throw new Error(
    "Usage: npm run benchmark:narrative-models -- <synthetic-fixtures.json> --fixture <id> | --all",
  );
}

const absolutePath = path.resolve(fixturePath);
const fixtures = JSON.parse(await fs.readFile(absolutePath, "utf8"));
const allRequested = options.includes("--all");
const fixtureOptionIndex = options.indexOf("--fixture");
const inlineFixture = options.find((option) => option.startsWith("--fixture="));
const requestedFixtureId = inlineFixture?.slice("--fixture=".length)
  || (fixtureOptionIndex >= 0 ? options[fixtureOptionIndex + 1] : "");
if (!allRequested && !requestedFixtureId) {
  throw new Error(
    "Choose one paid synthetic case with --fixture <id>, or acknowledge the full corpus cost with --all",
  );
}
const selected = allRequested
  ? fixtures
  : fixtures.filter((fixture) => fixture.id === requestedFixtureId);
if (!selected.length) {
  throw new Error(`Unknown synthetic fixture: ${requestedFixtureId}`);
}
process.stderr.write(
  `[benchmark] ${selected.length} synthetic fixture(s), ${selected.length * 2} model variant(s)\n`,
);
const report = await benchmarkNarrativeModels(selected, {
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
