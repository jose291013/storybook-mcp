import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  qualityReviewCandidateSelection,
  qualityReviewCandidateReplacement,
  qualityReviewScopePolicy,
  resolveQualityReviewPage,
  saveQualityReviewCandidate,
} from "../src/services/qualityReviewResolution.js";

function qualityProject() {
  return {
    id: "project-quality",
    status: "preview_quality_review",
    generationJobId: "run-quality",
    questionnaire: { page_count: 36 },
    previewResult: {
      coverPreviewUrl: "/cover",
      draftPages: [
        {
          page_number: 15,
          page_type: "image",
          spread_number: 8,
          previewUrl: "/15",
          qualityStatus: "review_required",
          qualityKind: "scene",
          qualityIssues: ["Required character missing"],
        },
        {
          page_number: 31,
          page_type: "image",
          spread_number: 16,
          previewUrl: "/31",
          qualityStatus: "review_required",
          qualityKind: "scene",
          qualityIssues: ["Main action unclear"],
        },
        {
          page_number: 14,
          page_type: "text",
          spread_number: 8,
          text: "Maïté pose doucement sa main sur l’épaule de Malvina.",
          previewUrl: "/14",
          storageKey: "private/page-14",
        },
      ],
    },
    continuitySnapshot: {
      previewNotification: { emailRequested: true },
      generationCheckpoint: {
        phase: "quality-review",
        creditReservationId: "reservation-quality",
        qualityReview: {
          status: "required",
          pages: [{ pageNumber: 15 }, { pageNumber: 31 }],
        },
      },
    },
  };
}

test("a free correction is stored as a separate candidate and never replaces the current illustration", async () => {
  let stored = qualityProject();
  const originalPreviewUrl = stored.previewResult.draftPages[0].previewUrl;
  const projects = {
    async getForCustomer(projectId) {
      return projectId === stored.id ? structuredClone(stored) : null;
    },
    async updateForCustomer(projectId, identity, patch) {
      assert.equal(projectId, stored.id);
      stored = { ...stored, ...structuredClone(patch) };
      return structuredClone(stored);
    },
  };
  const result = await saveQualityReviewCandidate({
    projectId: stored.id,
    identity: { wooCustomerId: "42" },
    pageNumber: 15,
    instruction: "Rendre la présence de Maman plus claire.",
    candidate: {
      imageUrl: "/candidate-image",
      imageStorageKey: "private/candidate-image",
      previewUrl: "/candidate-page",
      storageKey: "private/candidate-page",
    },
    dependencies: { projects },
  });

  const page = stored.previewResult.draftPages[0];
  assert.equal(page.previewUrl, originalPreviewUrl);
  assert.equal(page.qualityStatus, "review_required");
  assert.equal(page.qualityReviewCandidate.previewUrl, "/candidate-page");
  assert.equal(page.qualityReviewCandidate.original.previewUrl, originalPreviewUrl);
  assert.equal(page.qualityReviewCandidate.instruction, "Rendre la présence de Maman plus claire.");
  assert.equal(result.candidate.status, "ready");
  assert.equal(page.qualityReviewRepairCount, 1);
});

test("a legacy failed text proposal receives one bounded recovery without pretending a candidate exists", () => {
  const page = {
    page_number: 15,
    page_type: "image",
    qualityStatus: "review_required",
    qualityReviewTextRepairCount: 1,
    qualityReviewTextRepairFailedAt: "2026-08-11T10:00:00.000Z",
    qualityReviewTextRepairError: "scene_contract_mismatch",
  };
  const policy = qualityReviewScopePolicy(page, "text");
  assert.equal(policy.completedCount, 0);
  assert.equal(policy.attemptCount, 1);
  assert.equal(policy.retryAvailable, true);
  assert.equal(policy.canRequest, true);
});

test("two failed technical attempts stop retries without consuming a successful proposal", () => {
  const policy = qualityReviewScopePolicy({
    qualityReviewTextRepairAttemptCount: 2,
    qualityReviewTextRepairFailedAt: "2026-08-11T10:00:00.000Z",
  }, "text");
  assert.equal(policy.completedCount, 0);
  assert.equal(policy.canRequest, false);
  assert.equal(policy.technicalExhausted, true);
});

test("the alternative becomes current only after the creator explicitly selects it", async () => {
  let stored = qualityProject();
  stored.previewResult.draftPages[0].qualityReviewRepairCount = 1;
  stored.previewResult.draftPages[0].qualityReviewCandidate = {
    status: "ready",
    generatedAt: "2026-07-25T12:00:00.000Z",
    imageUrl: "/candidate-image",
    imageStorageKey: "private/candidate-image",
    previewUrl: "/candidate-page",
    storageKey: "private/candidate-page",
    original: {
      previewUrl: "/15",
      storageKey: "private/original-page",
    },
  };
  const projects = {
    async getForCustomer(projectId) {
      return projectId === stored.id ? structuredClone(stored) : null;
    },
    async updateForCustomer(projectId, identity, patch) {
      stored = { ...stored, ...structuredClone(patch) };
      return structuredClone(stored);
    },
  };
  const dependencies = {
    projects,
    credits: { async capturePreview() {} },
    runs: { async updateRun() {} },
    notify: async () => {},
  };
  const replacement = qualityReviewCandidateReplacement(stored.previewResult.draftPages[0]);
  await resolveQualityReviewPage({
    projectId: stored.id,
    identity: { wooCustomerId: "42" },
    pageNumber: 15,
    resolution: "creator_repaired",
    replacement,
    dependencies,
  });

  const page = stored.previewResult.draftPages[0];
  assert.equal(page.previewUrl, "/candidate-page");
  assert.equal(page.qualityStatus, "accepted_after_creator_repair");
  assert.equal(page.qualityReviewCandidate.decision, "selected");
  assert.equal(page.qualityReviewCandidate.original.previewUrl, "/15");
  assert.equal(stored.previewResult.draftPages[1].qualityStatus, "review_required");
});

test("keeping the original rejects only the alternative and preserves the current illustration", async () => {
  let stored = qualityProject();
  stored.previewResult.draftPages[0].qualityReviewCandidate = {
    status: "ready",
    generatedAt: "2026-07-25T12:00:00.000Z",
    previewUrl: "/candidate-page",
    storageKey: "private/candidate-page",
  };
  const originalPreviewUrl = stored.previewResult.draftPages[0].previewUrl;
  const projects = {
    async getForCustomer() {
      return structuredClone(stored);
    },
    async updateForCustomer(projectId, identity, patch) {
      stored = { ...stored, ...structuredClone(patch) };
      return structuredClone(stored);
    },
  };
  await resolveQualityReviewPage({
    projectId: stored.id,
    identity: { wooCustomerId: "42" },
    pageNumber: 15,
    resolution: "creator_approved",
    dependencies: {
      projects,
      credits: { async capturePreview() {} },
      runs: { async updateRun() {} },
      notify: async () => {},
    },
  });

  const page = stored.previewResult.draftPages[0];
  assert.equal(page.previewUrl, originalPreviewUrl);
  assert.equal(page.qualityStatus, "accepted_by_creator");
  assert.equal(page.qualityReviewCandidate.previewUrl, "/candidate-page");
  assert.equal(page.qualityReviewCandidate.decision, "original_kept");
});

test("a text alternative coexists with the image candidate and changes only the paired text after selection", async () => {
  let stored = qualityProject();
  stored.previewResult.draftPages[0].qualityReviewRepairCount = 1;
  stored.previewResult.draftPages[0].qualityReviewCandidate = {
    status: "ready",
    scope: "illustration",
    generatedAt: "2026-07-25T12:00:00.000Z",
    imageUrl: "/candidate-image",
    imageStorageKey: "private/candidate-image",
    previewUrl: "/candidate-page",
    storageKey: "private/candidate-page",
  };
  const originalImagePreview = stored.previewResult.draftPages[0].previewUrl;
  const originalText = stored.previewResult.draftPages[2].text;
  const projects = {
    async getForCustomer() {
      return structuredClone(stored);
    },
    async updateForCustomer(projectId, identity, patch) {
      stored = { ...stored, ...structuredClone(patch) };
      return structuredClone(stored);
    },
  };
  await saveQualityReviewCandidate({
    projectId: stored.id,
    identity: { wooCustomerId: "42" },
    pageNumber: 15,
    instruction: "Adapter le petit geste au rendu déjà réussi.",
    candidate: {
      scope: "text",
      textPageNumber: 14,
      text: "Maïté joint doucement les mains pour rassurer Malvina.",
      previewUrl: "/candidate-text-page",
      storageKey: "private/candidate-text-page",
    },
    dependencies: { projects },
  });

  const pendingImagePage = stored.previewResult.draftPages[0];
  assert.equal(pendingImagePage.previewUrl, originalImagePreview);
  assert.equal(stored.previewResult.draftPages[2].text, originalText);
  assert.equal(pendingImagePage.qualityReviewCandidates.illustration.previewUrl, "/candidate-page");
  assert.equal(pendingImagePage.qualityReviewCandidates.text.previewUrl, "/candidate-text-page");

  const selection = qualityReviewCandidateSelection(pendingImagePage, "text");
  await resolveQualityReviewPage({
    projectId: stored.id,
    identity: { wooCustomerId: "42" },
    pageNumber: 15,
    resolution: "creator_repaired",
    replacement: selection.pageReplacement,
    pairedTextReplacement: selection.pairedTextReplacement,
    selectedScope: selection.scope,
    dependencies: {
      projects,
      credits: { async capturePreview() {} },
      runs: { async updateRun() {} },
      notify: async () => {},
    },
  });

  const selectedImagePage = stored.previewResult.draftPages[0];
  assert.equal(selectedImagePage.previewUrl, originalImagePreview);
  assert.equal(stored.previewResult.draftPages[2].text, "Maïté joint doucement les mains pour rassurer Malvina.");
  assert.equal(selectedImagePage.qualityReviewCandidates.text.decision, "selected");
  assert.equal(selectedImagePage.qualityReviewCandidates.illustration.decision, "original_kept");
});

test("creator approval resolves quality-review pages one by one and captures credit only after the last page", async () => {
  let stored = qualityProject();
  const captures = [];
  const runUpdates = [];
  const notifications = [];
  const dependencies = {
    projects: {
      async getForCustomer(projectId) {
        return projectId === stored.id ? structuredClone(stored) : null;
      },
      async updateForCustomer(projectId, identity, patch) {
        assert.equal(projectId, stored.id);
        stored = { ...stored, ...structuredClone(patch) };
        return structuredClone(stored);
      },
    },
    credits: {
      async capturePreview(reservationId) {
        captures.push(reservationId);
      },
    },
    runs: {
      async updateRun(runId, patch) {
        runUpdates.push({ runId, patch });
      },
    },
    notify: async ({ project }) => {
      notifications.push(project.id);
    },
  };
  const identity = { wooCustomerId: "42", email: "parent@example.com" };

  const first = await resolveQualityReviewPage({
    projectId: stored.id,
    identity,
    pageNumber: 15,
    resolution: "creator_approved",
    dependencies,
  });
  assert.equal(first.ready, false);
  assert.deepEqual(first.remainingPages.map((page) => page.pageNumber), [31]);
  assert.equal(stored.status, "preview_quality_review");
  assert.equal(stored.previewResult.draftPages[0].qualityStatus, "accepted_by_creator");
  assert.deepEqual(captures, []);
  assert.equal(runUpdates.at(-1).patch.status, "repair_pending");

  const second = await resolveQualityReviewPage({
    projectId: stored.id,
    identity,
    pageNumber: 31,
    resolution: "creator_approved",
    dependencies,
  });
  assert.equal(second.ready, true);
  assert.deepEqual(second.remainingPages, []);
  assert.equal(stored.status, "preview_ready");
  assert.equal(stored.continuitySnapshot.generationCheckpoint.phase, "done");
  assert.equal(stored.continuitySnapshot.generationCheckpoint.qualityReview.status, "resolved");
  assert.deepEqual(captures, ["reservation-quality"]);
  assert.equal(runUpdates.at(-1).patch.status, "completed");
  assert.deepEqual(notifications, ["project-quality"]);
  assert.ok(stored.continuitySnapshot.previewNotification.sentAt);
});

test("quality-review UI requires a reason and offers private text or image alternatives", async () => {
  const [route, service, rewrite, app, jobs, server] = await Promise.all([
    fs.readFile("src/routes/qualityReview.js", "utf8"),
    fs.readFile("src/services/qualityReviewResolution.js", "utf8"),
    fs.readFile("src/services/rewriteApprovedSpreadText.js", "utf8"),
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("src/routes/jobs.js", "utf8"),
    fs.readFile("src/server.js", "utf8"),
  ]);
  assert.match(route, /quality-review\/pages\/:pageNumber\/approve/);
  assert.match(route, /quality-review\/pages\/:pageNumber\/repair/);
  assert.match(route, /quality-review\/pages\/:pageNumber\/keep-original/);
  assert.match(route, /quality-review\/pages\/:pageNumber\/use-candidate/);
  assert.match(route, /MAX_QUALITY_REVIEW_ATTEMPTS_PER_SCOPE/);
  assert.match(route, /qualityReviewScopePolicy/);
  assert.match(route, /MAX_CREATOR_INSTRUCTION_LENGTH = 500/);
  assert.match(route, /MIN_CREATOR_INSTRUCTION_LENGTH = 8/);
  assert.match(route, /maximumAttempts: 1/);
  assert.match(route, /saveQualityReviewCandidate/);
  assert.match(route, /rewriteApprovedSpreadText/);
  assert.match(route, /deterministicStoryPlanIssues/);
  assert.match(route, /Choose whether to adjust the text or the illustration/);
  assert.match(route, /instruction\.length < MIN_CREATOR_INSTRUCTION_LENGTH/);
  assert.match(rewrite, /minor gesture may be reworded/);
  assert.match(rewrite, /Preserve every established plot fact, chronology, location, physical cast, object state and outcome/);
  assert.match(service, /capturePreview\(checkpoint\.creditReservationId\)/);
  assert.match(service, /status: "preview_ready"/);
  assert.match(app, /data-quality-view/);
  assert.match(app, /data-quality-approve/);
  assert.match(app, /data-quality-repair/);
  assert.match(app, /data-quality-instruction/);
  assert.match(app, /data-quality-scope="text"/);
  assert.match(app, /data-quality-scope="illustration"/);
  assert.match(app, /repairRetryAvailable/);
  assert.match(app, /repairTechnicalExhausted/);
  assert.match(app, /readerQualityReviewSync/);
  assert.match(app, /installReaderQualityReview/);
  assert.match(app, /repairRephraseRequired/);
  assert.match(route, /quality_review_request_rephrase_required/);
  assert.match(route, /qualityReviewInstructionFingerprint/);
  assert.match(app, /instructionRequired/);
  assert.match(app, /quality-review-text-comparison/);
  assert.match(app, /data-quality-keep-original/);
  assert.match(app, /data-quality-use-candidate/);
  assert.match(app, /quality-review-comparison/);
  assert.match(app, /\^\(\?:draft:\)\?page:/);
  assert.match(jobs, /localJob\?\.status === "running"/);
  assert.match(server, /qualityReviewRouter/);
});
