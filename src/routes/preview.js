import express from "express";
import { createJob, getJob, updateJob } from "../services/jobStore.js";
import {
  generateQualityCheckedImage,
  IllustrationQualityError,
  outputImagePath,
  targetedVisualRepairPolicy,
} from "../services/imageQualityGate.js";
import { normalizeBookRequest } from "../services/normalizeBookRequest.js";
import { composeBookPagePNG } from "../services/composeBookPagePNG.js";
import { buildNarrativeContext } from "../services/buildNarrativeContext.js";
import { buildSceneContinuity } from "../services/visualContinuity.js";
import {
  ADJACENT_VISUAL_CONTINUITY_VERSION,
  adjacentApprovedIllustrationReferences,
  adjacentContinuityPageNumbers,
} from "../services/adjacentVisualContinuity.js";
import { calculateBookPrice, EBOOK_PAGE_PRICE_EUR, PRINT_PAGE_PRICE_EUR } from "../config/bookOptions.js";

import { intakeAgent } from "../agents/intake.js";
import { heroClassifierAgent } from "../agents/heroClassifier.js";
import { storybrandAgent } from "../agents/storybrand.js";
import { worldBuilderAgent } from "../agents/worldBuilder.js";
import { styleAgent } from "../agents/style.js";
import { blueprintFillerAgent, lockBlueprintContinuity } from "../agents/blueprintFiller.js";
import { blueprintRepairAgent } from "../agents/blueprintRepair.js";
import { qaAgent } from "../agents/qa.js";
import { photoDescriptorAgent } from "../agents/photoDescriptor.js";
import { manuscriptWriterAgent } from "../agents/manuscriptWriter.js";
import { manuscriptEditorAgent, manuscriptReviewFidelityIssues } from "../agents/manuscriptEditor.js";
import { sceneContractImagePrompt, storyScenePlannerAgent } from "../agents/storyScenePlanner.js";
import { deterministicStoryPlanIssues, storyScenePlanAuditAgent } from "../agents/storyScenePlanAudit.js";
import { storySceneTextRepairAgent } from "../agents/storySceneTextRepair.js";
import { createPagePlan } from "../config/bookStructure.js";
import { projectStore } from "../services/projectStore.js";
import { readWooCustomer } from "../services/draftIdentity.js";
import { creditStore, InsufficientCreditError } from "../services/creditStore.js";
import { previewEntitlementsEnabled, previewPriceCents } from "../config/previewPricing.js";
import { persistPreviewAsset } from "../services/previewAssetStorage.js";
import {
  loadReferencePhotoAssets,
  MissingReferencePhotoError,
  referencePhotoDataUrl,
} from "../services/referencePhotoStorage.js";
import {
  generationCheckpoint,
  isReusableDraftPage,
  mergeGenerationCheckpoint,
  PREVIEW_RETRY_POLICY_VERSION,
  previewRequestFingerprint,
  technicalPreviewRetryAvailable,
} from "../services/previewGenerationCheckpoint.js";
import { notifyPreviewMilestone, notifyPreviewReady } from "../services/previewNotification.js";
import { approvedStoryScenario, storyScenarioRequired } from "../services/storyScenario.js";
import { generationRunStore } from "../services/generationRunStore.js";
import {
  childSafetyTextFromQuestionnaire,
  childSafetyResponse,
  guardChildSafety,
} from "../services/childSafety.js";
import { storySensitivityContract } from "../services/storySensitivity.js";
import {
  classifyStoryPlanIssues,
  compileStoryPlan,
  STORY_PLAN_COMPILER_VERSION,
} from "../services/storyPlanCompiler.js";
import { inferAttemptKind, withOpenAICostContext } from "../services/openaiCostContext.js";
import {
  applyManuscriptCorrections,
  manuscriptBatches,
  mergeManuscriptBatch,
} from "../services/manuscriptBatches.js";
import { generationCostPolicy } from "../services/generationCostPolicy.js";
import { createApprovedCoverVisualBible, visualBibleCoverStorageKey } from "../services/visualBible.js";
import { assertManuscriptLanguage } from "../services/bookLanguage.js";
import { narrativeBookSpecForPreview } from "../services/narrativeBookSpecLifecycle.js";
import {
  bindStoryboardPageTexts,
  compileSpecDrivenIllustrationPlan,
  isCurrentSpecDrivenIllustrationPlan,
  storyboardAdjacentHandoffIssues,
  storyboardBindingIssues,
  STORYBOARD_FIRST_CONTRACT_VERSION,
} from "../services/specDrivenIllustrationPlan.js";
import { evaluatePreviewEconomicGovernor } from "../services/previewEconomicGovernor.js";
import { enqueueNarrativeV3ProductionShadow } from "../services/narrativeV3ProductionShadow.js";
import { projectUsesNarrativeV3 } from "../services/narrativeEngineAssignment.js";
import { buildInvariantCounterexampleReport } from "../services/universalInvariantEngine.js";
import { sealNarrativeV3ProductionPreview } from "../services/narrativeV3ProductionRenderingAuthority.js";

const router = express.Router();
const BLUEPRINT_CONTRACT_VERSION = 1;
const STORY_PLAN_FIDELITY_VERSION = 7;
const STORY_PLAN_TARGETED_REPAIR_VERSION = 2;
const STORY_PLAN_TEXT_REPAIR_VERSION = 3;
const MANUSCRIPT_REVIEW_VERSION = 2;
const GENERATION_RUN_LEASE_MS = 5 * 60 * 1000;

function safeProviderResponseCheckpoint(value) {
  return {
    responseId: String(value?.responseId || "").slice(0, 200),
    status: String(value?.status || "").slice(0, 40),
    startedAt: value?.startedAt || null,
    updatedAt: value?.updatedAt || null,
    completedAt: value?.completedAt || null,
  };
}

function generationWorkerId(jobId) {
  return `render:${process.pid}:${jobId}`;
}

async function updateGenerationRun(jobId, patch = {}) {
  return generationRunStore.updateRun(jobId, {
    ...patch,
    heartbeatAt: new Date().toISOString(),
    ...(patch.status === "running" ? {
      leaseOwner: generationWorkerId(jobId),
      leaseExpiresAt: new Date(Date.now() + GENERATION_RUN_LEASE_MS).toISOString(),
    } : {}),
  });
}

function startGenerationRunHeartbeat(jobId) {
  const timer = setInterval(() => {
    generationRunStore.heartbeatRun(jobId, generationWorkerId(jobId), GENERATION_RUN_LEASE_MS)
      .catch((error) => console.error("[preview] durable heartbeat failed", JSON.stringify({
        jobId,
        error: String(error?.message || error),
      })));
  }, 30000);
  timer.unref?.();
  return () => clearInterval(timer);
}

function createImageCandidateRecorder({
  jobId,
  projectId,
  pageNumber = null,
  stepKey,
  assetCache,
}) {
  return async ({
    imageUrl,
    attempt,
    maximumAttempts,
    status,
    rejectionKind = "",
    issues = [],
    warning = false,
    issueCodes = [],
    repairPolicy = null,
    strictEvidence = null,
    providerModel = "",
  }) => {
    const persisted = await persistPreviewAsset({ projectId, assetUrl: imageUrl });
    assetCache.set(imageUrl, persisted);
    const { step } = await generationRunStore.upsertStep(jobId, {
      stepKey,
      stepType: pageNumber == null ? "cover_image" : "page_image",
      status: "running",
      maxAttempts: maximumAttempts,
    });
    await generationRunStore.recordCandidate({
      runId: jobId,
      stepId: step.id,
      projectId,
      pageNumber,
      candidateNumber: attempt,
      status,
      storageKey: persisted.storageKey,
      previewUrl: persisted.previewUrl,
      rejectionKind,
      issues,
      metadata: {
        warning,
        issueCodes: Array.isArray(issueCodes) ? issueCodes : [],
        classifications: (repairPolicy?.classifications || []).map(({ code, severity, confidence }) => ({
          code,
          severity,
          confidence,
        })),
        repairPolicyVersion: repairPolicy?.version || null,
        automaticRepair: repairPolicy?.automaticRepair === true,
        asset: {
          sha256: persisted.sha256,
          mimeType: persisted.mimeType,
          width: persisted.width,
          height: persisted.height,
          byteLength: persisted.byteLength,
        },
        ...(strictEvidence ? { strictEvidence } : {}),
        providerModel: String(providerModel || "gpt-image-2").slice(0, 128),
      },
    });
    await generationRunStore.updateStep(step.id, {
      status: status === "accepted"
        ? "completed"
        : status === "quarantined"
          ? "repair_pending"
          : "running",
      maxAttempts: maximumAttempts,
      diagnostics: {
        rejectionKind,
        issues,
        warning,
        issueCodes: Array.isArray(issueCodes) ? issueCodes : [],
        classifications: (repairPolicy?.classifications || []).map(({ code, severity, confidence }) => ({
          code,
          severity,
          confidence,
        })),
        repairPolicyVersion: repairPolicy?.version || null,
        automaticRepair: repairPolicy?.automaticRepair === true,
      },
      ...(status === "accepted" ? { completedAt: new Date().toISOString() } : {}),
    });
  };
}

async function notifyPreviewMilestoneIfRequested({
  projectId,
  identity,
  event,
  eventId,
  retryAvailable = false,
}) {
  const project = await projectStore.get(projectId);
  const notification = project?.continuitySnapshot?.previewNotification || {};
  if (!project || notification.emailRequested !== true) return false;
  const eventIds = notification.milestoneEventIds || {};
  if (eventIds[event] === eventId) return false;
  await notifyPreviewMilestone({ project, identity, event, eventId, retryAvailable });
  const refreshed = await projectStore.get(projectId);
  const refreshedNotification = refreshed?.continuitySnapshot?.previewNotification || {};
  await projectStore.update(projectId, {
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
          [event]: new Date().toISOString(),
        },
      },
    },
  });
  return true;
}

function previewStaleAfterMs() {
  const minutes = Number.parseInt(process.env.PREVIEW_STALE_MINUTES || "15", 10) || 15;
  return Math.max(5, Math.min(60, minutes)) * 60000;
}

function isActivePreviewJob(job) {
  if (job?.status === "awaiting_visual_approval") return true;
  if (!job || !["queued", "running"].includes(job.status)) return false;
  const updatedAt = Date.parse(job.updatedAt || job.createdAt || "");
  return Number.isFinite(updatedAt) && Date.now() - updatedAt < previewStaleAfterMs();
}

function isActiveDurableRun(run) {
  if (run?.status === "waiting_input") return true;
  if (!run || run.status !== "running") return false;
  const leaseExpiresAt = Date.parse(run.leaseExpiresAt || "");
  return Number.isFinite(leaseExpiresAt) && leaseExpiresAt > Date.now();
}

function reportImageAttempt(jobId, stepPrefix) {
  return ({ phase, attempt, maximumAttempts, error = "", issues = [], model = "", safetyFallback = false }) => {
    const step = `${stepPrefix}:attempt:${attempt}/${maximumAttempts}:${phase}`;
    updateJob(jobId, { step });
    console.info("[preview] image", JSON.stringify({
      jobId,
      step,
      model: model || undefined,
      safetyFallback: safetyFallback || undefined,
      error: error || undefined,
      issues: issues.length ? issues : undefined,
    }));
  };
}

async function recoverAbandonedPreview({ project, identity }) {
  const existingJob = project.generationJobId ? getJob(project.generationJobId) : null;
  const durableRun = project.generationJobId
    ? await generationRunStore.getRun(project.generationJobId).catch(() => null)
    : null;
  if (existingJob && !["done", "failed"].includes(existingJob.status)) {
    updateJob(existingJob.id, { status: "failed", step: "preview:abandoned", error: "Preview generation became unresponsive" });
  }
  if (durableRun && !["completed", "failed", "cancelled"].includes(durableRun.status)) {
    await updateGenerationRun(durableRun.id, {
      status: "failed",
      currentStep: "preview:abandoned",
      errorCode: "preview_interrupted",
      errorMessage: "Preview generation became unresponsive",
      completedAt: new Date().toISOString(),
      leaseOwner: "",
      leaseExpiresAt: null,
    });
  }
  const released = await creditStore.releasePreviewForProject(identity, { projectId: project.id });
  const referenceRecovery = project.continuitySnapshot?.referenceRecovery;
  let continuitySnapshot = referenceRecovery?.consumedAt && !referenceRecovery?.completedAt
    ? { ...project.continuitySnapshot, referenceRecovery: { ...referenceRecovery, available: true, consumedAt: null } }
    : project.continuitySnapshot;
  const checkpoint = generationCheckpoint(project);
  continuitySnapshot = mergeGenerationCheckpoint(continuitySnapshot, {
    ...(checkpoint || {}),
    retryAvailable: true,
    retryExhausted: false,
    failureReason: "preview_interrupted",
    failedAt: new Date().toISOString(),
  });
  const recovered = await projectStore.updateForCustomer(project.id, identity, {
    status: "preview_failed",
    generationJobId: null,
    continuitySnapshot,
  });
  console.warn("[preview] recovered abandoned generation", JSON.stringify({
    projectId: project.id,
    previousJobId: project.generationJobId || null,
    releasedReservations: released?.releasedCount || 0,
  }));
  return recovered || project;
}

router.post("/projects/:id/preview-recover", async (req, res) => {
  let identity;
  try { identity = readWooCustomer(req); }
  catch (error) { return res.status(401).json({ error: String(error?.message || error) }); }
  if (!identity) return res.status(401).json({ error: "Authentication required" });
  const project = await projectStore.getForCustomer(String(req.params.id || ""), identity);
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (project.status !== "preview_generating") {
    return res.json({ recovered: false, status: project.status, retryAvailable: technicalPreviewRetryAvailable(project) });
  }
  if (generationCheckpoint(project)?.visualProof?.status === "awaiting_approval") {
    return res.json({ recovered: false, status: project.status, visualProofRequired: true, retryAvailable: false });
  }
  try {
    const recovered = await recoverAbandonedPreview({ project, identity });
    return res.json({ recovered: true, status: recovered.status, retryAvailable: true });
  } catch (error) {
    return res.status(500).json({ error: `Unable to recover the interrupted preview: ${String(error?.message || error)}` });
  }
});

async function describeReferences({ photos, answers, referenceAssets, jobId }) {
  const canons = [];
  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    updateJob(jobId, { step: `photo:${index + 1}/${photos.length}` });
    const isChild = photo.role === "child";
    const name = photo.name || (isChild ? answers.hero_name : `${photo.role}-${index + 1}`);
    const asset = referenceAssets.get(String(photo.id));
    const photoUrl = referencePhotoDataUrl(asset);
    const result = await photoDescriptorAgent({
      subject_name: name,
      role: photo.role,
      story_role: photo.story_role,
      relationship: photo.relationship,
      age: isChild ? answers.age : "",
      gender: isChild ? answers.gender : "",
      language: answers.language,
      photo_url: photoUrl,
      rendering_mode: answers.rendering_mode,
      likeness_goal: answers.likeness_goal,
    });
    canons.push({
      photoId: photo.id,
      storageKey: photo.storageKey || asset?.storageKey || "",
      name,
      role: photo.role,
      story_role: photo.story_role,
      relationship: photo.relationship,
      outfit_preference: photo.outfit_preference,
      outfit_id: photo.outfit_id,
      outfit_contract: photo.outfit_contract,
      outfit_selection_explicit: photo.outfit_selection_explicit,
      ...result.photo_descriptor,
    });
  }
  return canons;
}

router.post("/preview", async (req, res) => {
  let identity;
  try { identity = readWooCustomer(req); }
  catch (error) { return res.status(401).json({ error: String(error?.message || error) }); }
  if (!identity) return res.status(401).json({ error: "Authentication required" });

  const projectId = String(req.body?.projectId || "");
  if (!projectId) return res.status(400).json({ error: "A saved project is required" });
  let project = await projectStore.getForCustomer(projectId, identity);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const safety = await guardChildSafety({
    text: [
      childSafetyTextFromQuestionnaire(project.questionnaire),
      JSON.stringify(project.continuitySnapshot?.storyScenario || {}),
    ].join("\n"),
    childAge: Number(project.questionnaire?.age),
    locale: project.locale,
    scope: "preview_request",
  }, {
    onTrace: (trace) => console.info("child-safety assessed", trace),
    onError: (error) => console.warn("child-safety deterministic fallback", {
      scope: "preview_request",
      error: String(error?.message || error),
    }),
  });
  if (safety.intervention) {
    return res.status(safety.intervention.status).json(childSafetyResponse(safety.intervention, project.locale));
  }
  const sensitivityContract = storySensitivityContract(project.questionnaire?.story_sensitivity_profile);
  const visualProofAction = String(req.body?.visualProofAction || "");
  const pendingVisualProof = generationCheckpoint(project)?.visualProof;
  if (project.status === "preview_generating") {
    const existingJob = project.generationJobId ? getJob(project.generationJobId) : null;
    const durableRun = project.generationJobId
      ? await generationRunStore.getRun(project.generationJobId).catch(() => null)
      : null;
    if (pendingVisualProof?.status === "awaiting_approval") {
      if (!["approve", "regenerate"].includes(visualProofAction)) {
        return res.status(409).json({
          error: "Approve or regenerate the visual proof before continuing",
          code: "visual_proof_required",
          jobId: existingJob?.id || project.generationJobId || null,
        });
      }
      if (visualProofAction === "regenerate" && Number(pendingVisualProof.attempts || 1) >= 2) {
        return res.status(409).json({ error: "The included visual-proof retry has already been used", code: "visual_proof_limit" });
      }
      if (existingJob && existingJob.status === "awaiting_visual_approval") {
        updateJob(existingJob.id, { status: "done", step: `visual-proof:${visualProofAction}` });
      }
      if (durableRun?.status === "waiting_input") {
        await updateGenerationRun(durableRun.id, {
          status: "completed",
          currentStep: `visual-proof:${visualProofAction}`,
          completedAt: new Date().toISOString(),
          leaseOwner: "",
          leaseExpiresAt: null,
        });
      }
      const visualProof = {
        ...pendingVisualProof,
        status: visualProofAction === "approve" ? "approved" : "regenerating",
        ...(visualProofAction === "approve" ? { approvedAt: new Date().toISOString() } : { regenerationRequestedAt: new Date().toISOString() }),
      };
      const previewResult = visualProofAction === "regenerate"
        ? { ...(project.previewResult || {}), coverImageUrl: "", coverImageStorageKey: "", coverPreviewUrl: "", coverStorageKey: "" }
        : project.previewResult;
      const nextContinuitySnapshot = mergeGenerationCheckpoint(project.continuitySnapshot, {
        ...generationCheckpoint(project),
        visualProof,
      });
      if (visualProofAction === "approve") {
        const visualBible = createApprovedCoverVisualBible({ ...project, previewResult }, visualProof.approvedAt);
        if (visualBible) nextContinuitySnapshot.visualBible = visualBible;
      }
      project = await projectStore.updateForCustomer(projectId, identity, {
        generationJobId: null,
        previewResult,
        continuitySnapshot: nextContinuitySnapshot,
      }) || project;
    } else if (isActiveDurableRun(durableRun) || isActivePreviewJob(existingJob)) {
      return res.json({ jobId: durableRun?.id || existingJob.id, resumed: true });
    } else {
      return res.status(409).json({
        error: "Preview generation was interrupted. Confirm the free technical retry before continuing.",
        code: "preview_interrupted",
      });
    }
  }
  if (project.status === "preview_ready" && project.previewResult) {
    return res.status(409).json({ error: "This draft has already been generated" });
  }

  let normalized;
  try {
    normalized = normalizeBookRequest({ questionnaire: project.questionnaire, photos: project.photoRefs });
  } catch (error) {
    return res.status(400).json({ error: String(error?.message || error) });
  }

  let referenceAssets;
  try {
    referenceAssets = await loadReferencePhotoAssets(normalized.photos);
  } catch (error) {
    if (error instanceof MissingReferencePhotoError) {
      return res.status(409).json({
        error: error.message,
        code: error.code,
        missingPhotoIds: error.missingPhotoIds,
      });
    }
    return res.status(500).json({ error: String(error?.message || error) });
  }

  const referenceRecovery = project.continuitySnapshot?.referenceRecovery;
  const isTechnicalReferenceRecovery = referenceRecovery?.available === true;
  const fingerprint = previewRequestFingerprint(normalized);
  const approvedScenario = approvedStoryScenario(project, fingerprint);
  if (storyScenarioRequired(project) && !approvedScenario) {
    return res.status(409).json({
      error: "Approve the story scenario before generating the book",
      code: "story_scenario_required",
    });
  }
  let narrativeBookSpec = null;
  try {
    narrativeBookSpec = narrativeBookSpecForPreview(project, approvedScenario);
  } catch (error) {
    return res.status(409).json({
      error: String(error?.message || error),
      code: error?.code || "narrative_book_spec_invalid",
    });
  }
  const existingCheckpoint = generationCheckpoint(project, fingerprint);
  const isTechnicalGenerationRetry = technicalPreviewRetryAvailable(project) && Boolean(existingCheckpoint);
  const isTechnicalRetry = isTechnicalReferenceRecovery || isTechnicalGenerationRetry;

  let creditReservation = existingCheckpoint?.creditReservationId ? { id: existingCheckpoint.creditReservationId } : null;
  if (previewEntitlementsEnabled() && !isTechnicalRetry && !creditReservation) {
    const requiredCents = previewPriceCents(normalized.answers.page_count);
    try {
      creditReservation = await creditStore.reservePreview(identity, {
        projectId,
        amountCents: requiredCents,
        idempotencyKey: `preview:${projectId}:${project.updatedAt}`,
      });
    } catch (error) {
      if (error instanceof InsufficientCreditError) {
        return res.status(402).json({
          error: "Insufficient preview credit", code: "insufficient_credit",
          requiredCents: error.requiredCents, balanceCents: error.balanceCents, missingCents: error.missingCents,
          buyCreditsUrl: process.env.WOOCOMMERCE_CREDITS_URL || "",
        });
      }
      return res.status(500).json({ error: String(error?.message || error) });
    }
  }

  if (isTechnicalReferenceRecovery || isTechnicalGenerationRetry) {
    let continuitySnapshot = {
      ...project.continuitySnapshot,
      ...(isTechnicalReferenceRecovery ? { referenceRecovery: {
        ...referenceRecovery,
        available: false,
        consumedAt: new Date().toISOString(),
      } } : {}),
    };
    if (isTechnicalGenerationRetry) {
      continuitySnapshot = mergeGenerationCheckpoint(continuitySnapshot, {
        ...existingCheckpoint,
        retryAvailable: false,
        retryPolicyVersion: PREVIEW_RETRY_POLICY_VERSION,
        retryConsumedAt: new Date().toISOString(),
      });
    }
    project = await projectStore.updateForCustomer(projectId, identity, { continuitySnapshot }) || project;
  }

  const job = createJob({
    status: "running",
    kind: "draft_book",
    creditReservationId: creditReservation?.id || null,
    referencePhotos: normalized.photos,
    projectId,
    productConfiguration: {
      page_count: normalized.answers.page_count,
      product_type: normalized.answers.product_type,
      font_style: normalized.answers.font_style,
      style_id: normalized.answers.style_id,
      rendering_mode: normalized.answers.rendering_mode,
      likeness_goal: normalized.answers.likeness_goal,
      universe_id: normalized.answers.universe_id,
      book_language: normalized.answers.language,
      price_eur: calculateBookPrice(normalized.answers.page_count, normalized.answers.product_type),
      unit_page_price_eur: normalized.answers.product_type === "ebook" ? EBOOK_PAGE_PRICE_EUR : PRINT_PAGE_PRICE_EUR,
      woo_variation_key: `${normalized.answers.product_type}_pages_${normalized.answers.page_count}`,
    },
  });
  try {
    await generationRunStore.createRun({
      id: job.id,
      projectId,
      kind: "preview",
      status: "running",
      currentStep: "started",
      inputFingerprint: fingerprint,
      metadata: {
        creditReservationId: creditReservation?.id || null,
        pageCount: normalized.answers.page_count,
        renderingMode: normalized.answers.rendering_mode,
        styleId: normalized.answers.style_id,
      },
    });
    await updateGenerationRun(job.id, { status: "running", currentStep: "started" });
  } catch (error) {
    updateJob(job.id, { status: "failed", error: String(error?.message || error) });
    if (creditReservation?.id) await creditStore.releasePreview(creditReservation.id).catch(() => null);
    return res.status(503).json({
      error: "The durable generation queue is temporarily unavailable. No credit was used.",
      code: "generation_queue_unavailable",
    });
  }
  const initialCheckpoint = existingCheckpoint || { fingerprint, retryPolicyVersion: PREVIEW_RETRY_POLICY_VERSION };
  let checkpoint = initialCheckpoint;
  const { generationCheckpoint: discardedCheckpoint, ...continuityWithoutOldCheckpoint } = project.continuitySnapshot || {};
  const initialSnapshot = mergeGenerationCheckpoint(existingCheckpoint ? project.continuitySnapshot : continuityWithoutOldCheckpoint, {
    ...initialCheckpoint,
    fingerprint,
    phase: "started",
    creditReservationId: creditReservation?.id || initialCheckpoint.creditReservationId || null,
    failureReason: null,
    failedAt: null,
  });
  try {
    await projectStore.updateForCustomer(projectId, identity, {
      status: "preview_generating",
      generationJobId: job.id,
      continuitySnapshot: initialSnapshot,
      previewResult: existingCheckpoint ? project.previewResult : null,
      finalBlueprint: existingCheckpoint ? project.finalBlueprint : null,
    });
  } catch (error) {
    await updateGenerationRun(job.id, {
      status: "failed",
      errorCode: "project_start_failed",
      errorMessage: String(error?.message || error),
      completedAt: new Date().toISOString(),
      leaseOwner: "",
      leaseExpiresAt: null,
    }).catch(() => null);
    updateJob(job.id, { status: "failed", error: String(error?.message || error) });
    if (creditReservation?.id) await creditStore.releasePreview(creditReservation.id).catch(() => null);
    return res.status(503).json({
      error: "The preview could not be queued safely. No credit was used.",
      code: "generation_queue_unavailable",
    });
  }
  if (!projectUsesNarrativeV3(project)) {
    await enqueueNarrativeV3ProductionShadow({ project, identity }).catch((error) => {
      console.error("[narrative-v3-shadow] enqueue failed", JSON.stringify({
        projectId,
        code: String(error?.code || error?.name || "shadow_enqueue_failed").slice(0, 80),
      }));
    });
  }
  console.info("[preview] started", JSON.stringify({ jobId: job.id, projectId, pageCount: normalized.answers.page_count }));
  res.json({ jobId: job.id });

  withOpenAICostContext({
    projectId,
    runId: job.id,
    workflow: "preview",
    getStage: () => getJob(job.id)?.step || checkpoint?.phase || "preview",
    getAttemptKind: () => inferAttemptKind(getJob(job.id)?.step || checkpoint?.phase),
  }, async () => {
    const stopHeartbeat = startGenerationRunHeartbeat(job.id);
    try {
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const { answers, photos } = normalized;
      const candidateAssetCache = new Map();
      const strictV3Rendering = projectUsesNarrativeV3(project);

      const persistCheckpoint = async (patch, projectPatch = {}) => {
        const latest = await projectStore.get(job.projectId);
        checkpoint = { ...checkpoint, ...patch, fingerprint };
        const persisted = await projectStore.update(job.projectId, {
          ...projectPatch,
          continuitySnapshot: mergeGenerationCheckpoint(latest?.continuitySnapshot || project.continuitySnapshot, checkpoint),
        });
        const stepKey = `checkpoint:${checkpoint.phase || "started"}`;
        const { step } = await generationRunStore.upsertStep(job.id, {
          stepKey,
          stepType: String(checkpoint.phase || "checkpoint").split(":")[0],
          status: "completed",
          maxAttempts: 1,
          inputFingerprint: fingerprint,
          output: { phase: checkpoint.phase || "started" },
        });
        if (step.status !== "completed") {
          await generationRunStore.updateStep(step.id, {
            status: "completed",
            output: { phase: checkpoint.phase || "started" },
            completedAt: new Date().toISOString(),
            leaseOwner: "",
            leaseExpiresAt: null,
          });
        }
        await updateGenerationRun(job.id, {
          status: "running",
          currentStep: checkpoint.phase || "started",
        });
        return persisted;
      };
      const providerBackgroundExecution = {
        async getCheckpoint(stepKey) {
          return checkpoint.storyPlanProviderResponses?.[stepKey] || null;
        },
        async saveCheckpoint(stepKey, providerCheckpoint) {
          const storyPlanProviderResponses = {
            ...(checkpoint.storyPlanProviderResponses || {}),
            [stepKey]: safeProviderResponseCheckpoint(providerCheckpoint),
          };
          await persistCheckpoint({ storyPlanProviderResponses });
        },
      };

      updateJob(job.id, { step: "intake" });
      const intake = checkpoint.intake || await intakeAgent(answers);
      if (!checkpoint.intake) await persistCheckpoint({ intake, phase: "intake" });

      const characterCanons = checkpoint.characterCanons || await describeReferences({ photos, answers, referenceAssets, jobId: job.id });
      updateJob(job.id, { characterCanons });
      if (!checkpoint.characterCanons) await persistCheckpoint({ characterCanons, phase: "references" });

      updateJob(job.id, { step: "heroClassifier" });
      const hero_profile = checkpoint.heroProfile || await heroClassifierAgent(intake);
      if (!checkpoint.heroProfile) await persistCheckpoint({ heroProfile: hero_profile, phase: "hero" });
      updateJob(job.id, { step: "storybrand" });
      const storybrand = checkpoint.storybrand || await storybrandAgent({
        intake,
        hero_profile,
        approvedScenario,
        sensitivityContract,
      });
      if (!checkpoint.storybrand) await persistCheckpoint({ storybrand, phase: "storybrand" });
      updateJob(job.id, { step: "worldBuilder" });
      const world = checkpoint.world || await worldBuilderAgent(intake);
      if (!checkpoint.world) await persistCheckpoint({ world, phase: "world" });
      updateJob(job.id, { step: "style" });
      const style = checkpoint.style || await styleAgent(intake);
      if (!checkpoint.style) await persistCheckpoint({ style, phase: "style" });

      updateJob(job.id, { step: "blueprint" });
      const childCanon = characterCanons.find((canon) => canon.role === "child");
      let final_blueprint = checkpoint.finalBlueprint || await blueprintFillerAgent({
        intake,
        hero_profile,
        storybrand,
        world,
        style,
        heroPhotoId: childCanon?.photoId,
        portraitCanonShort: childCanon?.canon_short || "",
        portraitCanonJson: childCanon?.canon_json || null,
        characterCanons,
        approvedScenario,
        childSafetyContract: safety.contract,
        sensitivityContract,
      }, {
        backgroundExecution: providerBackgroundExecution,
        backgroundStep: `blueprint:v${BLUEPRINT_CONTRACT_VERSION}`,
      });
      if (approvedScenario) final_blueprint.approved_scenario = approvedScenario;

      updateJob(job.id, { step: "qa", final_blueprint });
      let qa = checkpoint.finalBlueprint ? { qa: { status: "approved", issues: [] } } : await qaAgent(final_blueprint);
      const maximumRepairAttempts = 3;
      for (let repairAttempt = 1; qa?.qa?.status !== "approved" && repairAttempt <= maximumRepairAttempts; repairAttempt += 1) {
        updateJob(job.id, {
          step: repairAttempt === 1 ? "qa:repair" : `qa:repair:${repairAttempt}`,
          final_blueprint,
        });
        const repaired = await blueprintRepairAgent({
          finalBlueprint: final_blueprint,
          qa,
          pagePlan: createPagePlan(answers.page_count),
        });
        if (approvedScenario) repaired.approved_scenario = approvedScenario;
        final_blueprint = lockBlueprintContinuity(repaired, {
          heroProfile: hero_profile?.hero_profile || hero_profile || {},
          characterCanons,
          language: answers.language,
          pageCount: answers.page_count,
          fontStyle: answers.font_style,
          approvedScenario,
        });
        updateJob(job.id, {
          step: repairAttempt === 1 ? "qa:verify_repair" : `qa:verify_repair:${repairAttempt}`,
          final_blueprint,
        });
        qa = await qaAgent(final_blueprint);
      }
      if (qa?.qa?.status !== "approved") {
        updateJob(job.id, {
          status: "failed",
          step: "qa",
          error: qa?.qa?.issues?.join(" | ") || "Blueprint QA failed",
        });
        throw new Error(qa?.qa?.issues?.join(" | ") || "Blueprint QA failed");
      }
      if (String(final_blueprint.language || "").toUpperCase() !== String(answers.language || "").toUpperCase()) {
        const languageError = new Error(`Blueprint language ${final_blueprint.language || "missing"} does not match requested book language ${answers.language}`);
        languageError.code = "blueprint_language_mismatch";
        throw languageError;
      }
      if (!checkpoint.finalBlueprint) await persistCheckpoint({ finalBlueprint: final_blueprint, phase: "blueprint" }, { finalBlueprint: final_blueprint });

      let visualStoryboard = null;
      if (narrativeBookSpec) {
        const savedStoryboard = checkpoint.visualStoryboard;
        const savedStoryboardIsCurrent = isCurrentSpecDrivenIllustrationPlan(
          savedStoryboard,
          narrativeBookSpec.validation.artifactDigest,
        );
        if (savedStoryboardIsCurrent) {
          visualStoryboard = savedStoryboard;
        } else {
          visualStoryboard = compileSpecDrivenIllustrationPlan({
            spec: narrativeBookSpec,
            blueprint: final_blueprint,
            pageTexts: checkpoint.draftTexts || {},
            approvedScenario,
          });
          await persistCheckpoint({
            visualStoryboard,
            visualStoryboardVersion: STORYBOARD_FIRST_CONTRACT_VERSION,
            phase: "storyboard:visual-beats",
          });
          console.info("[preview] visual storyboard compiled before manuscript", JSON.stringify({
            jobId: job.id,
            projectId,
            artifactDigest: narrativeBookSpec.validation.artifactDigest.slice(0, 12),
            sceneCount: visualStoryboard.sceneContracts.length,
          }));
        }
      }

      const storyContext = buildNarrativeContext({
        blueprint: final_blueprint,
        intake,
        storybrand,
        approvedScenario,
        narrativeBookSpec,
        childSafetyContract: safety.contract,
        sensitivityContract,
      });
      const draftTextByPage = new Map(Object.entries(checkpoint.draftTexts || {}).map(([page, text]) => [Number(page), text]));
      const batches = manuscriptBatches({
        pages: final_blueprint.pages,
        approvedScenario,
        narrativeBookSpec,
        visualStoryboard,
        heroAge: final_blueprint.hero?.age,
      }).slice(0, generationCostPolicy().manuscript.maximumBatches);
      let previousText = "";
      for (const batch of batches) {
        const missingPages = batch.pages.filter((page) => !draftTextByPage.has(page.page_number));
        if (missingPages.length) {
          updateJob(job.id, { step: `draft:manuscript:act:${batch.act}` });
          const written = await manuscriptWriterAgent({
            language: final_blueprint.language,
            hero: final_blueprint.hero,
            act: batch.act,
            pages: missingPages,
            storyContext,
            previousText,
          }, {
            backgroundExecution: providerBackgroundExecution,
            backgroundStep: `manuscript:act:${batch.act}`,
          });
          mergeManuscriptBatch(draftTextByPage, written, missingPages);
          await persistCheckpoint({
            draftTexts: Object.fromEntries(draftTextByPage),
            phase: `manuscript:act:${batch.act}`,
          });
        }
        const lastPage = batch.pages.at(-1)?.page_number;
        if (lastPage && draftTextByPage.has(lastPage)) previousText = draftTextByPage.get(lastPage);
      }

      if (Number(checkpoint.manuscriptReviewVersion || 0) < MANUSCRIPT_REVIEW_VERSION) {
        updateJob(job.id, { step: "draft:manuscript:language-review" });
        const manuscriptReview = await manuscriptEditorAgent({
          language: final_blueprint.language,
          pages: [...draftTextByPage].map(([page_number, text]) => ({ page_number, text })),
          canonicalCharacters: [
            ...characterCanons,
            { name: final_blueprint.hero?.name, role: "child", relationship: "hero" },
            ...(final_blueprint.cast || []),
          ],
          approvedScenario,
          visualStoryboard,
        }, {
          backgroundExecution: providerBackgroundExecution,
          backgroundStep: "manuscript:language-review",
        });
        const manuscriptCanonicalCharacters = [
          ...characterCanons,
          { name: final_blueprint.hero?.name, role: "child", relationship: "hero" },
          ...(final_blueprint.cast || []),
        ];
        const storyboardNamesByPage = new Map(
          (Array.isArray(visualStoryboard?.sceneContracts) ? visualStoryboard.sceneContracts : [])
            .map((contract) => [
              Number(contract?.text_page_number || 0),
              (Array.isArray(contract?.named_characters) ? contract.named_characters : [])
                .map((character) => String(character?.name || "").trim())
                .filter(Boolean),
            ]),
        );
        applyManuscriptCorrections(
          draftTextByPage,
          manuscriptReview,
          [...draftTextByPage.keys()],
          manuscriptCanonicalCharacters,
          { allowedIntroductionsByPage: storyboardNamesByPage },
        );
        const manuscriptFidelityIssues = manuscriptReviewFidelityIssues(
          manuscriptReview,
          visualStoryboard,
          draftTextByPage,
        );
        if (manuscriptFidelityIssues.length) {
          const fidelityError = new Error(`Manuscript visual fidelity failed: ${manuscriptFidelityIssues.join(" | ")}`);
          fidelityError.code = "manuscript_visual_fidelity_unresolved";
          fidelityError.issues = manuscriptFidelityIssues;
          throw fidelityError;
        }
        await persistCheckpoint({
          draftTexts: Object.fromEntries(draftTextByPage),
          manuscriptReview,
          manuscriptReviewVersion: MANUSCRIPT_REVIEW_VERSION,
          phase: "manuscript:reviewed",
        });
      }

      updateJob(job.id, { step: "story:coherence-and-scene-contracts" });
      const hasCurrentStoryScenePlan = narrativeBookSpec
        ? isCurrentSpecDrivenIllustrationPlan(
          checkpoint.storyScenePlan,
          narrativeBookSpec.validation.artifactDigest,
        )
        : Boolean(checkpoint.storyScenePlan)
          && Number(checkpoint.storyScenePlanFidelityVersion || 0) >= STORY_PLAN_FIDELITY_VERSION;
      let storyScenePlan = hasCurrentStoryScenePlan
        ? checkpoint.storyScenePlan
        : visualStoryboard
          ? bindStoryboardPageTexts(visualStoryboard, Object.fromEntries(draftTextByPage))
          : null;
      if (!storyScenePlan && narrativeBookSpec) {
        storyScenePlan = compileSpecDrivenIllustrationPlan({
          spec: narrativeBookSpec,
          blueprint: final_blueprint,
          pageTexts: Object.fromEntries(draftTextByPage),
          approvedScenario,
        });
        console.info("[preview] spec-driven illustration plan compiled", JSON.stringify({
          jobId: job.id,
          projectId,
          artifactDigest: narrativeBookSpec.validation.artifactDigest.slice(0, 12),
          sceneCount: storyScenePlan.sceneContracts.length,
        }));
      }
      if (!storyScenePlan) {
        const storyScenePlanStartedAt = Date.now();
        console.info("[preview] story scene plan started", JSON.stringify({
          jobId: job.id,
          projectId,
          pageCount: final_blueprint.pages.length,
          spreadCount: final_blueprint.pages.filter((page) => page.page_type === "image").length,
        }));
        const planningInput = {
          blueprint: final_blueprint,
          pageTexts: Object.fromEntries(draftTextByPage),
          characterCanons,
          approvedScenario,
          childSafetyContract: safety.contract,
          sensitivityContract,
        };
        const canonicalStoryCharacters = [
          ...characterCanons,
          { name: final_blueprint.hero?.name, role: "child", relationship: "hero" },
          ...(final_blueprint.cast || []),
        ];
        const storyPlanBackgroundExecution = providerBackgroundExecution;
        const auditCurrentStoryPlan = async ({
          jobStep,
          backgroundStep,
          modelRole = "story_auditor",
        }) => {
          updateJob(job.id, { step: jobStep });
          return storyScenePlanAuditAgent({
            approvedScenario,
            pageTexts: storyScenePlan.pageTexts,
            speechSegmentsByPage: storyScenePlan.speechSegmentsByPage,
            sceneContracts: storyScenePlan.sceneContracts,
            canonicalCharacters: canonicalStoryCharacters,
            language: final_blueprint.language,
          }, {
            backgroundExecution: storyPlanBackgroundExecution,
            backgroundStep,
            modelRole,
          });
        };
        const savedCandidateIsCurrent = Boolean(checkpoint.storyScenePlanCandidate)
          && Number(checkpoint.storyScenePlanCandidateVersion || 0) >= STORY_PLAN_FIDELITY_VERSION;
        storyScenePlan = savedCandidateIsCurrent ? checkpoint.storyScenePlanCandidate : null;
        let candidateAttempt = savedCandidateIsCurrent
          ? Math.max(1, Number(checkpoint.storyScenePlanCandidateAttempt || 1))
          : 0;
        let candidateStage = savedCandidateIsCurrent
          ? String(checkpoint.storyScenePlanCandidateStage || "planner")
          : "";
        let candidateRepairVersion = savedCandidateIsCurrent
          ? Math.max(0, Number(checkpoint.storyScenePlanCandidateRepairVersion || 0))
          : 0;
        let planAudit = { status: "rejected", issues: [] };
        let semanticAuditRejected = false;
        const persistCompiledCandidate = async ({ reason, issues = [] } = {}) => {
          if (!storyScenePlan) return;
          const previousCompilerVersion = Number(storyScenePlan?.compiler?.version || 0);
          storyScenePlan = compileStoryPlan(storyScenePlan, {
            canonicalCharacters: canonicalStoryCharacters,
            heroName: final_blueprint.hero?.name,
            language: final_blueprint.language,
            issues,
          });
          const compiler = storyScenePlan.compiler || {};
          if (Number(compiler.replacements || 0) > 0
            || previousCompilerVersion < STORY_PLAN_COMPILER_VERSION) {
            await persistCheckpoint({
              storyScenePlanCandidate: storyScenePlan,
              storyScenePlanCandidateVersion: STORY_PLAN_FIDELITY_VERSION,
              storyScenePlanCandidateAttempt: candidateAttempt,
              storyScenePlanCandidateStage: candidateStage,
              storyScenePlanCandidateCompilerVersion: STORY_PLAN_COMPILER_VERSION,
            });
          }
          console.info("[preview] story plan compiler", JSON.stringify({
            jobId: job.id,
            projectId,
            reason,
            version: STORY_PLAN_COMPILER_VERSION,
            replacements: Number(compiler.replacements || 0),
            changedPages: compiler.changedPages || [],
            issueCount: issues.length,
          }));
        };
        const applyLocalCompilerIssues = async (audit, reason) => {
          if (audit?.status === "approved") return audit;
          const classified = classifyStoryPlanIssues(audit?.issues || [], {
            canonicalCharacters: canonicalStoryCharacters,
            language: final_blueprint.language,
          });
          if (!classified.autoFixable.length) return audit;
          await persistCompiledCandidate({
            reason,
            issues: classified.autoFixable,
          });
          const unresolvedKeys = new Set(storyScenePlan?.compiler?.unresolvedIssueKeys || []);
          const unresolvedAuto = classified.autoFixable.filter((issue) => (
            unresolvedKeys.has(`${Number(issue?.sceneNumber || 0)}:${issue?.code}`)
          ));
          const localIssues = deterministicStoryPlanIssues({
            approvedScenario,
            pageTexts: storyScenePlan.pageTexts,
            speechSegmentsByPage: storyScenePlan.speechSegmentsByPage,
            sceneContracts: storyScenePlan.sceneContracts,
            canonicalCharacters: canonicalStoryCharacters,
            language: final_blueprint.language,
          });
          const remaining = [...classified.creative, ...unresolvedAuto, ...localIssues]
            .filter((issue, index, all) => all.findIndex((candidate) => (
              Number(candidate?.sceneNumber || 0) === Number(issue?.sceneNumber || 0)
              && String(candidate?.code || "") === String(issue?.code || "")
            )) === index);
          if (!remaining.length) {
            console.info("[preview] story plan compiler resolved audit", JSON.stringify({
              jobId: job.id,
              projectId,
              reason,
              resolvedIssueCount: classified.autoFixable.length,
              modelRetryAvoided: audit?.source === "model",
            }));
            return {
              status: "approved",
              issues: [],
              source: "compiler",
            };
          }
          return {
            status: "rejected",
            issues: remaining,
            source: classified.creative.length ? audit?.source : "deterministic",
          };
        };

        if (storyScenePlan) {
          await persistCompiledCandidate({ reason: "resume-preflight" });
          planAudit = await auditCurrentStoryPlan({
            jobStep: ["targeted", "targeted-plan"].includes(candidateStage)
              ? "story:scenario-fidelity-targeted-recheck"
              : "story:scenario-fidelity-resume",
            backgroundStep: candidateStage === "targeted"
              ? "targeted-recheck"
              : candidateStage === "targeted-plan"
                ? `audit:targeted:v${candidateRepairVersion || 1}`
              : `audit:${candidateAttempt}`,
            modelRole: ["targeted", "targeted-plan"].includes(candidateStage)
              ? "story_repair"
              : "story_auditor",
          });
          planAudit = await applyLocalCompilerIssues(planAudit, "resume-audit");
          semanticAuditRejected = planAudit.status !== "approved"
            && planAudit.source === "model";
        }

        if (!["targeted", "targeted-plan"].includes(candidateStage)) {
          for (
            let attempt = storyScenePlan ? candidateAttempt + 1 : 1;
            (!storyScenePlan || planAudit.status !== "approved")
              && !semanticAuditRejected
              && attempt <= generationCostPolicy().storyPlan.plannerCalls;
            attempt += 1
          ) {
            storyScenePlan = await storyScenePlannerAgent({
              ...planningInput,
              ...(attempt > 1 ? {
                previousPlan: storyScenePlan,
                validationIssues: planAudit.issues,
              } : {}),
            }, {
              backgroundExecution: storyPlanBackgroundExecution,
              backgroundStep: `planner:${attempt}`,
            });
            candidateAttempt = attempt;
            candidateStage = "planner";
            candidateRepairVersion = 0;
            await persistCheckpoint({
              storyScenePlanCandidate: storyScenePlan,
              storyScenePlanCandidateVersion: STORY_PLAN_FIDELITY_VERSION,
              storyScenePlanCandidateAttempt: candidateAttempt,
              storyScenePlanCandidateStage: candidateStage,
              storyScenePlanCandidateRepairVersion: candidateRepairVersion,
              storyScenePlanCandidateCompilerVersion: STORY_PLAN_COMPILER_VERSION,
              phase: `story-plan:candidate:${attempt}`,
            });
            planAudit = await auditCurrentStoryPlan({
              jobStep: attempt === 1
                ? "story:scenario-fidelity-check"
                : "story:scenario-fidelity-recheck",
              backgroundStep: `audit:${attempt}`,
            });
            planAudit = await applyLocalCompilerIssues(planAudit, `planner-audit:${attempt}`);
            if (planAudit.status === "approved") break;
            semanticAuditRejected = planAudit.source === "model";
            console.warn("[preview] story plan contradicts approved scenario", JSON.stringify({
              jobId: job.id,
              projectId,
              attempt,
              issues: planAudit.issues,
            }));
            if (semanticAuditRejected) break;
            if (attempt === 1) updateJob(job.id, { step: "story:scenario-fidelity-repair" });
          }
        }
        const targetedRepairRequiresUpgrade = candidateStage === "targeted-plan"
          && candidateRepairVersion < STORY_PLAN_TARGETED_REPAIR_VERSION;
        if (planAudit.status !== "approved"
          && (candidateStage !== "targeted-plan" || targetedRepairRequiresUpgrade)
          && generationCostPolicy().storyPlan.repairCalls > 0) {
          updateJob(job.id, { step: "story:scenario-fidelity-targeted-repair" });
          storyScenePlan = await storyScenePlannerAgent({
            ...planningInput,
            previousPlan: storyScenePlan,
            validationIssues: planAudit.issues,
          }, {
            backgroundExecution: storyPlanBackgroundExecution,
            backgroundStep: `planner:targeted:v${STORY_PLAN_TARGETED_REPAIR_VERSION}`,
            modelRole: "story_repair",
          });
          candidateAttempt = 3;
          candidateStage = "targeted-plan";
          candidateRepairVersion = STORY_PLAN_TARGETED_REPAIR_VERSION;
          await persistCheckpoint({
            storyScenePlanCandidate: storyScenePlan,
            storyScenePlanCandidateVersion: STORY_PLAN_FIDELITY_VERSION,
            storyScenePlanCandidateAttempt: candidateAttempt,
            storyScenePlanCandidateStage: candidateStage,
            storyScenePlanCandidateRepairVersion: candidateRepairVersion,
            storyScenePlanCandidateCompilerVersion: STORY_PLAN_COMPILER_VERSION,
            phase: "story-plan:targeted-candidate",
          });
          planAudit = await auditCurrentStoryPlan({
            jobStep: "story:scenario-fidelity-targeted-recheck",
            backgroundStep: `audit:targeted:v${STORY_PLAN_TARGETED_REPAIR_VERSION}`,
            modelRole: "story_repair",
          });
          planAudit = await applyLocalCompilerIssues(planAudit, "targeted-audit");
        }
        const targetedTextRepairRequiresUpgrade = planAudit.status !== "approved"
          && candidateStage === "targeted-plan"
          && candidateRepairVersion < STORY_PLAN_TEXT_REPAIR_VERSION;
        if (targetedTextRepairRequiresUpgrade) {
          updateJob(job.id, { step: "story:scenario-fidelity-targeted-text-repair" });
          const repairedText = await storySceneTextRepairAgent({
            approvedScenario,
            pageTexts: storyScenePlan.pageTexts,
            speechSegmentsByPage: storyScenePlan.speechSegmentsByPage,
            sceneContracts: storyScenePlan.sceneContracts,
            issues: planAudit.issues,
            canonicalCharacters: canonicalStoryCharacters,
            language: final_blueprint.language,
          }, {
            backgroundExecution: storyPlanBackgroundExecution,
            backgroundStep: `writer:targeted:v${STORY_PLAN_TEXT_REPAIR_VERSION}`,
          });
          storyScenePlan = compileStoryPlan({
            ...storyScenePlan,
            pageTexts: repairedText.pageTexts,
            speechSegmentsByPage: repairedText.speechSegmentsByPage,
          }, {
            canonicalCharacters: canonicalStoryCharacters,
            heroName: final_blueprint.hero?.name,
            language: final_blueprint.language,
            issues: planAudit.issues,
          });
          candidateRepairVersion = STORY_PLAN_TEXT_REPAIR_VERSION;
          await persistCheckpoint({
            storyScenePlanCandidate: storyScenePlan,
            storyScenePlanCandidateVersion: STORY_PLAN_FIDELITY_VERSION,
            storyScenePlanCandidateAttempt: candidateAttempt,
            storyScenePlanCandidateStage: candidateStage,
            storyScenePlanCandidateRepairVersion: candidateRepairVersion,
            storyScenePlanCandidateCompilerVersion: STORY_PLAN_COMPILER_VERSION,
            phase: "story-plan:targeted-text-candidate",
          });
          planAudit = await auditCurrentStoryPlan({
            jobStep: "story:scenario-fidelity-targeted-text-recheck",
            backgroundStep: `audit:targeted:v${STORY_PLAN_TEXT_REPAIR_VERSION}`,
            modelRole: "story_repair",
          });
          planAudit = await applyLocalCompilerIssues(planAudit, "targeted-text-audit");
        }
        if (planAudit.status !== "approved") {
          throw new Error(`Approved scenario fidelity failed: ${planAudit.issues.map((issue) => `scene-${issue.sceneNumber}: ${issue.explanation}`).join(" | ")}`);
        }
        console.info("[preview] story scene plan completed", JSON.stringify({
          jobId: job.id,
          projectId,
          elapsedMs: Date.now() - storyScenePlanStartedAt,
        }));
      } else {
        console.info("[preview] story scene plan reused", JSON.stringify({ jobId: job.id, projectId }));
      }
      draftTextByPage.clear();
      Object.entries(storyScenePlan.pageTexts || {}).forEach(([pageNumber, text]) => {
        draftTextByPage.set(Number(pageNumber), String(text || ""));
      });
      if (narrativeBookSpec
        && Number(storyScenePlan?.storyboardFirstVersion || 0) >= STORYBOARD_FIRST_CONTRACT_VERSION) {
        const bindingIssues = [
          ...storyboardBindingIssues(
            storyScenePlan,
            Object.fromEntries(draftTextByPage),
            narrativeBookSpec.validation.artifactDigest,
          ),
          ...storyboardAdjacentHandoffIssues(storyScenePlan),
        ];
        if (bindingIssues.length) {
          const invariantCounterexample = buildInvariantCounterexampleReport({
            stage: "storyboard_binding",
            issues: bindingIssues,
            sceneContracts: storyScenePlan.sceneContracts,
          });
          await persistCheckpoint({ invariantCounterexample });
          console.error("[visual-invariant-engine] counterexample", JSON.stringify({
            jobId: job.id,
            projectId,
            fingerprint: invariantCounterexample.fingerprint,
            issueCodes: invariantCounterexample.issueCodes,
            caseCount: invariantCounterexample.cases.length,
          }));
          const bindingError = new Error(`Storyboard binding failed: ${bindingIssues.join(" | ")}`);
          bindingError.code = "storyboard_binding_invalid";
          bindingError.issues = bindingIssues;
          bindingError.invariantCounterexample = invariantCounterexample;
          throw bindingError;
        }
      }
      assertManuscriptLanguage(
        [...draftTextByPage].map(([page_number, text]) => ({ page_number, text })),
        final_blueprint.language,
      );
      const manuscriptSafety = await guardChildSafety({
        text: Object.values(storyScenePlan.pageTexts || {}).join("\n"),
        childAge: Number(project.questionnaire?.age),
        locale: project.locale,
        scope: "generated_manuscript",
      }, {
        onTrace: (trace) => console.info("child-safety assessed", trace),
        onError: (error) => console.warn("child-safety deterministic fallback", {
          scope: "generated_manuscript",
          error: String(error?.message || error),
        }),
      });
      if (manuscriptSafety.intervention) {
        const safetyError = new Error("Generated manuscript did not pass child-safety review");
        safetyError.code = manuscriptSafety.intervention.code;
        throw safetyError;
      }
      for (const contract of storyScenePlan.sceneContracts || []) {
        const imagePage = final_blueprint.pages.find((page) => Number(page.page_number) === Number(contract.image_page_number));
        const textPage = final_blueprint.pages.find((page) => Number(page.page_number) === Number(contract.text_page_number));
        const namedCast = [...new Set((contract.named_characters || []).map((character) => character.name).filter(Boolean))];
        if (imagePage) {
          imagePage.scene_contract = contract;
          imagePage.cast_present = namedCast;
        }
        if (textPage) {
          textPage.scene_contract = contract;
          textPage.cast_present = namedCast;
        }
      }
      if (!hasCurrentStoryScenePlan) {
        await persistCheckpoint({
          storyScenePlan,
          storyScenePlanFidelityVersion: STORY_PLAN_FIDELITY_VERSION,
          storyScenePlanCompilerVersion: STORY_PLAN_COMPILER_VERSION,
          storyScenePlanCandidate: null,
          storyScenePlanCandidateVersion: STORY_PLAN_FIDELITY_VERSION,
          storyScenePlanCandidateAttempt: null,
          storyScenePlanCandidateStage: "",
          storyScenePlanCandidateCompilerVersion: STORY_PLAN_COMPILER_VERSION,
          storyPlanProviderResponses: {},
          visualStoryboard: null,
          visualStoryboardVersion: STORYBOARD_FIRST_CONTRACT_VERSION,
          draftTexts: Object.fromEntries(draftTextByPage),
          finalBlueprint: final_blueprint,
          phase: "scene-contracts",
        }, { finalBlueprint: final_blueprint });
      }
      updateJob(job.id, { step: "draft:cover" });
      const storedProject = await projectStore.get(job.projectId);
      const priorResult = existingCheckpoint ? (storedProject?.previewResult || {}) : {};
      let localCoverImageUrl = "";
      let coverImageUrl = priorResult.coverImageUrl || "";
      let coverImageStorageKey = priorResult.coverImageStorageKey || "";
      let coverPreviewUrl = priorResult.coverPreviewUrl || "";
      let coverStorageKey = priorResult.coverStorageKey || "";
      let generatedCover = false;
      if (!coverImageStorageKey || !coverStorageKey || !coverPreviewUrl) {
        const coverContinuity = buildSceneContinuity({
          blueprint: final_blueprint,
          characterCanons,
          castPresent: final_blueprint.cover.cast_present || [],
          scenePrompt: final_blueprint.cover.image_prompt,
          wardrobeLocks: final_blueprint.cover.wardrobe_locks || [],
          referenceAssets,
        });
        localCoverImageUrl = await generateQualityCheckedImage({
          prompt: final_blueprint.cover.image_prompt,
          outName: `draft-cover-${job.id}`,
          castPresent: final_blueprint.cover.cast_present || [],
          pageLabel: "book cover illustration",
          onAttempt: reportImageAttempt(job.id, "draft:cover"),
          onCandidate: createImageCandidateRecorder({
            jobId: job.id,
            projectId,
            stepKey: "image:cover",
            assetCache: candidateAssetCache,
          }),
          ...coverContinuity,
          size: "1024x1024",
          quality: "medium",
          renderingMode: answers.rendering_mode,
          likenessGoal: answers.likeness_goal,
          model: process.env.DRAFT_IMAGE_MODEL || "gpt-image-2",
        });
        const localCoverPreviewUrl = await composeBookPagePNG({
          baseUrl,
          imageUrl: localCoverImageUrl,
          title: final_blueprint.cover.title,
          outName: `draft-cover-page-${job.id}`,
          pageType: "cover",
          dpi: 150,
        });
        const persistedCoverImage = candidateAssetCache.get(localCoverImageUrl)
          || await persistPreviewAsset({ projectId, assetUrl: localCoverImageUrl });
        const persistedCover = await persistPreviewAsset({ projectId, assetUrl: localCoverPreviewUrl });
        coverImageUrl = persistedCoverImage.previewUrl;
        coverImageStorageKey = persistedCoverImage.storageKey;
        coverPreviewUrl = persistedCover.previewUrl;
        coverStorageKey = persistedCover.storageKey;
        generatedCover = true;
        await persistCheckpoint({ phase: "cover" }, {
          previewResult: { coverImageUrl, coverImageStorageKey, coverPreviewUrl, coverStorageKey, draftPages: priorResult.draftPages || [] },
        });
      }

      if (checkpoint.visualProof?.status !== "approved") {
        const visualProof = {
          status: "awaiting_approval",
          attempts: Number(checkpoint.visualProof?.attempts || 0) + (generatedCover ? 1 : 0),
          styleId: answers.style_id,
          renderingMode: answers.rendering_mode,
          likenessGoal: answers.likeness_goal,
          coverImageUrl,
          coverImageStorageKey,
          coverPreviewUrl,
          coverStorageKey,
          readyAt: new Date().toISOString(),
        };
        const proofResult = { coverImageUrl, coverImageStorageKey, coverPreviewUrl, coverStorageKey, draftPages: priorResult.draftPages || [] };
        await persistCheckpoint({ phase: "visual-proof", visualProof }, { previewResult: proofResult, finalBlueprint: final_blueprint });
        updateJob(job.id, {
          status: "awaiting_visual_approval",
          step: "draft:cover:review",
          final_blueprint,
          result: proofResult,
          visualProof,
        });
        await updateGenerationRun(job.id, {
          status: "waiting_input",
          currentStep: "draft:cover:review",
          metadata: {
            creditReservationId: creditReservation?.id || null,
            pageCount: normalized.answers.page_count,
            visualProof,
          },
          leaseOwner: "",
          leaseExpiresAt: null,
        });
        try {
          await notifyPreviewMilestoneIfRequested({
            projectId,
            identity,
            event: "cover_ready",
            eventId: `${job.id}:cover:${visualProof.attempts}`,
          });
        } catch (notificationError) {
          console.warn("[preview] cover email failed", JSON.stringify({ projectId, error: String(notificationError?.message || notificationError) }));
        }
        console.info("[preview] visual proof awaiting approval", JSON.stringify({ jobId: job.id, projectId, attempts: visualProof.attempts, styleId: answers.style_id }));
        return;
      }

      const draftPages = (priorResult.draftPages || []).filter((page) => (
        isReusableDraftPage(page)
        && (!strictV3Rendering
          || page.page_type !== "image"
          || Number(page.strictEvidenceVersion || 0) === 2)
      ));
      const completedPageNumbers = new Set(draftPages.map((page) => Number(page.page_number)));
      const estimatedInteriorImageUsdMicros = Math.round(
        generationCostPolicy().estimatedInteriorImageUsd * 1_000_000,
      );
      const coverReferencePath = localCoverImageUrl ? outputImagePath(localCoverImageUrl) : "";
      const lockedCoverStorageKey = visualBibleCoverStorageKey(project) || coverImageStorageKey;
      const buildPageVisualRequest = (page) => {
        const pairedTextPage = final_blueprint.pages.find((candidate) => (
          candidate.spread_number === page.spread_number
          && ["text", "opening_text", "closing_text"].includes(candidate.page_type)
        ));
        const pairedText = pairedTextPage ? draftTextByPage.get(pairedTextPage.page_number) || "" : "";
        const adjacentReferenceImages = adjacentApprovedIllustrationReferences({
          blueprintPages: final_blueprint.pages,
          draftPages,
          currentPageNumber: page.page_number,
        });
        const sceneContinuity = buildSceneContinuity({
          blueprint: final_blueprint,
          characterCanons,
          castPresent: page.cast_present || [],
          scenePrompt: page.image_prompt,
          visualState: page.visual_state || {},
          ...(coverReferencePath ? { continuityImagePath: coverReferencePath } : {}),
          ...(!coverReferencePath && lockedCoverStorageKey ? { continuityImageStorageKey: lockedCoverStorageKey } : {}),
          pairedText,
          structuredSceneContract: page.scene_contract || null,
          wardrobeLocks: page.wardrobe_locks || [],
          referenceAssets,
          adjacentReferenceImages,
        });
        const visualPrompt = sceneContractImagePrompt({
          contract: page.scene_contract,
          stylePrompt: final_blueprint.style?.style_prompt || final_blueprint.style?.prompt || "",
          fallbackPrompt: page.image_prompt,
          visualAliases: sceneContinuity.visualAliases,
        });
        return { pairedText, sceneContinuity, visualPrompt, adjacentReferenceImages };
      };
      for (const page of final_blueprint.pages) {
        updateJob(job.id, { step: `draft:page:${page.page_number}` });
        if (completedPageNumbers.has(Number(page.page_number))) {
          updateJob(job.id, { result: { coverImageUrl, coverImageStorageKey, coverPreviewUrl, coverStorageKey, draftPages: [...draftPages] } });
          continue;
        }
        let text = "";
        let imageUrl = "";
        let imageStorageKey = "";
        let localImageUrl = "";
        let qualityStatus = strictV3Rendering ? "strict_accepted" : "accepted";
        let qualityIssues = [];
        let qualityIssueCodes = [];
        let qualityKind = "";
        let qualityRepairPolicy = null;
        let adjacentReferenceImages = [];

        if (["text", "opening_text", "closing_text"].includes(page.page_type)) {
          text = draftTextByPage.get(page.page_number) || "";
        } else if (page.page_type === "image") {
          const visualRequest = buildPageVisualRequest(page);
          const { sceneContinuity, visualPrompt } = visualRequest;
          adjacentReferenceImages = visualRequest.adjacentReferenceImages;
          const remainingRequiredImageCount = final_blueprint.pages.filter((candidate) => (
            candidate.page_type === "image"
            && !completedPageNumbers.has(Number(candidate.page_number))
          )).length;
          const economicDecision = await evaluatePreviewEconomicGovernor(projectId, {
            projection: {
              estimatedMandatoryRemainingUsdMicros: remainingRequiredImageCount
                * estimatedInteriorImageUsdMicros,
              estimatedOptionalRetryUsdMicros: estimatedInteriorImageUsdMicros,
            },
          });
          if (economicDecision.mode !== "normal") {
            console.info("[preview] economic containment", JSON.stringify({
              jobId: job.id,
              projectId,
              pageNumber: page.page_number,
              mode: economicDecision.mode,
              reason: economicDecision.reason,
            }));
          }
          try {
            localImageUrl = await generateQualityCheckedImage({
              prompt: visualPrompt,
              safetyFallbackPrompt: sceneContractImagePrompt({
                contract: page.scene_contract,
                stylePrompt: final_blueprint.style?.style_prompt || final_blueprint.style?.prompt || "",
                fallbackPrompt: page.image_prompt,
                visualAliases: sceneContinuity.visualAliases,
                safetyFallback: true,
              }),
              outName: `draft-page${page.page_number}-${job.id}`,
              castPresent: page.cast_present || [],
              pageLabel: `interior illustration for page ${page.page_number}`,
              onAttempt: reportImageAttempt(job.id, `draft:page:${page.page_number}`),
              onCandidate: createImageCandidateRecorder({
                jobId: job.id,
                projectId,
                pageNumber: page.page_number,
                stepKey: `image:page:${page.page_number}`,
                assetCache: candidateAssetCache,
              }),
              ...sceneContinuity,
              size: "1024x1024",
              quality: "low",
              renderingMode: answers.rendering_mode,
              likenessGoal: answers.likeness_goal,
              model: process.env.DRAFT_IMAGE_MODEL || "gpt-image-2",
              retryRepairableFindings: economicDecision.optionalVisualRetry,
              targetedRepairAvailable: true,
              verifyExactCast: Boolean(sceneContinuity.sceneFidelityContract?.scene_render_contract),
              strictV3EvidenceRequired: strictV3Rendering,
            });
          } catch (error) {
            if (!(error instanceof IllustrationQualityError) || !error.candidateImageUrl) throw error;
            localImageUrl = error.candidateImageUrl;
            qualityStatus = "repair_pending";
            qualityIssues = error.issues;
            qualityKind = error.rejectionKind;
            qualityRepairPolicy = error.repairPolicy
              || targetedVisualRepairPolicy(error.issues, { source: error.rejectionKind });
            qualityIssueCodes = Array.isArray(error.issueCodes) && error.issueCodes.length
              ? error.issueCodes
              : qualityRepairPolicy.targetCodes;
            console.warn("[preview] page quarantined for repair", JSON.stringify({
              jobId: job.id,
              projectId,
              pageNumber: page.page_number,
              rejectionKind: qualityKind,
              issueCodes: qualityRepairPolicy.targetCodes,
              automaticRepair: qualityRepairPolicy.automaticRepair,
            }));
            qualityStatus = qualityRepairPolicy.automaticRepair
              ? "repair_pending"
              : strictV3Rendering
                ? "strict_quarantined"
                : "review_required";
          }
          const persistedImage = candidateAssetCache.get(localImageUrl)
            || await persistPreviewAsset({ projectId, assetUrl: localImageUrl });
          imageUrl = persistedImage.previewUrl;
          imageStorageKey = persistedImage.storageKey;
        }

        const localPreviewUrl = await composeBookPagePNG({
          baseUrl,
          imageUrl: localImageUrl,
          body: text,
          outName: `draft-page${page.page_number}-layout-${job.id}`,
          pageType: page.page_type,
          pageNumber: page.page_number,
          fontStyle: final_blueprint.typography?.id,
          readerAge: final_blueprint.hero?.age,
          dpi: 150,
        });
        const persistedPage = await persistPreviewAsset({ projectId, assetUrl: localPreviewUrl });
        draftPages.push({
          page_number: page.page_number,
          page_type: page.page_type,
          spread_number: page.spread_number,
          story_role: page.story_role,
          text,
          imageUrl,
          imageStorageKey,
          previewUrl: persistedPage.previewUrl,
          storageKey: persistedPage.storageKey,
          ...(page.page_type === "image" ? {
            qualityStatus,
            qualityIssues,
            qualityIssueCodes,
            qualityKind,
            qualityRepairPolicy,
            adjacentVisualContinuityVersion: ADJACENT_VISUAL_CONTINUITY_VERSION,
            adjacentSourcePageNumbers: adjacentContinuityPageNumbers(adjacentReferenceImages),
            ...(qualityStatus === "strict_accepted" ? { strictEvidenceVersion: 2 } : {}),
          } : {}),
        });
        draftPages.sort((left, right) => Number(left.page_number) - Number(right.page_number));
        completedPageNumbers.add(Number(page.page_number));
        const partialResult = { coverImageUrl, coverImageStorageKey, coverPreviewUrl, coverStorageKey, draftPages: [...draftPages] };
        updateJob(job.id, { result: partialResult });
        await persistCheckpoint({ phase: `page:${page.page_number}` }, { previewResult: partialResult, finalBlueprint: final_blueprint });
      }

      const unresolvedQualityPages = draftPages
        .filter((page) => page.page_type === "image"
          && ["review_required", "strict_quarantined"].includes(page.qualityStatus))
        .map((page) => ({
          pageNumber: Number(page.page_number),
          kind: page.qualityKind || "scene",
          issues: page.qualityIssues || [],
          issueCodes: page.qualityIssueCodes || page.qualityRepairPolicy?.remainingIssueCodes || page.qualityRepairPolicy?.targetCodes || [],
        }));
      const pendingRepairPages = draftPages.filter((page) => (
        page.page_type === "image" && page.qualityStatus === "repair_pending"
      ));
      for (const pendingPage of pendingRepairPages) {
        const page = final_blueprint.pages.find((candidate) => (
          Number(candidate.page_number) === Number(pendingPage.page_number)
        ));
        if (!page) continue;
        const stepKey = `repair:page:${page.page_number}`;
        const { step: repairStep } = await generationRunStore.upsertStep(job.id, {
          stepKey,
          stepType: "page_repair",
          status: "running",
          maxAttempts: 1,
          inputFingerprint: fingerprint,
          diagnostics: {
            priorKind: pendingPage.qualityKind || "scene",
            priorIssues: pendingPage.qualityIssues || [],
          },
        });
        updateJob(job.id, { step: `draft:repair:page:${page.page_number}` });
        await updateGenerationRun(job.id, {
          status: "running",
          currentStep: `draft:repair:page:${page.page_number}`,
        });
        const { sceneContinuity, visualPrompt } = buildPageVisualRequest(page);
        const repairPolicy = pendingPage.qualityRepairPolicy
          || targetedVisualRepairPolicy(pendingPage.qualityIssues || [], {
            source: pendingPage.qualityKind || "scene",
          });
        const repairReferences = [
          ...(pendingPage.imageStorageKey ? [{
            kind: "repair_source",
            storageKey: pendingPage.imageStorageKey,
            label: "preserved page candidate; edit only the classified defect",
          }] : []),
          ...(sceneContinuity.referenceImages || []),
        ];
        try {
          const repairedLocalImageUrl = await generateQualityCheckedImage({
            prompt: `${visualPrompt}\n\nFINAL TARGETED IMAGE EDIT (policy V4): edit the preserved candidate instead of redesigning it. Correct only these classified defects: ${(pendingPage.qualityIssues || []).join("; ")}. Preserve the camera, composition, background, lighting, unaffected people, unaffected objects and approved cover medium pixel-for-pixel wherever possible. For a cast or identity correction, do not simply add another person or animal: preserve exactly one complete instance of every required named identity, replace an incorrect identity in place, and remove any accidental duplicate. For a wardrobe correction, change only the affected person's clothing to that person's FIXED OUTFIT FOR CURRENT SCENE and preserve face, body, pose and every other subject. The canonical identity references override the defective preserved candidate for face, hair, species, coat and markings. Do not introduce any other narrative change.`,
            safetyFallbackPrompt: sceneContractImagePrompt({
              contract: page.scene_contract,
              stylePrompt: final_blueprint.style?.style_prompt || final_blueprint.style?.prompt || "",
              fallbackPrompt: page.image_prompt,
              visualAliases: sceneContinuity.visualAliases,
              safetyFallback: true,
            }),
            outName: `draft-page${page.page_number}-repair-${job.id}`,
            castPresent: page.cast_present || [],
            pageLabel: `targeted repair for page ${page.page_number}`,
            maximumAttempts: 1,
            onAttempt: reportImageAttempt(job.id, `draft:repair:page:${page.page_number}`),
            onCandidate: createImageCandidateRecorder({
              jobId: job.id,
              projectId,
              pageNumber: page.page_number,
              stepKey,
              assetCache: candidateAssetCache,
            }),
            ...sceneContinuity,
            referenceImages: repairReferences,
            size: "1024x1024",
            quality: "low",
            renderingMode: answers.rendering_mode,
            likenessGoal: answers.likeness_goal,
            model: process.env.DRAFT_IMAGE_MODEL || "gpt-image-2",
            qualityReviewScope: repairPolicy.targetCodes,
            revisionInstruction: (pendingPage.qualityIssues || []).join("; "),
            strictV3EvidenceRequired: strictV3Rendering,
          });
          const persistedImage = candidateAssetCache.get(repairedLocalImageUrl)
            || await persistPreviewAsset({ projectId, assetUrl: repairedLocalImageUrl });
          const repairedPreviewUrl = await composeBookPagePNG({
            baseUrl,
            imageUrl: repairedLocalImageUrl,
            outName: `draft-page${page.page_number}-repair-layout-${job.id}`,
            pageType: page.page_type,
            pageNumber: page.page_number,
            fontStyle: final_blueprint.typography?.id,
            readerAge: final_blueprint.hero?.age,
            dpi: 150,
          });
          const persistedPage = await persistPreviewAsset({ projectId, assetUrl: repairedPreviewUrl });
          const index = draftPages.findIndex((candidate) => Number(candidate.page_number) === Number(page.page_number));
          draftPages[index] = {
            ...draftPages[index],
            imageUrl: persistedImage.previewUrl,
            imageStorageKey: persistedImage.storageKey,
            previewUrl: persistedPage.previewUrl,
            storageKey: persistedPage.storageKey,
            qualityStatus: "accepted_after_repair",
            qualityIssues: [],
            qualityIssueCodes: [],
            qualityKind: "",
            qualityRepairPolicy: {
              ...repairPolicy,
              outcome: "accepted_after_targeted_edit",
            },
            repairedAt: new Date().toISOString(),
            ...(strictV3Rendering ? { strictEvidenceVersion: 2 } : {}),
          };
          await generationRunStore.updateStep(repairStep.id, {
            status: "completed",
            completedAt: new Date().toISOString(),
            output: {
              pageNumber: page.page_number,
              storageKey: persistedImage.storageKey,
              previewUrl: persistedPage.previewUrl,
            },
          });
          const repairedResult = { coverImageUrl, coverImageStorageKey, coverPreviewUrl, coverStorageKey, draftPages: [...draftPages] };
          updateJob(job.id, { result: repairedResult });
          await persistCheckpoint({ phase: `repair:page:${page.page_number}` }, {
            previewResult: repairedResult,
            finalBlueprint: final_blueprint,
          });
          console.info("[preview] quarantined page repaired", JSON.stringify({
            jobId: job.id,
            projectId,
            pageNumber: page.page_number,
            issueCodes: repairPolicy.targetCodes,
            repairMode: "targeted_image_edit",
          }));
        } catch (error) {
          const qualityError = error instanceof IllustrationQualityError;
          const issues = qualityError
            ? error.issues
            : [`The image provider could not complete the targeted repair: ${String(error?.message || error)}`];
          const index = draftPages.findIndex((candidate) => Number(candidate.page_number) === Number(page.page_number));
          const unresolvedStatus = strictV3Rendering ? "strict_quarantined" : "review_required";
          const unresolvedOutcome = strictV3Rendering
            ? "strict_internal_quarantine"
            : "creator_review_required";
          draftPages[index] = {
            ...draftPages[index],
            qualityStatus: unresolvedStatus,
            qualityIssues: issues,
            qualityIssueCodes: qualityError ? error.issueCodes : repairPolicy.targetCodes,
            qualityKind: qualityError ? error.rejectionKind : "provider",
            qualityRepairPolicy: {
              ...repairPolicy,
              outcome: unresolvedOutcome,
              remainingIssueCodes: qualityError ? error.issueCodes : [],
            },
          };
          unresolvedQualityPages.push({
            pageNumber: Number(page.page_number),
            kind: qualityError ? error.rejectionKind : "provider",
            issues,
            issueCodes: qualityError ? error.issueCodes : repairPolicy.targetCodes,
          });
          await generationRunStore.updateStep(repairStep.id, {
            status: "repair_pending",
            diagnostics: { issues, kind: qualityError ? error.rejectionKind : "provider" },
            errorCode: strictV3Rendering
              ? "narrative_v3_illustration_evidence_incomplete"
              : qualityError
                ? "quality_review_required"
                : "provider_repair_failed",
            errorMessage: issues.join(" | "),
          });
          const reviewResult = { coverImageUrl, coverImageStorageKey, coverPreviewUrl, coverStorageKey, draftPages: [...draftPages] };
          updateJob(job.id, { result: reviewResult });
          await persistCheckpoint({
            phase: strictV3Rendering
              ? `strict-quarantine:page:${page.page_number}`
              : `review:page:${page.page_number}`,
          }, {
            previewResult: reviewResult,
            finalBlueprint: final_blueprint,
          });
          console.warn(strictV3Rendering
            ? "[preview] strict V3 page remains privately quarantined"
            : "[preview] page requires quality review", JSON.stringify({
            jobId: job.id,
            projectId,
            pageNumber: page.page_number,
            kind: qualityError ? error.rejectionKind : "provider",
            issueCodes: qualityError ? error.issueCodes : repairPolicy.targetCodes,
          }));
        }
      }

      if (unresolvedQualityPages.length && strictV3Rendering) {
        const error = new Error(`Strict Narrative V3 kept ${unresolvedQualityPages.length} illustration candidate(s) private because delivery evidence is incomplete.`);
        error.code = "narrative_v3_illustration_evidence_incomplete";
        error.pages = unresolvedQualityPages.map((item) => item.pageNumber);
        console.warn("[preview] strict V3 delivery quarantined", JSON.stringify({
          jobId: job.id,
          projectId,
          pages: error.pages,
        }));
        throw error;
      }

      if (unresolvedQualityPages.length) {
        const reviewResult = { coverImageUrl, coverImageStorageKey, coverPreviewUrl, coverStorageKey, draftPages: [...draftPages] };
        const qualityReview = {
          status: "required",
          pages: unresolvedQualityPages,
          requestedAt: new Date().toISOString(),
        };
        updateJob(job.id, {
          status: "quality_review_required",
          step: "draft:quality-review",
          final_blueprint,
          result: reviewResult,
          qualityReview,
        });
        await updateGenerationRun(job.id, {
          status: "repair_pending",
          currentStep: "draft:quality-review",
          metadata: {
            creditReservationId: creditReservation?.id || null,
            pageCount: normalized.answers.page_count,
            qualityReview,
          },
          leaseOwner: "",
          leaseExpiresAt: null,
        });
        const latest = await projectStore.get(job.projectId);
        await projectStore.update(job.projectId, {
          status: "preview_quality_review",
          finalBlueprint: final_blueprint,
          previewResult: reviewResult,
          generationJobId: job.id,
          continuitySnapshot: mergeGenerationCheckpoint(
            latest?.continuitySnapshot || project.continuitySnapshot,
            {
              ...checkpoint,
              phase: "quality-review",
              qualityReview,
              retryAvailable: false,
              retryExhausted: false,
            },
          ),
        });
        console.warn("[preview] completed with pages awaiting quality review", JSON.stringify({
          jobId: job.id,
          projectId,
          pages: unresolvedQualityPages.map((item) => item.pageNumber),
        }));
        try {
          await notifyPreviewMilestoneIfRequested({
            projectId,
            identity,
            event: "quality_review_required",
            eventId: `${job.id}:quality_review_required`,
            retryAvailable: false,
          });
        } catch (notificationError) {
          console.warn("[preview] quality review email failed", JSON.stringify({
            projectId,
            error: String(notificationError?.message || notificationError),
          }));
        }
        return;
      }

      let narrativeV3Delivery = null;
      if (strictV3Rendering) {
        updateJob(job.id, { step: "draft:v3-delivery-authority" });
        await updateGenerationRun(job.id, {
          status: "running",
          currentStep: "draft:v3-delivery-authority",
        });
        narrativeV3Delivery = await sealNarrativeV3ProductionPreview({
          projectId,
          runId: job.id,
          spec: narrativeBookSpec,
          draftPages,
        });
        console.info("[preview] strict V3 production delivery sealed", JSON.stringify({
          jobId: job.id,
          projectId,
          sceneCount: narrativeV3Delivery.sceneCount,
          artifactDigest: narrativeV3Delivery.artifactDigest.slice(0, 12),
        }));
      }

      updateJob(job.id, {
        status: "done",
        step: "draft:done",
        intake,
        storybrand,
        final_blueprint,
        result: { coverImageUrl, coverImageStorageKey, coverPreviewUrl, coverStorageKey, draftPages },
      });
      await updateGenerationRun(job.id, {
        status: "completed",
        currentStep: "draft:done",
        completedAt: new Date().toISOString(),
        leaseOwner: "",
        leaseExpiresAt: null,
        errorCode: "",
        errorMessage: "",
      });
      if (job.projectId) {
        if (creditReservation?.id) await creditStore.capturePreview(creditReservation.id);
        const latest = await projectStore.get(job.projectId);
        const readyProject = await projectStore.update(job.projectId, {
          status: "preview_ready",
          finalBlueprint: final_blueprint,
          continuitySnapshot: mergeGenerationCheckpoint({
            ...(latest?.continuitySnapshot || project.continuitySnapshot),
            characterCanons,
            ...(narrativeV3Delivery ? { narrativeV3Delivery } : {}),
            ...(isTechnicalReferenceRecovery ? {
              referenceRecovery: {
                ...referenceRecovery,
                available: false,
                completedAt: new Date().toISOString(),
              },
            } : {}),
          }, { ...checkpoint, phase: "done", retryPolicyVersion: PREVIEW_RETRY_POLICY_VERSION, retryAvailable: false, retryExhausted: false, completedAt: new Date().toISOString() }),
          previewResult: { coverImageUrl, coverImageStorageKey, coverPreviewUrl, coverStorageKey, draftPages },
          generationJobId: job.id,
        });
        if (readyProject?.continuitySnapshot?.previewNotification?.emailRequested) {
          try {
            await notifyPreviewReady({ project: readyProject, identity });
            const refreshed = await projectStore.get(job.projectId);
            await projectStore.update(job.projectId, {
              continuitySnapshot: {
                ...refreshed.continuitySnapshot,
                previewNotification: {
                  ...refreshed.continuitySnapshot.previewNotification,
                  sentAt: new Date().toISOString(),
                },
              },
            });
          } catch (notificationError) {
            console.warn("[preview] ready email failed", JSON.stringify({ projectId, error: String(notificationError?.message || notificationError) }));
          }
        }
      }
      console.info("[preview] completed", JSON.stringify({ jobId: job.id, projectId, pageCount: draftPages.length }));
    } catch (error) {
      updateJob(job.id, { status: "failed", error: String(error?.message || error) });
      await updateGenerationRun(job.id, {
        status: "failed",
        currentStep: getJob(job.id)?.step || checkpoint?.phase || "unknown",
        errorCode: "preview_generation_failed",
        errorMessage: String(error?.message || error),
        completedAt: new Date().toISOString(),
        leaseOwner: "",
        leaseExpiresAt: null,
      }).catch(() => null);
      const failedJob = getJob(job.id);
      console.error("[preview] failed", JSON.stringify({
        jobId: job.id,
        projectId,
        step: failedJob?.step || checkpoint?.phase || "unknown",
        checkpointPhase: checkpoint?.phase || null,
        error: String(error?.message || error),
      }));
      if (creditReservation?.id) await creditStore.releasePreview(creditReservation.id).catch(() => null);
      if (job.projectId) {
        const latest = await projectStore.get(job.projectId);
        const priorCheckpoint = generationCheckpoint(latest, fingerprint) || checkpoint;
        const retryWasConsumed = Boolean(priorCheckpoint?.retryConsumedAt || isTechnicalGenerationRetry);
        let continuitySnapshot = {
          ...(latest?.continuitySnapshot || project.continuitySnapshot),
          ...(isTechnicalReferenceRecovery ? {
            referenceRecovery: { ...referenceRecovery, available: true, consumedAt: null },
          } : {}),
        };
        continuitySnapshot = mergeGenerationCheckpoint(continuitySnapshot, {
          ...priorCheckpoint,
          fingerprint,
          retryPolicyVersion: PREVIEW_RETRY_POLICY_VERSION,
          retryAvailable: !retryWasConsumed,
          retryExhausted: retryWasConsumed,
          failureReason: "preview_generation_failed",
          failedAt: new Date().toISOString(),
        });
        await projectStore.update(job.projectId, {
          status: "preview_failed",
          generationJobId: job.id,
          continuitySnapshot,
        });
        try {
          await notifyPreviewMilestoneIfRequested({
            projectId,
            identity,
            event: "generation_failed",
            eventId: `${job.id}:generation_failed`,
            retryAvailable: !retryWasConsumed,
          });
        } catch (notificationError) {
          console.warn("[preview] failure email failed", JSON.stringify({ projectId, error: String(notificationError?.message || notificationError) }));
        }
      }
    } finally {
      stopHeartbeat();
    }
  });
});

export default router;
