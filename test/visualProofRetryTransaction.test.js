import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  prepareVisualProofTransition,
  previewResultForVisualProofTransition,
  resumableVisualProofAction,
} from "../src/services/visualProofRetryTransaction.js";

test("a fresh cover decision is prepared without mutating its persisted source", () => {
  const source = Object.freeze({
    status: "awaiting_approval",
    attempts: 1,
    coverPreviewUrl: "/private/cover.png",
  });
  const transition = prepareVisualProofTransition({
    visualProof: source,
    requestedAction: "regenerate",
    now: "2026-08-30T10:00:00.000Z",
  });

  assert.equal(source.status, "awaiting_approval");
  assert.equal(transition.action, "regenerate");
  assert.equal(transition.visualProof.status, "regenerating");
  assert.equal(transition.visualProof.attempts, 1);
  assert.equal(transition.resumed, false);
});

test("an interrupted cover decision resumes idempotently without consuming another proof attempt", () => {
  const visualProof = {
    status: "regenerating",
    attempts: 1,
    regenerationRequestedAt: "2026-08-30T10:00:00.000Z",
  };
  const transition = prepareVisualProofTransition({
    visualProof,
    resume: true,
    now: "2026-08-30T11:00:00.000Z",
  });

  assert.equal(resumableVisualProofAction(visualProof), "regenerate");
  assert.equal(transition.resumed, true);
  assert.equal(transition.visualProof.attempts, 1);
  assert.equal(transition.visualProof.regenerationRequestedAt, "2026-08-30T10:00:00.000Z");
});

test("cover pixels are cleared only in the value prepared for the queue commit", () => {
  const persisted = {
    coverImageUrl: "/private/source.png",
    coverPreviewUrl: "/private/source-preview.png",
    draftPages: [{ page_number: 3, previewUrl: "/private/page-3.png" }],
  };
  const transition = prepareVisualProofTransition({
    visualProof: { status: "awaiting_approval", attempts: 1 },
    requestedAction: "regenerate",
  });
  const queued = previewResultForVisualProofTransition(persisted, transition);

  assert.equal(persisted.coverPreviewUrl, "/private/source-preview.png");
  assert.equal(queued.coverPreviewUrl, "");
  assert.deepEqual(queued.draftPages, persisted.draftPages);
});

test("a second customer cover regeneration remains bounded", () => {
  assert.throws(
    () => prepareVisualProofTransition({
      visualProof: { status: "awaiting_approval", attempts: 2 },
      requestedAction: "regenerate",
    }),
    (error) => error?.code === "visual_proof_limit",
  );
});

test("the route commits the visual decision with the new job and only then closes the old wait", async () => {
  const [route, app] = await Promise.all([
    fs.readFile("src/routes/preview.js", "utf8"),
    fs.readFile("public/app.js", "utf8"),
  ]);

  const queueCommit = route.indexOf("const startedProject = await projectStore.updateForCustomer");
  const oldWaitCompletion = route.indexOf("priorVisualProofRun.status === \"waiting_input\"");
  assert.ok(queueCommit >= 0);
  assert.ok(oldWaitCompletion > queueCommit);
  assert.match(route, /visualProof: visualProofTransition\.visualProof/);
  assert.match(route, /visual proof decision queued/);
  const decisionStart = route.indexOf('if (pendingVisualProof?.status === "awaiting_approval")');
  const decisionEnd = route.indexOf('if (project.status === "preview_ready"');
  assert.ok(decisionStart >= 0);
  assert.ok(decisionEnd > decisionStart);
  assert.doesNotMatch(
    route.slice(decisionStart, decisionEnd),
    /generationJobId:\s*null/,
  );
  assert.match(app, /visualProofStatus === "regenerating"[\s\S]*?generatePreviewForProject\(state\.projectId, visualProofAction\)/);
});
