import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { resolveQualityReviewPage } from "../src/services/qualityReviewResolution.js";

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
          previewUrl: "/15",
          qualityStatus: "review_required",
          qualityKind: "scene",
          qualityIssues: ["Required character missing"],
        },
        {
          page_number: 31,
          page_type: "image",
          previewUrl: "/31",
          qualityStatus: "review_required",
          qualityKind: "scene",
          qualityIssues: ["Main action unclear"],
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

test("quality-review UI exposes view, human approval and one bounded free repair while durable progress remains visible", async () => {
  const [route, service, app, jobs, server] = await Promise.all([
    fs.readFile("src/routes/qualityReview.js", "utf8"),
    fs.readFile("src/services/qualityReviewResolution.js", "utf8"),
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("src/routes/jobs.js", "utf8"),
    fs.readFile("src/server.js", "utf8"),
  ]);
  assert.match(route, /quality-review\/pages\/:pageNumber\/approve/);
  assert.match(route, /quality-review\/pages\/:pageNumber\/repair/);
  assert.match(route, /MAX_CREATOR_REPAIRS_PER_PAGE = 1/);
  assert.match(route, /maximumAttempts: 1/);
  assert.match(service, /capturePreview\(checkpoint\.creditReservationId\)/);
  assert.match(service, /status: "preview_ready"/);
  assert.match(app, /data-quality-view/);
  assert.match(app, /data-quality-approve/);
  assert.match(app, /data-quality-repair/);
  assert.match(app, /\^\(\?:draft:\)\?page:/);
  assert.match(jobs, /localJob\?\.status === "running"/);
  assert.match(server, /qualityReviewRouter/);
});
