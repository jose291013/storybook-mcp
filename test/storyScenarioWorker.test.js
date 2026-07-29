import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBookRequest } from "../src/services/normalizeBookRequest.js";
import { previewRequestFingerprint } from "../src/services/previewGenerationCheckpoint.js";
import { processStoryScenarioRun } from "../src/services/storyScenarioWorker.js";

function projectFixture({
  previousScenario = null,
  previousProjectStatus = "ready_for_preview",
  technicalAttempt = 1,
} = {}) {
  const questionnaire = {
    age: 8,
    hero_name: "Bastien",
    page_count: 24,
    product_type: "ebook",
    book_language: "FR",
    language: "FR",
    universe_id: "enchanted_forest",
  };
  const fingerprint = previewRequestFingerprint(normalizeBookRequest({
    questionnaire,
    photos: [],
  }));
  return {
    id: "project-1",
    status: "scenario_generating",
    questionnaire,
    photoRefs: [],
    generationJobId: "run-1",
    continuitySnapshot: {
      ...(previousScenario ? { storyScenario: previousScenario } : {}),
      storyScenarioGeneration: {
        version: 1,
        runId: "run-1",
        status: "queued",
        phase: "queued",
        fingerprint,
        previousProjectStatus,
        technicalAttempt,
        maxTechnicalAttempts: 2,
        retryAvailable: false,
        request: {
          creatorClarifications: {},
          sceneEdits: [],
          addedCharacters: [],
          feedback: "",
          safetyContract: { action: "allow" },
        },
      },
    },
  };
}

function fakeProjects(initial) {
  let project = structuredClone(initial);
  return {
    async get(id) {
      return id === project.id ? structuredClone(project) : null;
    },
    async update(id, patch) {
      assert.equal(id, project.id);
      project = { ...project, ...structuredClone(patch) };
      return structuredClone(project);
    },
    current() {
      return structuredClone(project);
    },
  };
}

function fakeRuns() {
  const patches = [];
  return {
    async heartbeatRun() {
      return {};
    },
    async updateRun(id, patch) {
      patches.push({ id, ...structuredClone(patch) });
      return { id, ...patch };
    },
    patches,
  };
}

test("durable scenario worker persists a completed scenario without storing its request twice", async () => {
  const projects = fakeProjects(projectFixture());
  const runs = fakeRuns();
  const scenario = {
    title: "Bastien et la forêt",
    summary: "Une aventure.",
    clarifications: [],
    scenes: [],
  };
  await processStoryScenarioRun({
    id: "run-1",
    projectId: "project-1",
    currentStep: "scenario:queued",
  }, {
    projects,
    runs,
    workerId: "worker-1",
    heartbeatMs: 60000,
    generate: async ({ onStep }) => {
      await onStep({ phase: "architect", attempt: 1 });
      await onStep({ phase: "editor", attempt: 1 });
      return { scenario, validation: { valid: true, issues: [] } };
    },
  });

  const completed = projects.current();
  assert.equal(completed.status, "scenario_review");
  assert.equal(completed.generationJobId, null);
  assert.equal(completed.continuitySnapshot.storyScenario.title, scenario.title);
  assert.equal(completed.continuitySnapshot.storyScenarioGeneration.status, "completed");
  assert.equal(completed.continuitySnapshot.storyScenarioGeneration.request, null);
  assert.equal(runs.patches.at(-1).status, "completed");
  assert.ok(runs.patches.some((patch) => patch.currentStep === "scenario:architect:attempt:1"));
});

test("durable scenario timeout preserves the exact request and exposes one free retry", async () => {
  const projects = fakeProjects(projectFixture());
  const runs = fakeRuns();
  await processStoryScenarioRun({
    id: "run-1",
    projectId: "project-1",
    currentStep: "scenario:architect:attempt:1",
  }, {
    projects,
    runs,
    workerId: "worker-1",
    heartbeatMs: 60000,
    generate: async () => {
      throw new Error("Request timed out.");
    },
  });

  const failed = projects.current();
  assert.equal(failed.status, "scenario_generation_failed");
  assert.equal(failed.generationJobId, "run-1");
  assert.equal(failed.continuitySnapshot.storyScenarioGeneration.status, "failed");
  assert.equal(failed.continuitySnapshot.storyScenarioGeneration.retryAvailable, true);
  assert.ok(failed.continuitySnapshot.storyScenarioGeneration.request);
  assert.equal(runs.patches.at(-1).errorCode, "scenario_timeout");
});

test("a failed free scenario retry stops further automatic attempts", async () => {
  const projects = fakeProjects(projectFixture({ technicalAttempt: 2 }));
  const runs = fakeRuns();
  await processStoryScenarioRun({
    id: "run-1",
    projectId: "project-1",
    currentStep: "scenario:architect:attempt:1",
  }, {
    projects,
    runs,
    workerId: "worker-1",
    heartbeatMs: 60000,
    generate: async () => {
      throw new Error("Request timed out.");
    },
  });

  const failed = projects.current();
  const checkpoint = failed.continuitySnapshot.storyScenarioGeneration;
  assert.equal(checkpoint.retryAvailable, false);
  assert.equal(checkpoint.retryExhausted, true);
  assert.ok(checkpoint.request);
});

test("failed scenario revision keeps the previously reviewable scenario", async () => {
  const previousScenario = {
    title: "Scénario conservé",
    fingerprint: "legacy",
    revision: 2,
    clarifications: [],
  };
  const projects = fakeProjects(projectFixture({
    previousScenario,
    previousProjectStatus: "scenario_review",
  }));
  const runs = fakeRuns();
  await processStoryScenarioRun({
    id: "run-1",
    projectId: "project-1",
    currentStep: "scenario:editor:attempt:1",
  }, {
    projects,
    runs,
    workerId: "worker-1",
    heartbeatMs: 60000,
    generate: async () => {
      const error = new Error("The server had an error processing your request.");
      error.status = 500;
      throw error;
    },
  });

  const failed = projects.current();
  assert.equal(failed.status, "scenario_review");
  assert.equal(failed.continuitySnapshot.storyScenario.title, previousScenario.title);
  assert.equal(failed.continuitySnapshot.storyScenarioGeneration.retryAvailable, true);
  assert.equal(runs.patches.at(-1).errorCode, "scenario_provider_unavailable");
});
