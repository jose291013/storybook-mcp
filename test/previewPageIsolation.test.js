import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("preview generation quarantines one page, continues the book and performs a bounded repair sweep", async () => {
  const [preview, qualityGate, jobs] = await Promise.all([
    fs.readFile("src/routes/preview.js", "utf8"),
    fs.readFile("src/services/imageQualityGate.js", "utf8"),
    fs.readFile("src/routes/jobs.js", "utf8"),
  ]);

  assert.match(qualityGate, /class IllustrationQualityError extends Error/);
  assert.match(qualityGate, /candidateImageUrl/);
  assert.match(qualityGate, /onCandidate/);
  assert.match(qualityGate, /status: attempt === attemptLimit \? "quarantined" : "rejected"/);

  assert.match(preview, /createImageCandidateRecorder/);
  assert.match(preview, /page quarantined for repair/);
  assert.match(preview, /qualityStatus = "repair_pending"/);
  assert.match(preview, /maximumAttempts: 1/);
  assert.match(preview, /accepted_after_repair/);
  assert.match(preview, /status: "preview_quality_review"/);
  assert.match(preview, /completed with pages awaiting quality review/);
  assert.match(jobs, /quality_review_required/);

  const repairSweepPosition = preview.indexOf("const pendingRepairPages");
  const completedPosition = preview.indexOf('status: "done"', repairSweepPosition);
  assert.ok(repairSweepPosition > 0);
  assert.ok(completedPosition > repairSweepPosition);
});
