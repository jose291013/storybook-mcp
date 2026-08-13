import crypto from "crypto";
import { generationRunStore } from "./generationRunStore.js";
import { normalizeBookRequest } from "./normalizeBookRequest.js";
import { previewRequestFingerprint } from "./previewGenerationCheckpoint.js";
import { projectStore } from "./projectStore.js";
import { notifyPreviewMilestone } from "./previewNotification.js";
import { generateValidatedScenario } from "./storyScenarioGeneration.js";
import {
  summarizeStoryScenarioValidation,
  storyScenarioSnapshot,
} from "./storyScenario.js";
import { storySensitivityContract } from "./storySensitivity.js";
import { withOpenAICostContext } from "./openaiCostContext.js";
import {
  canonicalGateRepairDirectives,
  canonicalGateValidation,
  compileNarrativeV2Candidate,
} from "./narrativeV2CandidateGate.js";
import { storyScenarioAutomaticRepairFailureSummary } from "./storyScenarioAutoRepair.js";
import { seriesScenarioContract } from "./seriesService.js";

const WORKER_KIND = "story_scenario";
const DEFAULT_LEASE_MS = 120000;
const DEFAULT_HEARTBEAT_MS = 30000;

function now() {
  return new Date().toISOString();
}

function scenarioGenerationSnapshot(project) {
  return project?.continuitySnapshot?.storyScenarioGeneration || null;
}

function safeProviderCheckpoint(value) {
  return {
    responseId: String(value?.responseId || "").slice(0, 200),
    status: String(value?.status || "").slice(0, 40),
    startedAt: value?.startedAt || null,
    updatedAt: value?.updatedAt || null,
    completedAt: value?.completedAt || null,
  };
}

function createBackgroundExecution({ runs, run }) {
  let metadata = { ...(run.metadata || {}) };
  let checkpoints = { ...(metadata.providerResponses || {}) };
  return {
    async getCheckpoint(stepKey) {
      return checkpoints[stepKey] || null;
    },
    async saveCheckpoint(stepKey, checkpoint) {
      checkpoints = {
        ...checkpoints,
        [stepKey]: safeProviderCheckpoint(checkpoint),
      };
      const latestRun = typeof runs.getRun === "function"
        ? await runs.getRun(run.id).catch(() => null)
        : null;
      metadata = {
        ...(latestRun?.metadata || metadata),
        providerResponses: checkpoints,
      };
      const updated = await runs.updateRun(run.id, { metadata });
      metadata = updated?.metadata || metadata;
    },
  };
}

function safeTechnicalError(error) {
  const message = String(error?.message || error || "");
  if (error?.code === "scenario_auto_repair_unresolved") {
    return {
      code: "scenario_auto_repair_unresolved",
      message: "The automatic repair did not pass every scenario check. The previous scenario was preserved.",
    };
  }
  if (error?.code === "scenario_contract_invalid") {
    return {
      code: "scenario_contract_invalid",
      message: "The scenario contract could not be finalized internally. Retry is available.",
    };
  }
  if (error?.code === "scenario_background_timeout"
    || /timed out|timeout/i.test(message)) {
    return {
      code: "scenario_timeout",
      message: "The narrative service took too long to answer. Retry is available.",
    };
  }
  if (Number(error?.status) >= 500 || /server had an error|temporarily unavailable/i.test(message)) {
    return {
      code: "scenario_provider_unavailable",
      message: "The narrative service is temporarily unavailable. Retry is available.",
    };
  }
  return {
    code: "scenario_generation_failed",
    message: "The scenario could not be prepared. Retry is available.",
  };
}

function privateCanonicalDiagnostics(error) {
  const input = error?.canonicalDiagnostics;
  if (!input || Number(input.version) !== 1) return null;
  const issues = (value) => (Array.isArray(value) ? value : [])
    .slice(0, 12)
    .map((issue) => ({
      code: String(issue?.code || "canonical_compile_failed")
        .replace(/[^a-z0-9_-]+/gi, "_")
        .slice(0, 80),
      path: String(issue?.path || "").replace(/[^a-z0-9_.\[\]-]+/gi, "_").slice(0, 180),
      sceneNumber: Math.max(0, Number(issue?.sceneNumber || 0)),
    }));
  return {
    version: 1,
    repairAttempted: Boolean(input.repairAttempted),
    finalAuditAttempted: Boolean(input.finalAuditAttempted),
    ...(input.repairBlockedByBudget ? { repairBlockedByBudget: true } : {}),
    initialIssues: issues(input.initialIssues),
    finalIssues: issues(input.finalIssues),
  };
}

async function persistGenerationProgress({
  projects,
  runs,
  project,
  run,
  phase,
  attempt,
}) {
  const current = await projects.get(project.id);
  const generation = scenarioGenerationSnapshot(current);
  if (!generation || generation.runId !== run.id) {
    throw new Error("Scenario generation checkpoint no longer matches its durable run");
  }
  const currentStep = `scenario:${phase}${attempt ? `:attempt:${attempt}` : ""}`;
  await runs.updateRun(run.id, {
    status: "running",
    currentStep,
    heartbeatAt: now(),
  });
  await projects.update(project.id, {
    continuitySnapshot: {
      ...current.continuitySnapshot,
      storyScenarioGeneration: {
        ...generation,
        status: "running",
        phase,
        attempt,
        updatedAt: now(),
      },
    },
  });
}

function startHeartbeat(runs, runId, workerId, leaseMs, heartbeatMs) {
  const timer = setInterval(() => {
    runs.heartbeatRun(runId, workerId, leaseMs).catch((error) => {
      console.warn("[story-scenario] heartbeat failed", JSON.stringify({
        runId,
        error: String(error?.message || error),
      }));
    });
  }, heartbeatMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

async function notifyScenarioMilestoneIfRequested({
  projects,
  projectId,
  event,
  eventId,
  retryAvailable = false,
  notifyMilestone = notifyPreviewMilestone,
}) {
  try {
    const project = await projects.get(projectId);
    const notification = project?.continuitySnapshot?.previewNotification || {};
    if (!project || notification.emailRequested !== true) return false;
    if (notification.milestoneEventIds?.[event] === eventId) return false;
    const identity = typeof projects.getCustomerIdentity === "function"
      ? await projects.getCustomerIdentity(project.customerId)
      : null;
    if (!identity?.wooCustomerId) return false;
    await notifyMilestone({
      project,
      identity,
      event,
      eventId,
      retryAvailable,
    });
    const refreshed = await projects.get(projectId);
    const refreshedNotification = refreshed?.continuitySnapshot?.previewNotification || {};
    await projects.update(projectId, {
      continuitySnapshot: {
        ...refreshed.continuitySnapshot,
        previewNotification: {
          ...refreshedNotification,
          milestoneEventIds: {
            ...(refreshedNotification.milestoneEventIds || {}),
            [event]: eventId,
          },
          milestoneSentAt: {
            ...(refreshedNotification.milestoneSentAt || {}),
            [event]: now(),
          },
        },
      },
    });
    return true;
  } catch (error) {
    console.warn("[story-scenario] notification failed", JSON.stringify({
      projectId,
      event,
      error: String(error?.message || error),
    }));
    return false;
  }
}

async function completeScenario({
  projects,
  runs,
  project,
  run,
  scenario,
  validation,
  canonicalCandidateEvidence,
  notifyMilestone,
}) {
  const latest = await projects.get(project.id);
  const previous = storyScenarioSnapshot(latest);
  const generation = scenarioGenerationSnapshot(latest);
  if (!generation || generation.runId !== run.id) {
    throw new Error("Scenario generation checkpoint changed before completion");
  }
  const createdAt = now();
  const validationSummary = validation.valid
    ? { ...validation, version: 2, diagnostics: [] }
    : summarizeStoryScenarioValidation(validation);
  const storedScenario = {
    ...scenario,
    fingerprint: generation.fingerprint,
    status: validation.valid
      ? (scenario.clarifications.length ? "needs_clarification" : "proposed")
      : "needs_revision",
    revision: Number(previous?.revision || 0) + 1,
    validation: validationSummary,
    createdAt,
    approvedAt: null,
  };
  const status = storedScenario.status === "needs_clarification"
    ? "scenario_needs_clarification"
    : "scenario_review";
  await projects.update(project.id, {
    status,
    generationJobId: null,
    continuitySnapshot: {
      ...latest.continuitySnapshot,
      storyScenarioWorkflow: {
        required: true,
        version: 1,
        startedAt: previous?.createdAt || createdAt,
      },
      storyScenario: storedScenario,
      narrativeV2Candidate: validation.valid ? canonicalCandidateEvidence : null,
      storyScenarioGeneration: {
        ...generation,
        status: "completed",
        phase: validation.valid ? "completed" : "needs_revision",
        retryAvailable: false,
        completedAt: createdAt,
        updatedAt: createdAt,
        request: null,
      },
    },
  });
  await runs.updateRun(run.id, {
    status: "completed",
    currentStep: validation.valid ? "scenario:completed" : "scenario:needs_revision",
    errorCode: "",
    errorMessage: "",
    completedAt: createdAt,
    leaseOwner: "",
    leaseExpiresAt: null,
  });
  await notifyScenarioMilestoneIfRequested({
    projects,
    projectId: project.id,
    event: "scenario_ready",
    eventId: `${run.id}:scenario_ready`,
    notifyMilestone,
  });
  console.info("[story-scenario] completed", JSON.stringify({
    runId: run.id,
    projectId: project.id,
    valid: validation.valid,
    issueCount: validation.valid ? 0 : validation.issues.length,
  }));
  return storedScenario;
}

async function failScenario({
  projects,
  runs,
  project,
  run,
  error,
  startedAt,
  notifyMilestone,
}) {
  const latest = await projects.get(project.id).catch(() => project);
  const generation = scenarioGenerationSnapshot(latest);
  const technical = safeTechnicalError(error);
  const canonicalDiagnostics = privateCanonicalDiagnostics(error);
  const failedAt = now();
  const technicalAttempt = Math.max(1, Number(generation?.technicalAttempt || 1));
  const maxTechnicalAttempts = Math.max(
    1,
    Number(generation?.maxTechnicalAttempts || 2),
  );
  const retryAvailable = error?.noTechnicalRetry === true
    ? false
    : technicalAttempt < maxTechnicalAttempts;
  if (generation?.runId === run.id) {
    const automaticRepairFailure = generation?.request?.automaticRepair === true
      ? storyScenarioAutomaticRepairFailureSummary(canonicalDiagnostics)
      : null;
    await projects.update(project.id, {
      status: generation.previousProjectStatus === "scenario_review"
        || generation.previousProjectStatus === "scenario_needs_clarification"
        ? generation.previousProjectStatus
        : "scenario_generation_failed",
      generationJobId: run.id,
      continuitySnapshot: {
        ...latest.continuitySnapshot,
        storyScenarioGeneration: {
          ...generation,
          status: "failed",
          phase: "failed",
          errorCode: technical.code,
          ...(automaticRepairFailure ? { automaticRepairFailure } : {}),
          retryAvailable,
          retryExhausted: !retryAvailable,
          failedAt,
          updatedAt: failedAt,
        },
      },
    }).catch(() => null);
  }
  const latestRun = typeof runs.getRun === "function"
    ? await runs.getRun(run.id).catch(() => null)
    : null;
  await runs.updateRun(run.id, {
    status: "failed",
    currentStep: "scenario:failed",
    errorCode: technical.code,
    errorMessage: technical.message,
    ...(canonicalDiagnostics ? {
      metadata: {
        ...(latestRun?.metadata || run.metadata || {}),
        canonicalGate: canonicalDiagnostics,
      },
    } : {}),
    completedAt: failedAt,
    leaseOwner: "",
    leaseExpiresAt: null,
  }).catch(() => null);
  await notifyScenarioMilestoneIfRequested({
    projects,
    projectId: project.id,
    event: "scenario_failed",
    eventId: `${run.id}:scenario_failed`,
    retryAvailable,
    notifyMilestone,
  });
  console.error("[story-scenario] failed", JSON.stringify({
    runId: run.id,
    projectId: project.id,
    step: generation?.phase ? `scenario:${generation.phase}` : run.currentStep || "scenario:queued",
    code: technical.code,
    technicalAttempt,
    retryAvailable,
    elapsedMs: Date.now() - startedAt,
    requestId: error?.request_id || error?.requestId || null,
    error: String(error?.message || error),
    ...(canonicalDiagnostics ? { canonicalGate: canonicalDiagnostics } : {}),
  }));
}

export async function processStoryScenarioRun(run, dependencies = {}) {
  const projects = dependencies.projects || projectStore;
  const runs = dependencies.runs || generationRunStore;
  const workerId = dependencies.workerId || `scenario-${process.pid}-${crypto.randomUUID()}`;
  const leaseMs = dependencies.leaseMs || DEFAULT_LEASE_MS;
  const heartbeatMs = dependencies.heartbeatMs || DEFAULT_HEARTBEAT_MS;
  const generate = dependencies.generate || generateValidatedScenario;
  const notifyMilestone = dependencies.notifyMilestone || notifyPreviewMilestone;
  const startedAt = Date.now();
  const stopHeartbeat = startHeartbeat(runs, run.id, workerId, leaseMs, heartbeatMs);
  let project = null;
  try {
    project = await projects.get(run.projectId);
    if (!project) throw new Error("Scenario project not found");
    const generation = scenarioGenerationSnapshot(project);
    if (generation?.runId === run.id && generation.status === "completed") {
      await runs.updateRun(run.id, {
        status: "completed",
        currentStep: "scenario:completed",
        errorCode: "",
        errorMessage: "",
        completedAt: generation.completedAt || now(),
        leaseOwner: "",
        leaseExpiresAt: null,
      });
      return project.continuitySnapshot?.storyScenario || null;
    }
    if (!generation || generation.runId !== run.id || !generation.request) {
      throw new Error("Scenario generation checkpoint is missing or stale");
    }
    const normalized = normalizeBookRequest({
      questionnaire: project.questionnaire,
      photos: project.photoRefs,
    });
    let seriesContract = seriesScenarioContract(project);
    if (!seriesContract && project.sourceProjectId) {
      const sourceProject = await projects.get(project.sourceProjectId).catch(() => null);
      seriesContract = seriesScenarioContract(sourceProject);
    }
    if (previewRequestFingerprint(normalized) !== generation.fingerprint) {
      throw new Error("Scenario generation request no longer matches the project");
    }
    const previous = storyScenarioSnapshot(project);
    const request = generation.request;
    const backgroundExecution = createBackgroundExecution({ runs, run });
    let costStage = "scenario:architect:attempt:1";
    let costAttemptKind = Number(generation.technicalAttempt || 1) > 1
      ? "technical_retry"
      : "normal";
    const onStep = ({ phase, attempt }) => {
      costStage = `scenario:${phase || "generation"}:attempt:${Number(attempt || 0)}`;
      costAttemptKind = Number(generation.technicalAttempt || 1) > 1
        ? "technical_retry"
        : phase === "revision"
          ? "customer_change"
        : String(phase || "").includes("repair")
          ? "quality_repair"
          : "normal";
      return persistGenerationProgress({
        projects,
        runs,
        project,
        run,
        phase,
        attempt,
      });
    };
    const automaticRepair = request.automaticRepair === true;
    let generated;
    try {
      generated = await withOpenAICostContext({
        projectId: run.projectId,
        runId: run.id,
        workflow: "scenario",
        getStage: () => costStage,
        getAttemptKind: () => costAttemptKind,
      }, () => generate({
        normalized,
        previousScenario: previous?.fingerprint === generation.fingerprint ? previous : null,
        creatorClarifications: request.creatorClarifications || {},
        sceneEdits: request.sceneEdits || [],
        addedCharacters: request.addedCharacters || [],
        feedback: request.feedback || "",
        safetyContract: request.safetyContract || null,
        sensitivityContract: storySensitivityContract(
          project.questionnaire?.story_sensitivity_profile,
        ),
        seriesContract,
        automaticRepair,
        automaticRepairPlan: request.automaticRepairPlan || null,
        onStep,
        backgroundExecution,
        canonicalCandidateCheck: (candidate) => {
          const result = compileNarrativeV2Candidate({ project, scenario: candidate });
          return {
            ...result,
            validation: canonicalGateValidation(result),
            repairDirectives: canonicalGateRepairDirectives(result),
          };
        },
      }));
    } catch (error) {
      if (automaticRepair) {
        error.code = "scenario_auto_repair_unresolved";
        error.noTechnicalRetry = true;
      }
      throw error;
    }
    const { scenario, validation, canonicalCandidateEvidence } = generated;
    if (automaticRepair && !validation.valid) {
      const error = new Error("The automatic scenario repair did not pass its final audit.");
      error.code = "scenario_auto_repair_unresolved";
      error.noTechnicalRetry = true;
      throw error;
    }
    return await completeScenario({
      projects,
      runs,
      project,
      run,
      scenario,
      validation,
      canonicalCandidateEvidence,
      notifyMilestone,
    });
  } catch (error) {
    await failScenario({
      projects,
      runs,
      project: project || { id: run.projectId, continuitySnapshot: {} },
      run,
      error,
      startedAt,
      notifyMilestone,
    });
    return null;
  } finally {
    stopHeartbeat();
  }
}

export async function runNextStoryScenario(dependencies = {}) {
  const runs = dependencies.runs || generationRunStore;
  const workerId = dependencies.workerId || `scenario-${process.pid}-${crypto.randomUUID()}`;
  const leaseMs = dependencies.leaseMs || DEFAULT_LEASE_MS;
  const run = await runs.claimNextRun({
    workerId,
    leaseMs,
    kinds: [WORKER_KIND],
  });
  if (!run) return null;
  return processStoryScenarioRun(run, {
    ...dependencies,
    runs,
    workerId,
    leaseMs,
  });
}

let workerTimer = null;
let workerRunning = false;

export function startStoryScenarioWorker() {
  if (process.env.STORY_SCENARIO_WORKER_ENABLED === "false" || workerTimer) {
    return workerTimer;
  }
  const intervalMs = Math.max(
    1000,
    Number.parseInt(process.env.STORY_SCENARIO_WORKER_INTERVAL_MS || "2000", 10) || 2000,
  );
  const cycle = async () => {
    if (workerRunning) return;
    workerRunning = true;
    try {
      await runNextStoryScenario();
    } catch (error) {
      console.error("[story-scenario] worker cycle failed", JSON.stringify({
        error: String(error?.message || error),
      }));
    } finally {
      workerRunning = false;
    }
  };
  workerTimer = setInterval(cycle, intervalMs);
  workerTimer.unref?.();
  setTimeout(cycle, 250).unref?.();
  return workerTimer;
}
