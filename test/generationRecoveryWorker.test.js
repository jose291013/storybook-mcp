import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonGenerationRunStore } from "../src/services/generationRunStore.js";
import { recoverAbandonedGenerationRuns } from "../src/services/generationRecoveryWorker.js";
import { mergeGenerationCheckpoint, technicalPreviewRetryAvailable } from "../src/services/previewGenerationCheckpoint.js";
import { JsonProjectStore } from "../src/services/projectStore.js";

test("an expired Render worker lease becomes a free resumable interruption automatically", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "calitiki-generation-recovery-"));
  try {
    const projects = new JsonProjectStore(path.join(directory, "projects.json"));
    const runs = new JsonGenerationRunStore(path.join(directory, "runs.json"));
    const identity = { wooCustomerId: "42", email: "parent@example.test" };
    const customer = await projects.ensureCustomer(identity);
    const project = await projects.create({
      customerId: customer.id,
      status: "preview_generating",
      continuitySnapshot: mergeGenerationCheckpoint({
        previewNotification: { emailRequested: true },
      }, {
        fingerprint: "fingerprint-1",
        phase: "page:6",
        creditReservationId: "reservation-1",
      }),
    });
    await runs.createRun({
      id: "run-expired",
      projectId: project.id,
      kind: "preview",
      status: "running",
      currentStep: "draft:page:7",
    });
    await runs.updateRun("run-expired", {
      leaseOwner: "render:old",
      leaseExpiresAt: new Date(Date.now() - 60000).toISOString(),
    });
    await projects.update(project.id, { generationJobId: "run-expired" });

    const released = [];
    const notifications = [];
    const recovered = await recoverAbandonedGenerationRuns({
      runs,
      projects,
      credits: {
        releasePreview: async (reservationId) => { released.push(reservationId); },
      },
      notify: async (input) => { notifications.push(input); },
    });

    assert.equal(recovered.length, 1);
    const updated = await projects.get(project.id);
    assert.equal(updated.status, "preview_failed");
    assert.equal(updated.continuitySnapshot.generationCheckpoint.failureReason, "preview_interrupted");
    assert.equal(technicalPreviewRetryAvailable(updated), true);
    assert.deepEqual(released, ["reservation-1"]);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].event, "generation_failed");
    assert.equal(notifications[0].retryAvailable, true);
    assert.equal((await runs.getRun("run-expired")).status, "failed");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("quality review UI is terminal, localized and keeps commerce actions locked", async () => {
  const [app, html, styles, library, checkout] = await Promise.all([
    fs.readFile("public/app.js", "utf8"),
    fs.readFile("public/index.html", "utf8"),
    fs.readFile("public/styles.css", "utf8"),
    fs.readFile("src/services/customerCreationLibrary.js", "utf8"),
    fs.readFile("src/routes/commerceCheckout.js", "utf8"),
  ]);
  assert.match(html, /id="qualityReviewNotice"/);
  assert.match(styles, /\.quality-review-notice/);
  assert.match(app, /const QUALITY_REVIEW_TEXT/);
  assert.match(app, /quality_review_required/);
  assert.match(app, /preview_quality_review/);
  assert.match(app, /elements\.actionBuyEbook\.disabled = locked/);
  assert.match(app, /elements\.actionRequestChange\.disabled = locked/);
  assert.match(library, /preview_quality_review/);
  assert.match(checkout, /\["preview_ready", "purchased"\]\.includes\(project\.status\)/);
});
