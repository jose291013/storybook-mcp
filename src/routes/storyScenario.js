import express from "express";
import { storyScenarioAuditAgent } from "../agents/storyScenarioAudit.js";
import { readWooCustomer } from "../services/draftIdentity.js";
import { generationRunStore } from "../services/generationRunStore.js";
import { normalizeBookRequest } from "../services/normalizeBookRequest.js";
import { previewRequestFingerprint } from "../services/previewGenerationCheckpoint.js";
import { projectStore } from "../services/projectStore.js";
import {
  compileNarrativeV2Shadow,
  narrativeV2ShadowEnabled,
} from "../services/narrativeV2Shadow.js";
import {
  approveNarrativeBookSpec,
  NARRATIVE_V2_PIPELINE_VERSION,
} from "../services/narrativeBookSpecLifecycle.js";
import { narrativeV2RolloutAssignment } from "../services/narrativeV2Rollout.js";
import {
  clarificationAnswersForApproval,
  hasCurrentStoryScenarioAuditEvidence,
  recoverLegacyLifecycleValidation,
  storyScenarioSnapshot,
  validateStoryScenario,
  withStoryScenarioAuditEvidence,
} from "../services/storyScenario.js";
import {
  childSafetyTextFromQuestionnaire,
  childSafetyResponse,
  guardChildSafety,
} from "../services/childSafety.js";
import {
  STORY_SCENARIO_CANONICAL_LIFECYCLE_RECOVERY_VERSION,
  STORY_SCENARIO_REPAIR_TRANSACTION_RECOVERY_VERSION,
  STORY_SCENARIO_RETRY_POLICY_VERSION,
  storyScenarioRepairTransactionRecoveryAvailable,
  technicalStoryScenarioRetryAvailable,
} from "../services/storyScenarioRetry.js";
import { storyScenarioAutomaticRepairAssessment } from "../services/storyScenarioAutoRepair.js";

const router = express.Router();
const EDITABLE_STATUSES = new Set([
  "ready_for_preview",
  "scenario_review",
  "scenario_needs_clarification",
  "scenario_generation_failed",
]);
const MAX_TECHNICAL_ATTEMPTS = 2;
const activeScenarioEnqueues = new Set();

function requireIdentity(req, res) {
  try {
    const identity = readWooCustomer(req);
    if (!identity) res.status(401).json({ error: "Authentication required" });
    return identity;
  } catch (error) {
    res.status(401).json({ error: String(error?.message || error) });
    return null;
  }
}

function safeAnswers(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 5).map(([id, answer]) => [String(id).slice(0, 80), String(answer || "").slice(0, 800)]));
}

function safeSceneEdits(value) {
  return (Array.isArray(value) ? value : []).slice(0, 24).map((edit) => ({
    scene_number: Number(edit?.scene_number || 0),
    ...(Object.hasOwn(edit || {}, "title") ? { title: String(edit?.title || "").slice(0, 160) } : {}),
    ...(Object.hasOwn(edit || {}, "location") ? { location: String(edit?.location || "").slice(0, 240) } : {}),
    ...(Object.hasOwn(edit || {}, "action") ? { action: String(edit?.action || "").slice(0, 1200) } : {}),
    ...(Array.isArray(edit?.character_presences) ? { character_presences: edit.character_presences.slice(0, 30).map((presence) => ({
      name: String(presence?.name || "").slice(0, 120),
      mode: ["physical", "thought", "memory", "voice", "absent"].includes(presence?.mode) ? presence.mode : "absent",
    })).filter((presence) => presence.name) } : {}),
  })).filter((edit) => Number.isInteger(edit.scene_number) && edit.scene_number > 0);
}

function safeAddedCharacters(value) {
  return (Array.isArray(value) ? value : []).slice(0, 10).map((character) => ({
    name: String(character?.name || character || "").trim().slice(0, 120),
  })).filter((character) => character.name);
}

function generationSnapshot(project) {
  return project?.continuitySnapshot?.storyScenarioGeneration || null;
}

function queuedRequest(project, body, safetyContract, retrying, automaticRepair = null) {
  const prior = generationSnapshot(project);
  if (retrying) {
    const transactionRecovery = storyScenarioRepairTransactionRecoveryAvailable(project);
    return {
      ...prior.request,
      safetyContract,
      ...(Number(prior.semanticAuditCheckpoint?.version) === 1
        && (prior.request?.semanticAuditRecovery !== true || transactionRecovery)
        ? {
            semanticAuditRecovery: true,
            semanticAuditCheckpoint: prior.semanticAuditCheckpoint,
            ...(transactionRecovery ? {
              repairTransactionRecoveryVersion: STORY_SCENARIO_REPAIR_TRANSACTION_RECOVERY_VERSION,
            } : {}),
          }
        : {}),
      ...(Number(prior.canonicalCandidateCheckpoint?.version) === 1
        && Number(prior.request?.canonicalLifecycleRecoveryVersion || 0)
          < STORY_SCENARIO_CANONICAL_LIFECYCLE_RECOVERY_VERSION
        ? {
            canonicalCheckpointRecovery: true,
            canonicalCandidateCheckpoint: prior.canonicalCandidateCheckpoint,
            canonicalLifecycleRecoveryVersion: STORY_SCENARIO_CANONICAL_LIFECYCLE_RECOVERY_VERSION,
          }
        : {}),
    };
  }
  const previous = storyScenarioSnapshot(project);
  if (automaticRepair?.available) {
    return {
      creatorClarifications: { ...(previous?.creatorClarifications || {}) },
      sceneEdits: [],
      addedCharacters: [],
      feedback: "",
      safetyContract,
      automaticRepair: true,
      canonicalPassageRecoveryVersion: Number(automaticRepair.recoveryVersion || 0),
      automaticRepairRecoveryVersion: Number(automaticRepair.recoveryVersion || 0),
      automaticRepairPlan: {
        version: 1,
        validation: automaticRepair.validation,
        directives: automaticRepair.directives,
        publicSummary: automaticRepair.publicSummary,
      },
    };
  }
  return {
    creatorClarifications: {
      ...(previous?.creatorClarifications || {}),
      ...safeAnswers(body?.clarifications),
    },
    sceneEdits: safeSceneEdits(body?.sceneEdits),
    addedCharacters: [],
    feedback: String(body?.feedback || "").slice(0, 2000),
    safetyContract,
  };
}

async function enqueueStoryScenario(req, res, { automaticRepair = false } = {}) {
  const identity = requireIdentity(req, res); if (!identity) return;
  if (activeScenarioEnqueues.has(req.params.id)) {
    return res.status(409).json({
      error: "Scenario update already in progress",
      code: "scenario_update_in_progress",
      retryable: true,
    });
  }
  activeScenarioEnqueues.add(req.params.id);
  try {
    const project = await projectStore.getForCustomer(req.params.id, identity);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const activeGeneration = generationSnapshot(project);
    const recoveryCategories = activeGeneration?.automaticRepairFailure?.categories || [];
    // The general metadata recovery is a new policy generation. Older passage-
    // only recovery counters must not consume it for already-open scenarios.
    const recoveryVersion = Number(activeGeneration?.request?.automaticRepairRecoveryVersion || 0);
    const boundedPublicationGateRecovery = automaticRepair
      && activeGeneration?.status === "failed"
      && activeGeneration?.request?.automaticRepair === true
      && activeGeneration?.errorCode === "scenario_auto_repair_unresolved"
      && recoveryVersion < 3
      && recoveryCategories.length > 0
      && recoveryCategories.every((category) => [
        "passage", "progression", "repetition", "emotion", "cast", "travel", "incomplete",
      ].includes(category));
    if (automaticRepair
      && activeGeneration?.status === "failed"
      && activeGeneration?.request?.automaticRepair === true
      && activeGeneration?.errorCode === "scenario_auto_repair_unresolved"
      && !boundedPublicationGateRecovery) {
      return res.status(409).json({
        error: "The bounded automatic repair has already been attempted",
        code: "scenario_auto_repair_exhausted",
        failure: activeGeneration.automaticRepairFailure || {
          version: 1,
          reason: "final_checks_failed",
          categories: ["incomplete"],
          sceneNumbers: [],
        },
      });
    }
    if (project.status === "scenario_generating"
      && activeGeneration?.runId
      && ["queued", "running"].includes(activeGeneration.status)) {
      return res.status(202).json({
        jobId: activeGeneration.runId,
        status: "scenario_generating",
        resumed: true,
      });
    }
    if (!EDITABLE_STATUSES.has(project.status)) {
      return res.status(409).json({ error: "This project can no longer replace its scenario", code: "scenario_locked" });
    }
    const automaticRepairAssessment = automaticRepair
      ? storyScenarioAutomaticRepairAssessment(storyScenarioSnapshot(project))
      : null;
    if (automaticRepair && !automaticRepairAssessment?.available) {
      return res.status(409).json({
        error: "This scenario cannot be repaired automatically",
        code: automaticRepairAssessment?.reason || "scenario_auto_repair_unavailable",
      });
    }
    const requestedRetry = req.body?.retry === true;
    const failedGeneration = generationSnapshot(project);
    const retrying = requestedRetry
      && failedGeneration?.status === "failed"
      && technicalStoryScenarioRetryAvailable(project)
      && Boolean(failedGeneration.request);
    if (requestedRetry
      && failedGeneration?.status === "failed"
      && failedGeneration.request
      && !retrying) {
      const error = new Error("No further automatic scenario retry is available");
      error.statusCode = 409;
      error.code = "scenario_retry_unavailable";
      throw error;
    }
    const priorRequest = retrying ? generationSnapshot(project)?.request : null;
    const requestedAddedCharacters = safeAddedCharacters(
      retrying ? priorRequest?.addedCharacters : req.body?.addedCharacters,
    );
    if (requestedAddedCharacters.length) {
      return res.status(422).json({
        error: "Personalized characters must come from the project's reference photos",
        code: "scenario_character_photo_required",
      });
    }
    const safety = await guardChildSafety({
      text: [
        childSafetyTextFromQuestionnaire(project.questionnaire),
        retrying ? priorRequest?.feedback : req.body?.feedback,
        JSON.stringify(retrying ? priorRequest?.creatorClarifications || {} : req.body?.clarifications || {}),
        JSON.stringify(retrying ? priorRequest?.sceneEdits || [] : req.body?.sceneEdits || []),
      ].filter(Boolean).join("\n"),
      childAge: Number(project.questionnaire?.age),
      locale: project.locale,
      scope: "story_scenario",
    }, {
      onTrace: (trace) => console.info("child-safety assessed", trace),
      onError: (error) => console.warn("child-safety deterministic fallback", {
        scope: "story_scenario",
        error: String(error?.message || error),
      }),
    });
    if (safety.intervention) {
      return res.status(safety.intervention.status).json(childSafetyResponse(safety.intervention, project.locale));
    }
    const normalized = normalizeBookRequest({ questionnaire: project.questionnaire, photos: project.photoRefs });
    const fingerprint = previewRequestFingerprint(normalized);
    const request = queuedRequest(
      project,
      req.body,
      safety.contract,
      retrying,
      automaticRepairAssessment
        ? { ...automaticRepairAssessment, recoveryVersion: boundedPublicationGateRecovery ? 3 : 0 }
        : null,
    );
    const technicalAttempt = retrying
      ? Number(failedGeneration.technicalAttempt || 1) + 1
      : 1;
    const previousProjectStatus = project.status === "scenario_generation_failed"
      ? generationSnapshot(project)?.previousProjectStatus || "ready_for_preview"
      : project.status;
    const { run } = await generationRunStore.createRun({
      projectId: project.id,
      kind: "story_scenario",
      status: "created",
      currentStep: "scenario:created",
      inputFingerprint: fingerprint,
      metadata: {
        requestKind: automaticRepair ? "automatic_repair" : storyScenarioSnapshot(project) ? "revision" : "initial",
        retryOf: retrying ? generationSnapshot(project)?.runId || null : null,
      },
    });
    const queuedAt = new Date().toISOString();
    try {
      await projectStore.updateForCustomer(project.id, identity, {
        status: "scenario_generating",
        generationJobId: run.id,
        continuitySnapshot: {
          ...project.continuitySnapshot,
          storyScenarioGeneration: {
            version: 1,
            retryPolicyVersion: STORY_SCENARIO_RETRY_POLICY_VERSION,
            runId: run.id,
            status: "queued",
            phase: "queued",
            fingerprint,
            previousProjectStatus,
            technicalAttempt,
            maxTechnicalAttempts: MAX_TECHNICAL_ATTEMPTS,
            retryAvailable: false,
            request,
            requestedAt: queuedAt,
            updatedAt: queuedAt,
          },
        },
      });
      await generationRunStore.updateRun(run.id, {
        status: "queued",
        currentStep: "scenario:queued",
      });
    } catch (error) {
      const failedAt = new Date().toISOString();
      await generationRunStore.updateRun(run.id, {
        status: "failed",
        currentStep: "scenario:queue_failed",
        errorCode: "scenario_queue_failed",
        errorMessage: "The scenario could not be queued safely.",
        completedAt: failedAt,
      }).catch(() => null);
      const latest = await projectStore.getForCustomer(project.id, identity).catch(() => null);
      if (latest?.continuitySnapshot?.storyScenarioGeneration?.runId === run.id) {
        await projectStore.updateForCustomer(project.id, identity, {
          status: ["scenario_review", "scenario_needs_clarification"].includes(previousProjectStatus)
            ? previousProjectStatus
            : "scenario_generation_failed",
          generationJobId: run.id,
          continuitySnapshot: {
            ...latest.continuitySnapshot,
            storyScenarioGeneration: {
              ...latest.continuitySnapshot.storyScenarioGeneration,
              status: "failed",
              phase: "queue_failed",
              errorCode: "scenario_queue_failed",
              retryAvailable: technicalAttempt < MAX_TECHNICAL_ATTEMPTS,
              retryExhausted: technicalAttempt >= MAX_TECHNICAL_ATTEMPTS,
              failedAt,
              updatedAt: failedAt,
            },
          },
        }).catch(() => null);
      }
      throw error;
    }
    console.info("[story-scenario] queued", JSON.stringify({
      runId: run.id,
      projectId: project.id,
      requestKind: automaticRepair ? "automatic_repair" : storyScenarioSnapshot(project) ? "revision" : "initial",
      retrying,
    }));
    res.set("Cache-Control", "private, no-store");
    return res.status(202).json({
      jobId: run.id,
      status: "scenario_generating",
      retrying,
    });
  } catch (error) {
    console.error("[story-scenario] enqueue failed", JSON.stringify({
      projectId: req.params.id,
      code: error?.code || "scenario_enqueue_failed",
      error: String(error?.message || error),
    }));
    res.status(error?.statusCode || 500).json({
      error: String(error?.message || error),
      code: error?.code || "scenario_enqueue_failed",
    });
  } finally {
    activeScenarioEnqueues.delete(req.params.id);
  }
}

router.post("/projects/:id/story-scenario", (req, res) => enqueueStoryScenario(req, res));
router.post("/projects/:id/story-scenario/auto-repair", (req, res) => (
  enqueueStoryScenario(req, res, { automaticRepair: true })
));

router.post("/projects/:id/story-scenario/revalidate", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const project = await projectStore.getForCustomer(req.params.id, identity);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!["scenario_review", "scenario_needs_clarification"].includes(project.status)) {
      return res.status(409).json({ error: "This scenario cannot be revalidated", code: "scenario_locked" });
    }
    const current = storyScenarioSnapshot(project);
    const repaired = recoverLegacyLifecycleValidation(current);
    if (!repaired) {
      res.set("Cache-Control", "private, no-store");
      return res.json({ repaired: false, scenario: current, status: project.status });
    }
    const status = repaired.status === "needs_clarification"
      ? "scenario_needs_clarification"
      : "scenario_review";
    await projectStore.updateForCustomer(project.id, identity, {
      status,
      continuitySnapshot: {
        ...project.continuitySnapshot,
        storyScenario: repaired,
      },
    });
    console.info("[story-scenario] legacy validation repaired", JSON.stringify({
      projectId: project.id,
      repair: repaired.validation.repairedFrom,
    }));
    res.set("Cache-Control", "private, no-store");
    return res.json({ repaired: true, scenario: repaired, status });
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error), code: "scenario_revalidation_failed" });
  }
});

router.post("/projects/:id/story-scenario/approve", async (req, res) => {
  const identity = requireIdentity(req, res); if (!identity) return;
  try {
    const project = await projectStore.getForCustomer(req.params.id, identity);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const safety = await guardChildSafety({
      text: [
        childSafetyTextFromQuestionnaire(project.questionnaire),
        JSON.stringify(project.continuitySnapshot?.storyScenario || {}),
      ].join("\n"),
      childAge: Number(project.questionnaire?.age),
      locale: project.locale,
      scope: "story_scenario_approval",
    }, {
      onTrace: (trace) => console.info("child-safety assessed", trace),
      onError: (error) => console.warn("child-safety deterministic fallback", {
        scope: "story_scenario_approval",
        error: String(error?.message || error),
      }),
    });
    if (safety.intervention) {
      return res.status(safety.intervention.status).json(childSafetyResponse(safety.intervention, project.locale));
    }
    const normalized = normalizeBookRequest({ questionnaire: project.questionnaire, photos: project.photoRefs });
    const fingerprint = previewRequestFingerprint(normalized);
    let scenario = storyScenarioSnapshot(project);
    if (!scenario || scenario.fingerprint !== fingerprint) {
      return res.status(409).json({ error: "The scenario no longer matches this project", code: "scenario_stale" });
    }
    let validation = validateStoryScenario(scenario);
    if (validation.valid && hasCurrentStoryScenarioAuditEvidence(scenario)) {
      console.info("[story-scenario] approval reused final audit", { projectId: project.id });
    } else if (validation.valid) {
      const audit = await storyScenarioAuditAgent({ intake: normalized.answers, scenario });
      validation = {
        valid: audit.status === "approved",
        issues: audit.issues.map((issue) => `${issue.sceneNumber ? `scene-${issue.sceneNumber}: ` : ""}${issue.code}: ${issue.explanation}`),
        diagnostics: audit.issues,
      };
      if (validation.valid) scenario = withStoryScenarioAuditEvidence(scenario);
    }
    if (!validation.valid) {
      console.warn("[story-scenario] approval validation failed", { projectId: project.id, issueCount: validation.issues.length });
      return res.status(422).json({
        error: "The scenario did not pass Calitiki's internal publication gate",
        code: "scenario_quality_gate_unresolved",
        retryable: true,
      });
    }
    const clarificationAnswers = clarificationAnswersForApproval(scenario);
    if (clarificationAnswers === null) {
      return res.status(409).json({ error: "Answer the scenario questions before approval", code: "scenario_clarification_required" });
    }
    const approved = {
      ...scenario,
      clarifications: [],
      creatorClarifications: { ...(scenario.creatorClarifications || {}), ...clarificationAnswers },
      status: "approved",
      validation,
      approvedAt: new Date().toISOString(),
    };
    const continuitySnapshot = { ...project.continuitySnapshot, storyScenario: approved };
    const narrativeV2Rollout = narrativeV2RolloutAssignment(project);
    continuitySnapshot.narrativeV2Rollout = narrativeV2Rollout;
    if (Number(approved.version) === 2 && narrativeV2Rollout.enabled) {
      const narrativeBookSpec = approveNarrativeBookSpec({ project, scenario: approved });
      const candidateDigest = project.continuitySnapshot?.narrativeV2Candidate?.artifactDigest;
      if (candidateDigest && candidateDigest !== narrativeBookSpec.validation.artifactDigest) {
        const error = new Error("The approved narrative contract changed after its canonical gate");
        error.code = "narrative_book_spec_candidate_mismatch";
        throw error;
      }
      continuitySnapshot.narrativeV2PipelineVersion = NARRATIVE_V2_PIPELINE_VERSION;
      continuitySnapshot.narrativeBookSpec = narrativeBookSpec;
      console.info("[narrative-v2] approved canonical contract", JSON.stringify({
        projectId: project.id,
        rolloutMode: narrativeV2Rollout.mode,
        rolloutBucket: narrativeV2Rollout.bucket,
        artifactDigest: narrativeBookSpec.validation.artifactDigest.slice(0, 12),
        sceneCount: narrativeBookSpec.scenes.length,
      }));
    } else {
      console.info("[narrative-v2] legacy downstream assigned", JSON.stringify({
        projectId: project.id,
        rolloutMode: narrativeV2Rollout.mode,
        rolloutBucket: narrativeV2Rollout.bucket,
      }));
    }
    if (narrativeV2ShadowEnabled(project.id)) {
      const shadow = compileNarrativeV2Shadow({ project, scenario: approved });
      continuitySnapshot.narrativeV2Shadow = shadow;
      console.info("[narrative-v2-shadow] compiled", JSON.stringify({
        projectId: project.id,
        status: shadow.status,
        artifactDigest: shadow.artifactDigest?.slice(0, 12) || "",
        issueCodes: (shadow.issues || []).map((issue) => issue.code),
      }));
    }
    await projectStore.updateForCustomer(project.id, identity, { status: "ready_for_preview", continuitySnapshot });
    res.set("Cache-Control", "private, no-store");
    res.json({ scenario: approved, status: "ready_for_preview" });
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

export default router;
