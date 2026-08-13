import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBookRequest } from "../src/services/normalizeBookRequest.js";
import { previewRequestFingerprint } from "../src/services/previewGenerationCheckpoint.js";
import { processStoryScenarioRun } from "../src/services/storyScenarioWorker.js";

function projectFixture({
  previousScenario = null,
  previousProjectStatus = "ready_for_preview",
  technicalAttempt = 1,
  notificationRequested = false,
  automaticRepair = false,
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
    customerId: "customer-1",
    status: "scenario_generating",
    questionnaire,
    photoRefs: [],
    generationJobId: "run-1",
    continuitySnapshot: {
      previewNotification: {
        emailRequested: notificationRequested,
      },
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
          ...(automaticRepair ? {
            automaticRepair: true,
            automaticRepairPlan: { version: 1, validation: { valid: false, issues: ["scene-2: travel"] } },
          } : {}),
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
    async getCustomerIdentity(customerId) {
      return customerId === "customer-1"
        ? { wooCustomerId: "42", email: "parent@example.test" }
        : null;
    },
    current() {
      return structuredClone(project);
    },
  };
}

function fakeRuns(metadata = {}) {
  const patches = [];
  let current = { id: "run-1", metadata: structuredClone(metadata) };
  return {
    async getRun(id) {
      return id === current.id ? structuredClone(current) : null;
    },
    async heartbeatRun() {
      return {};
    },
    async updateRun(id, patch) {
      patches.push({ id, ...structuredClone(patch) });
      current = { ...current, ...structuredClone(patch) };
      return structuredClone(current);
    },
    current() {
      return structuredClone(current);
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
      return {
        scenario,
        validation: { valid: true, issues: [] },
        canonicalCandidateEvidence: {
          version: 1,
          status: "compiled",
          artifactDigest: "c".repeat(64),
        },
      };
    },
  });

  const completed = projects.current();
  assert.equal(completed.status, "scenario_review");
  assert.equal(completed.generationJobId, null);
  assert.equal(completed.continuitySnapshot.storyScenario.title, scenario.title);
  assert.equal(completed.continuitySnapshot.storyScenarioGeneration.status, "completed");
  assert.equal(completed.continuitySnapshot.storyScenarioGeneration.request, null);
  assert.equal(completed.continuitySnapshot.narrativeV2Candidate.status, "compiled");
  assert.equal(completed.continuitySnapshot.narrativeV2Candidate.artifactDigest, "c".repeat(64));
  assert.equal(runs.patches.at(-1).status, "completed");
  assert.ok(runs.patches.some((patch) => patch.currentStep === "scenario:architect:attempt:1"));
});

test("completed scenario sends one requested email milestone and persists its dedupe key", async () => {
  const projects = fakeProjects(projectFixture({ notificationRequested: true }));
  const runs = fakeRuns();
  const notifications = [];
  await processStoryScenarioRun({
    id: "run-1",
    projectId: "project-1",
    currentStep: "scenario:queued",
  }, {
    projects,
    runs,
    workerId: "worker-1",
    heartbeatMs: 60000,
    generate: async () => ({
      scenario: {
        title: "Bastien et la forêt",
        summary: "Une aventure.",
        clarifications: [],
        scenes: [],
      },
      validation: { valid: true, issues: [] },
    }),
    notifyMilestone: async (payload) => {
      notifications.push(payload);
    },
  });

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].event, "scenario_ready");
  assert.equal(notifications[0].identity.wooCustomerId, "42");
  assert.equal(
    projects.current().continuitySnapshot.previewNotification.milestoneEventIds.scenario_ready,
    "run-1:scenario_ready",
  );
});

test("an unvalidated first proposal stays quarantined and exposes one free retry", async () => {
  const projects = fakeProjects(projectFixture());
  const runs = fakeRuns({ requestKind: "initial" });
  await processStoryScenarioRun({
    id: "run-1",
    projectId: "project-1",
    currentStep: "scenario:editor:attempt:1",
    metadata: { requestKind: "initial" },
  }, {
    projects,
    runs,
    workerId: "worker-1",
    heartbeatMs: 60000,
    generate: async () => ({
      scenario: {
        title: "Private rejected candidate",
        summary: "Must never reach creator review.",
        clarifications: [],
        scenes: [{ sceneNumber: 15 }],
      },
      validation: {
        valid: false,
        issues: ["scene-15: family_connection_missing: private finding"],
        diagnostics: [{ code: "family_connection_missing", sceneNumber: 15 }],
      },
    }),
  });

  const failed = projects.current();
  assert.equal(failed.status, "scenario_generation_failed");
  assert.equal(failed.continuitySnapshot.storyScenario, undefined);
  assert.equal(failed.continuitySnapshot.storyScenarioGeneration.errorCode, "scenario_quality_gate_unresolved");
  assert.equal(failed.continuitySnapshot.storyScenarioGeneration.retryAvailable, true);
  assert.equal(JSON.stringify(failed).includes("Private rejected candidate"), false);
  assert.equal(runs.patches.at(-1).errorCode, "scenario_quality_gate_unresolved");
});

test("an unvalidated revision preserves the previous reviewable scenario", async () => {
  const previousScenario = {
    title: "Validated previous scenario",
    fingerprint: "legacy",
    revision: 2,
    clarifications: [],
  };
  const projects = fakeProjects(projectFixture({
    previousScenario,
    previousProjectStatus: "scenario_review",
  }));
  const runs = fakeRuns({ requestKind: "revision" });
  await processStoryScenarioRun({
    id: "run-1",
    projectId: "project-1",
    currentStep: "scenario:editor:attempt:1",
    metadata: { requestKind: "revision" },
  }, {
    projects,
    runs,
    workerId: "worker-1",
    heartbeatMs: 60000,
    generate: async () => ({
      scenario: { title: "Rejected replacement", clarifications: [], scenes: [] },
      validation: {
        valid: false,
        issues: ["scene-21: physical_presence_location_mismatch: the group remains in the cabin"],
        diagnostics: [{
          code: "physical_presence_location_mismatch",
          sceneNumber: 21,
          explanation: "The group remains in the cabin after disembarking.",
        }],
      },
    }),
  });

  const failed = projects.current();
  assert.equal(failed.status, "scenario_review");
  assert.equal(failed.continuitySnapshot.storyScenario.title, previousScenario.title);
  assert.equal(JSON.stringify(failed).includes("Rejected replacement"), false);
  assert.equal(failed.continuitySnapshot.storyScenarioGeneration.retryAvailable, true);
  assert.deepEqual(failed.continuitySnapshot.storyScenarioGeneration.rejectedCandidateFailure, {
    version: 1,
    valid: false,
    reason: "rejected_candidate_final_checks",
    issueCount: 1,
    categories: ["travel"],
    sceneNumbers: [21],
    categoryScenes: { travel: [21] },
    diagnostics: [{
      code: "physical_presence_location_mismatch",
      sceneNumber: 21,
      explanation: "The group remains in the cabin after disembarking.",
    }],
  });
});

test("durable scenario worker stores only provider response checkpoints in run metadata", async () => {
  const projects = fakeProjects(projectFixture());
  const runs = fakeRuns({ requestKind: "initial" });
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
    metadata: { requestKind: "initial" },
  }, {
    projects,
    runs,
    workerId: "worker-1",
    heartbeatMs: 60000,
    generate: async ({ backgroundExecution }) => {
      await backgroundExecution.saveCheckpoint("architect:1:primary", {
        responseId: "resp_architect",
        status: "in_progress",
        startedAt: "2026-07-29T10:00:00.000Z",
        updatedAt: "2026-07-29T10:00:02.000Z",
        privateOutput: "must not be persisted",
      });
      return { scenario, validation: { valid: true, issues: [] } };
    },
  });

  assert.deepEqual(runs.current().metadata, {
    requestKind: "initial",
    providerResponses: {
      "architect:1:primary": {
        responseId: "resp_architect",
        status: "in_progress",
        startedAt: "2026-07-29T10:00:00.000Z",
        updatedAt: "2026-07-29T10:00:02.000Z",
        completedAt: null,
      },
    },
  });
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

test("failed scenario sends the requested interruption milestone with its free-retry state", async () => {
  const projects = fakeProjects(projectFixture({ notificationRequested: true }));
  const runs = fakeRuns();
  const notifications = [];
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
    notifyMilestone: async (payload) => {
      notifications.push(payload);
    },
  });

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].event, "scenario_failed");
  assert.equal(notifications[0].retryAvailable, true);
  assert.equal(
    projects.current().continuitySnapshot.previewNotification.milestoneEventIds.scenario_failed,
    "run-1:scenario_failed",
  );
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

test("failed automatic repair preserves the previous scenario without opening a retry loop", async () => {
  const previousScenario = {
    title: "Scénario conservé",
    fingerprint: "legacy",
    revision: 2,
    clarifications: [],
  };
  const projects = fakeProjects(projectFixture({
    previousScenario,
    previousProjectStatus: "scenario_review",
    automaticRepair: true,
  }));
  const runs = fakeRuns({ requestKind: "automatic_repair" });
  await processStoryScenarioRun({
    id: "run-1",
    projectId: "project-1",
    currentStep: "scenario:automatic-repair:attempt:1",
    metadata: { requestKind: "automatic_repair" },
  }, {
    projects,
    runs,
    workerId: "worker-1",
    heartbeatMs: 60000,
    generate: async () => {
      const error = new Error("Targeted repair remained inconsistent.");
      error.canonicalDiagnostics = {
        version: 1,
        initialIssues: [{ code: "ambiguous_object_events", sceneNumber: 7 }],
        finalIssues: [
          { code: "ambiguous_object_events", sceneNumber: 7 },
          { code: "ambiguous_object_events", sceneNumber: 9 },
        ],
      };
      throw error;
    },
  });

  const failed = projects.current();
  assert.equal(failed.status, "scenario_review");
  assert.equal(failed.continuitySnapshot.storyScenario.title, previousScenario.title);
  assert.equal(failed.continuitySnapshot.storyScenarioGeneration.retryAvailable, false);
  assert.equal(failed.continuitySnapshot.storyScenarioGeneration.retryExhausted, true);
  assert.deepEqual(failed.continuitySnapshot.storyScenarioGeneration.automaticRepairFailure, {
    version: 1,
    reason: "final_checks_failed",
    categories: ["object"],
    sceneNumbers: [7, 9],
  });
  assert.equal(runs.patches.at(-1).errorCode, "scenario_auto_repair_unresolved");
});

test("canonical failure stores only private bounded diagnostics in run metadata", async () => {
  const projects = fakeProjects(projectFixture());
  const runs = fakeRuns({
    requestKind: "initial",
    providerResponses: { architect: { responseId: "resp_1" } },
  });
  await processStoryScenarioRun({
    id: "run-1",
    projectId: "project-1",
    currentStep: "scenario:editor:attempt:1",
    metadata: { requestKind: "initial" },
  }, {
    projects,
    runs,
    workerId: "worker-1",
    heartbeatMs: 60000,
    generate: async () => {
      const error = new Error("The canonical scenario candidate could not be compiled.");
      error.code = "scenario_contract_invalid";
      error.canonicalDiagnostics = {
        version: 1,
        repairAttempted: true,
        finalAuditAttempted: false,
        initialIssues: [{
          code: "unknown character!",
          path: "scenes[3].presences[0] / private name",
          sceneNumber: 4,
          explanation: "Never persist this private story sentence.",
        }],
        finalIssues: [{
          code: "unknown_location",
          path: "scenes[3].locationId",
          sceneNumber: 4,
          privatePayload: "secret",
        }],
      };
      throw error;
    },
  });

  assert.deepEqual(runs.current().metadata, {
    requestKind: "initial",
    providerResponses: { architect: { responseId: "resp_1" } },
    canonicalGate: {
      version: 1,
      repairAttempted: true,
      finalAuditAttempted: false,
      initialIssues: [{
        code: "unknown_character_",
        path: "scenes[3].presences[0]_private_name",
        sceneNumber: 4,
      }],
      finalIssues: [{
        code: "unknown_location",
        path: "scenes[3].locationId",
        sceneNumber: 4,
      }],
    },
  });
  assert.equal(JSON.stringify(runs.current().metadata).includes("private story sentence"), false);
  assert.equal(projects.current().continuitySnapshot.canonicalGate, undefined);
});
