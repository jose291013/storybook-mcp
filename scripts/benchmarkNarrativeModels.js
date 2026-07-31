import fs from "node:fs/promises";
import path from "node:path";

import { benchmarkNarrativeModels } from "../src/services/narrativeModelBenchmark.js";

const fixturePath = process.argv[2];
if (!fixturePath) {
  throw new Error(
    "Usage: npm run benchmark:narrative-models -- <synthetic-fixtures.json>",
  );
}

const absolutePath = path.resolve(fixturePath);
const fixtures = JSON.parse(await fs.readFile(absolutePath, "utf8"));
const report = await benchmarkNarrativeModels(fixtures);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
