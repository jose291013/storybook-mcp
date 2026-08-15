import { inspectNarrativeStabilityMatrix } from "../src/services/narrativeStabilityMatrix.js";

const report = inspectNarrativeStabilityMatrix();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.valid) process.exitCode = 1;
