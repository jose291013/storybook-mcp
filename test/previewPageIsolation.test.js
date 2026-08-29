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
  assert.match(qualityGate, /class IllustrationSafetyQuarantineError extends Error/);
  assert.match(qualityGate, /candidateImageUrl/);
  assert.match(qualityGate, /onCandidate/);
  assert.match(qualityGate, /status: attempt === attemptLimit \|\| quarantineImmediately \? "quarantined" : "rejected"/);
  assert.match(qualityGate, /quarantined-for-targeted-repair/);

  assert.match(preview, /createImageCandidateRecorder/);
  assert.match(preview, /page quarantined for repair/);
  assert.match(preview, /qualityStatus = "repair_pending"/);
  assert.match(preview, /strict_quarantined/);
  assert.match(preview, /strict_internal_quarantine/);
  assert.match(preview, /page isolated after provider safety rejection/);
  assert.match(preview, /provider-safety-quarantine:page/);
  assert.match(preview, /deferredIllustrationPages/);
  assert.match(preview, /preview_provider_safety_quarantine/);
  assert.match(preview, /Continue manufacturing every independent page|Continue manufacturing every independent page/i);
  assert.match(preview, /strict V3 quarantine recovery queued/);
  assert.match(preview, /storedCausalRecovery\?\.version === PREVIEW_CAUSAL_RECOVERY_VERSION/);
  assert.match(preview, /priorRecovery: storedCausalRecovery/);
  assert.match(preview, /strictRecoveryPageNumbers\.has\(Number\(page\.page_number\)\) \? 3 : 2/);
  assert.match(preview, /upsertPreviewDraftPage\(draftPages/);
  assert.match(preview, /issueCodes: strictPageIssueCodes\(page\)/);
  assert.match(preview, /strict-quarantine:page/);
  assert.match(preview, /maximumAttempts: 1/);
  assert.match(preview, /kind: "repair_source"/);
  assert.match(preview, /causalRecoveryReferences\(\s*plannedRepairReferences,\s*effectivePageRecovery,/);
  assert.match(preview, /rehydrateCausalWardrobeRepairPolicy\(\s*storedRepairPolicy,\s*effectivePageRecovery,/);
  assert.match(preview, /strict V3 repair policy rehydrated/);
  assert.match(preview, /monotonicWardrobeRepairProgress\(repairPolicy, candidateRepairPolicy\)/);
  assert.match(preview, /strict V3 monotonic repair progress checkpointed/);
  assert.match(preview, /pendingRepairPages\.push\(draftPages\[index\]\)/);
  assert.match(preview, /const repairPrompt = causalRecoveryPrompt\(/);
  assert.match(preview, /effectivePageRecovery\?\.strategies\?\.includes\("wardrobe_reference_isolation"\)/);
  assert.match(preview, /sceneReferences: effectivePageRecovery\s*\? qualityReferenceImages/);
  assert.match(preview, /targetedRepairAvailable: true/);
  assert.doesNotMatch(preview, /targetedRepairAvailable: !pageRecovery/);
  assert.match(preview, /qualityReviewScope: repairPolicy\.targetCodes/);
  assert.match(preview, /FINAL TARGETED IMAGE EDIT \(policy V10\)/);
  assert.match(preview, /CANONICAL WARDROBE SCENE RECOMPOSITION \(policy V10\)/);
  assert.match(preview, /preserve exactly one complete instance of every required named identity/);
  assert.match(preview, /accepted_after_repair/);
  assert.match(preview, /status: "preview_quality_review"/);
  assert.match(preview, /completed with pages awaiting quality review/);
  assert.match(jobs, /quality_review_required/);

  const repairSweepPosition = preview.indexOf("const pendingRepairPages");
  const completedPosition = preview.indexOf('status: "done"', repairSweepPosition);
  assert.ok(repairSweepPosition > 0);
  assert.ok(completedPosition > repairSweepPosition);
});
