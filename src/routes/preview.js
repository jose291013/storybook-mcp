import express from "express";
import { createJob, getJob, updateJob } from "../services/jobStore.js";
import {
  generateQualityCheckedImage,
  IMAGE_SAFETY_FALLBACK_STAGES,
  IllustrationQualityError,
  IllustrationSafetyQuarantineError,
  outputImagePath,
  strictV3WardrobeRepairDirective,
  targetedVisualRepairPolicy,
} from "../services/imageQualityGate.js";
import { normalizeBookRequest } from "../services/normalizeBookRequest.js";
import { composeBookPagePNG } from "../services/composeBookPagePNG.js";
import { buildNarrativeContext } from "../services/buildNarrativeContext.js";
import { buildSceneContinuity } from "../services/visualContinuity.js";
import { generateImage } from "../services/imageRunner.js";
import {
  acceptedWardrobeAuthorityAssets,
  assertWardrobeVisualAuthorityCoverage,
  assertWardrobeVisualAuthoritySatisfiability,
  compileWardrobeVisualAuthorityPlan,
  directWardrobeAuthorityAsset,
  inspectWardrobeVisualAuthority,
  wardrobeAuthorityPrompt,
  wardrobeRepairReferencePlan,
  wardrobeVisualReferencesForScene,
  WARDROBE_VISUAL_AUTHORITY_POLICY_VERSION,
  WARDROBE_VISUAL_AUTHORITY_VERSION,
} from "../services/wardrobeVisualAuthorityV1.js";
import {
  ADJACENT_VISUAL_CONTINUITY_VERSION,
  adjacentApprovedIllustrationReferences,
  adjacentContinuityPageNumbers,
} from "../services/adjacentVisualContinuity.js";
import { findBookFormat } from "../config/bookFormats.js";
import { existingBookProductContract } from "../services/bookProductContract.js";

import { intakeAgent } from "../agents/intake.js";
import { heroClassifierAgent } from "../agents/heroClassifier.js";
import { storybrandAgent } from "../agents/storybrand.js";
import { worldBuilderAgent } from "../agents/worldBuilder.js";
import { styleAgent } from "../agents/style.js";
import { blueprintFillerAgent, lockBlueprintContinuity } from "../agents/blueprintFiller.js";
import { blueprintRepairAgent } from "../agents/blueprintRepair.js";
import { qaAgent } from "../agents/qa.js";
import {
  blueprintQaCheckpoint,
  tagBlueprintProviderInterruption,
} from "../services/blueprintQaCheckpoint.js";
import {
  isProviderBillingUnavailable,
  tagProviderBillingUnavailable,
} from "../services/providerBillingError.js";
import { photoDescriptorAgent } from "../agents/photoDescriptor.js";
import { manuscriptWriterAgent } from "../agents/manuscriptWriter.js";
import { manuscriptEditorAgent, manuscriptReviewFidelityIssues } from "../agents/manuscriptEditor.js";
import { manuscriptPreflightNormalizerAgent } from "../agents/manuscriptPreflightNormalizer.js";
import { manuscriptSceneCastNormalizerAgent } from "../agents/manuscriptSceneCastNormalizer.js";
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
  mergeGenerationCheckpoint,
  PREVIEW_RETRY_POLICY_VERSION,
  previewRequestFingerprint,
  previewRequestFingerprintCandidates,
  technicalPreviewRetryAvailable,
} from "../services/previewGenerationCheckpoint.js";
import {
  partitionPreviewDraftPages,
  strictPageIssueCodes,
  upsertPreviewDraftPage,
} from "../services/previewPageRecovery.js";
import {
  buildPreviewCausalRecovery,
  causalRecoveryPrompt,
  causalRecoveryReferences,
  consumePreviewCausalRecovery,
  PREVIEW_CAUSAL_RECOVERY_VERSION,
  previewCausalRecoveryPage,
} from "../services/previewCausalRecovery.js";
import { notifyPreviewMilestone, notifyPreviewReady } from "../services/previewNotification.js";
import { startTemporaryPreviewAccess } from "../services/temporaryPreviewAccess.js";
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
import {
  prepareNarrativeV3ProductionTextAuthority,
  sealNarrativeV3ProductionPreview,
} from "../services/narrativeV3ProductionRenderingAuthority.js";
import {
  MANUSCRIPT_WORD_PREFLIGHT_VERSION,
  manuscriptWordRepairRequestPages,
  normalizeManuscriptWordTargets,
} from "../services/manuscriptWordPreflight.js";
import {
  MANUSCRIPT_SCENE_CAST_PREFLIGHT_VERSION,
  normalizeManuscriptSceneCast,
} from "../services/manuscriptSceneCastPreflight.js";

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
  return ({
    phase,
    attempt,
    maximumAttempts,
    error = "",
    issues = [],
    model = "",
    safetyFallback = false,
    safetyFallbackStage = "",
    referencePolicyStage = "",
    referenceKinds = [],
    wardrobeDiagnostics = null,
  }) => {
    const step = `${stepPrefix}:attempt:${attempt}/${maximumAttempts}:${phase}`;
    updateJob(jobId, { step });
    console.info("[preview] image", JSON.stringify({
      jobId,
      step,
      model: model || undefined,
      safetyFallback: safetyFallback || undefined,
      safetyFallbackStage: safetyFallbackStage || undefined,
      referencePolicyStage: referencePolicyStage || undefined,
      referenceKinds: referenceKinds.length ? referenceKinds : undefined,
      wardrobeDiagnostics: wardrobeDiagnostics || undefined,
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
  const fingerprintCandidates = previewRequestFingerprintCandidates(normalized);
  const approvedScenario = approvedStoryScenario(project, fingerprintCandidates);
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
  // Once a scenario is approved its fingerprint remains the immutable resume
  // authority. The first candidate is used only for projects without the
  // scenario workflow. This keeps legacy checkpoints reusable without making
  // a changed non-empty answer compatible.
  const fingerprint = approvedScenario?.fingerprint || fingerprintCandidates[0] || previewRequestFingerprint(normalized);
  const existingCheckpoint = generationCheckpoint(project, fingerprint);
  const storedCausalRecovery = existingCheckpoint?.causalRecovery || null;
  // A retry-policy bump must not consume its one resume merely to carry an
  // obsolete recovery document forward. Recompile the current blocker set
  // before this run so the new causal strategy is used immediately.
  const preparedCausalRecovery = storedCausalRecovery?.version === PREVIEW_CAUSAL_RECOVERY_VERSION
    ? storedCausalRecovery
    : buildPreviewCausalRecovery({
        previewResult: project.previewResult || {},
        priorRecovery: storedCausalRecovery,
      });
  const isTechnicalGenerationRetry = Boolean(existingCheckpoint)
    && (technicalPreviewRetryAvailable(project) || preparedCausalRecovery?.available === true);
  const causalRecoveryRun = isTechnicalGenerationRetry && preparedCausalRecovery?.available === true
    ? consumePreviewCausalRecovery(preparedCausalRecovery)
    : null;
  const isTechnicalRetry = isTechnicalReferenceRecovery || isTechnicalGenerationRetry;
  const productContract = existingBookProductContract({
    questionnaire: normalized.answers,
    productConfiguration: project.productConfiguration,
  });

  let creditReservation = existingCheckpoint?.creditReservationId ? { id: existingCheckpoint.creditReservationId } : null;
  if (previewEntitlementsEnabled() && !isTechnicalRetry && !creditReservation) {
    const requiredCents = previewPriceCents(normalized.answers.page_count, productContract.pricingVersion);
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
        ...(causalRecoveryRun ? { causalRecovery: causalRecoveryRun } : {}),
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
      book_format_id: productContract.bookFormatId,
      pricing_version: productContract.pricingVersion,
      price_eur: productContract.priceEur,
      unit_page_price_eur: productContract.unitPagePriceEur,
      generation_pricing_version: productContract.generationPricingVersion,
      generation_unit_page_price_eur: productContract.generationUnitPagePriceEur,
      generation_price_eur: productContract.generationPriceEur,
      interactive_reader_included: productContract.interactiveReaderIncluded,
      temporary_interactive_preview_included: productContract.temporaryInteractivePreviewIncluded,
      preview_access_duration_hours: productContract.previewAccessDurationHours,
      purchase_credit_cents: productContract.purchaseCreditCents,
      permanent_digital_purchase_includes_interactive_reader: productContract.permanentDigitalPurchaseIncludesInteractiveReader,
      permanent_digital_purchase_includes_pdf: productContract.permanentDigitalPurchaseIncludesPdf,
      ebook_included_in_generation: productContract.ebookIncludedInGeneration,
      woo_variation_key: productContract.wooVariationKey,
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
  const initialCheckpoint = existingCheckpoint
    ? {
        ...existingCheckpoint,
        ...(causalRecoveryRun ? { causalRecovery: causalRecoveryRun } : {}),
      }
    : { fingerprint, retryPolicyVersion: PREVIEW_RETRY_POLICY_VERSION };
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
      const runDurableBlueprintStep = async ({ step, artifactType, attempt = 0, qaEvidence = null, action }) => {
        try {
          return await action();
        } catch (error) {
          const taggedError = tagBlueprintProviderInterruption(error, artifactType);
          if (taggedError?.code === "preview_interrupted") {
            await persistCheckpoint({
              blueprintQaRepair: blueprintQaCheckpoint({
                status: "interrupted",
                attempt,
                qa: qaEvidence,
              }),
              phase: step,
            }).catch(() => null);
            console.warn("[preview] durable blueprint step interrupted", JSON.stringify({
              jobId: job.id,
              projectId,
              step,
              artifactType,
            }));
          }
          throw taggedError;
        }
      };
      let qa = checkpoint.finalBlueprint
        ? { qa: { status: "approved", issues: [] } }
        : await runDurableBlueprintStep({
          step: "blueprint:qa:initial",
          artifactType: "blueprint_qa",
          action: () => qaAgent(final_blueprint, {
            backgroundExecution: providerBackgroundExecution,
            backgroundStep: `blueprint:qa:v${BLUEPRINT_CONTRACT_VERSION}:initial`,
          }),
        });
      if (!checkpoint.finalBlueprint) {
        await persistCheckpoint({
          blueprintQaRepair: blueprintQaCheckpoint({
            status: qa?.qa?.status === "approved" ? "approved" : "repair_needed",
            qa,
          }),
          phase: "blueprint:qa:initial",
        });
      }
      const maximumRepairAttempts = 3;
      for (let repairAttempt = 1; qa?.qa?.status !== "approved" && repairAttempt <= maximumRepairAttempts; repairAttempt += 1) {
        updateJob(job.id, {
          step: repairAttempt === 1 ? "qa:repair" : `qa:repair:${repairAttempt}`,
          final_blueprint,
        });
        const repairPhase = `blueprint:qa-repair:${repairAttempt}`;
        const repairCheckpoint = blueprintQaCheckpoint({ status: "repairing", attempt: repairAttempt, qa });
        await persistCheckpoint({
          blueprintQaRepair: repairCheckpoint,
          phase: repairPhase,
        });
        console.info("[preview] durable blueprint repair queued", JSON.stringify({
          jobId: job.id,
          projectId,
          attempt: repairAttempt,
          issueCodes: repairCheckpoint.issueCodes,
        }));
        const repaired = await runDurableBlueprintStep({
          step: repairPhase,
          artifactType: "blueprint_repair",
          attempt: repairAttempt,
          qaEvidence: qa,
          action: () => blueprintRepairAgent({
            finalBlueprint: final_blueprint,
            qa,
            pagePlan: createPagePlan(answers.page_count),
          }, {
            backgroundExecution: providerBackgroundExecution,
            backgroundStep: `blueprint:repair:v${BLUEPRINT_CONTRACT_VERSION}:attempt:${repairAttempt}`,
          }),
        });
        if (approvedScenario) repaired.approved_scenario = approvedScenario;
        final_blueprint = lockBlueprintContinuity(repaired, {
          heroProfile: hero_profile?.hero_profile || hero_profile || {},
          characterCanons,
          language: answers.language,
          pageCount: answers.page_count,
          fontStyle: answers.font_style,
          bookFormatId: answers.book_format_id,
          approvedScenario,
        });
        updateJob(job.id, {
          step: repairAttempt === 1 ? "qa:verify_repair" : `qa:verify_repair:${repairAttempt}`,
          final_blueprint,
        });
        qa = await runDurableBlueprintStep({
          step: `blueprint:qa-verify:${repairAttempt}`,
          artifactType: "blueprint_qa",
          attempt: repairAttempt,
          qaEvidence: qa,
          action: () => qaAgent(final_blueprint, {
            backgroundExecution: providerBackgroundExecution,
            backgroundStep: `blueprint:qa:v${BLUEPRINT_CONTRACT_VERSION}:verify:${repairAttempt}`,
          }),
        });
        await persistCheckpoint({
          blueprintQaRepair: blueprintQaCheckpoint({
            status: qa?.qa?.status === "approved" ? "approved" : "repair_needed",
            attempt: repairAttempt,
            qa,
          }),
          phase: `blueprint:qa-verify:${repairAttempt}`,
        });
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
      if (strictV3Rendering) {
        const normalizedSceneCast = await normalizeManuscriptSceneCast({
          spec: narrativeBookSpec,
          pageTexts: Object.fromEntries(draftTextByPage),
          storyScenePlan,
          repair: async ({ attempt, pages, priorFailure }) => {
            updateJob(job.id, { step: `draft:manuscript:scene-cast-preflight:${attempt}` });
            await updateGenerationRun(job.id, {
              status: "running",
              currentStep: `draft:manuscript:scene-cast-preflight:${attempt}`,
            });
            return manuscriptSceneCastNormalizerAgent({
              language: final_blueprint.language,
              pages,
              priorFailure,
            }, {
              backgroundExecution: providerBackgroundExecution,
              backgroundStep: `manuscript:scene-cast-preflight:v${MANUSCRIPT_SCENE_CAST_PREFLIGHT_VERSION}:attempt:${attempt}`,
            });
          },
        });
        if (normalizedSceneCast.changed) {
          draftTextByPage.clear();
          Object.entries(normalizedSceneCast.pageTexts).forEach(([pageNumber, text]) => {
            draftTextByPage.set(Number(pageNumber), String(text || ""));
          });
          storyScenePlan = bindStoryboardPageTexts(storyScenePlan, normalizedSceneCast.pageTexts);
        }
        if (normalizedSceneCast.changed
          || Number(checkpoint.manuscriptSceneCastPreflightVersion || 0) < MANUSCRIPT_SCENE_CAST_PREFLIGHT_VERSION) {
          await persistCheckpoint({
            draftTexts: Object.fromEntries(draftTextByPage),
            storyScenePlan,
            manuscriptSceneCastPreflightVersion: MANUSCRIPT_SCENE_CAST_PREFLIGHT_VERSION,
            manuscriptSceneCastPreflight: {
              version: normalizedSceneCast.version,
              status: normalizedSceneCast.status,
              attemptCount: normalizedSceneCast.attemptCount,
              changedPageNumbers: normalizedSceneCast.changedPageNumbers,
            },
            phase: "manuscript:scene-cast-preflight",
          });
          console.info("[preview] strict V3 manuscript scene-cast preflight", JSON.stringify({
            jobId: job.id,
            projectId,
            status: normalizedSceneCast.status,
            attemptCount: normalizedSceneCast.attemptCount,
            changedPageNumbers: normalizedSceneCast.changedPageNumbers,
          }));
        }
        const manuscriptCanonicalNames = [...new Set([
          final_blueprint.hero?.name,
          ...(narrativeBookSpec?.registries?.characters || []).map((character) => character?.displayName),
          ...(characterCanons || []).flatMap((character) => [character?.name, character?.family_address]),
          ...(final_blueprint.cast || []).flatMap((character) => [character?.name, character?.family_address]),
        ].map((name) => String(name || "").trim()).filter(Boolean))];
        const normalizedManuscript = await normalizeManuscriptWordTargets({
          spec: narrativeBookSpec,
          pageTexts: Object.fromEntries(draftTextByPage),
          canonicalNames: manuscriptCanonicalNames,
          repair: async ({ attempt, issues, pageTexts, priorFailure }) => {
            updateJob(job.id, { step: `draft:manuscript:word-preflight:${attempt}` });
            await updateGenerationRun(job.id, {
              status: "running",
              currentStep: `draft:manuscript:word-preflight:${attempt}`,
            });
            return manuscriptPreflightNormalizerAgent({
              language: final_blueprint.language,
              hero: final_blueprint.hero,
              pages: manuscriptWordRepairRequestPages({
                spec: narrativeBookSpec,
                pageTexts,
                issues,
                storyScenePlan,
              }),
              priorFailure,
            }, {
              backgroundExecution: providerBackgroundExecution,
              backgroundStep: `manuscript:word-preflight:v${MANUSCRIPT_WORD_PREFLIGHT_VERSION}:attempt:${attempt}`,
            });
          },
        });
        if (normalizedManuscript.changed) {
          draftTextByPage.clear();
          Object.entries(normalizedManuscript.pageTexts).forEach(([pageNumber, text]) => {
            draftTextByPage.set(Number(pageNumber), String(text || ""));
          });
          storyScenePlan = bindStoryboardPageTexts(storyScenePlan, normalizedManuscript.pageTexts);
        }
        if (normalizedManuscript.changed
          || Number(checkpoint.manuscriptWordPreflightVersion || 0) < MANUSCRIPT_WORD_PREFLIGHT_VERSION) {
          await persistCheckpoint({
            draftTexts: Object.fromEntries(draftTextByPage),
            storyScenePlan,
            manuscriptWordPreflightVersion: MANUSCRIPT_WORD_PREFLIGHT_VERSION,
            manuscriptWordPreflight: {
              version: normalizedManuscript.version,
              status: normalizedManuscript.status,
              attemptCount: normalizedManuscript.attemptCount,
              changedPageNumbers: normalizedManuscript.changedPageNumbers,
              repairs: normalizedManuscript.repairs,
            },
            phase: "manuscript:word-preflight",
          });
          console.info("[preview] strict V3 manuscript word preflight", JSON.stringify({
            jobId: job.id,
            projectId,
            status: normalizedManuscript.status,
            attemptCount: normalizedManuscript.attemptCount,
            changedPageNumbers: normalizedManuscript.changedPageNumbers,
          }));
        }
      }
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
      let narrativeV3TextAuthority = null;
      if (strictV3Rendering) {
        updateJob(job.id, { step: "draft:v3-text-authority" });
        await updateGenerationRun(job.id, {
          status: "running",
          currentStep: "draft:v3-text-authority",
        });
        narrativeV3TextAuthority = await prepareNarrativeV3ProductionTextAuthority({
          projectId,
          runId: job.id,
          spec: narrativeBookSpec,
          pageTexts: Object.fromEntries(draftTextByPage),
        });
        await persistCheckpoint({
          phase: "v3-text-authority",
          narrativeV3TextAuthority: {
            version: narrativeV3TextAuthority.version,
            status: narrativeV3TextAuthority.status,
            sourceSpecDigest: narrativeV3TextAuthority.sourceSpecDigest,
            artifactDigest: narrativeV3TextAuthority.artifactDigest,
          },
        });
        console.info("[preview] strict V3 text authority prepared", JSON.stringify({
          jobId: job.id,
          projectId,
          sceneCount: narrativeV3TextAuthority.storyboard.beats.length,
          artifactDigest: narrativeV3TextAuthority.artifactDigest.slice(0, 12),
        }));
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
          size: findBookFormat(answers.book_format_id).imageSize,
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
          bookFormat: final_blueprint.format,
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

      const coverReferencePath = localCoverImageUrl ? outputImagePath(localCoverImageUrl) : "";
      const lockedCoverStorageKey = visualBibleCoverStorageKey(project) || coverImageStorageKey;
      let wardrobeAuthorityAssets = new Map();
      if (strictV3Rendering) {
        updateJob(job.id, { step: "draft:wardrobe-visual-authority" });
        await updateGenerationRun(job.id, {
          status: "running",
          currentStep: "draft:wardrobe-visual-authority",
        });
        const authoritySceneInputs = final_blueprint.pages
          .filter((page) => page.page_type === "image" && page.scene_contract)
          .map((page) => {
            const continuity = buildSceneContinuity({
              blueprint: final_blueprint,
              characterCanons,
              castPresent: page.cast_present || [],
              scenePrompt: page.image_prompt,
              visualState: page.visual_state || {},
              ...(coverReferencePath ? { continuityImagePath: coverReferencePath } : {}),
              ...(!coverReferencePath && lockedCoverStorageKey ? { continuityImageStorageKey: lockedCoverStorageKey } : {}),
              structuredSceneContract: page.scene_contract,
              wardrobeLocks: page.wardrobe_locks || [],
              referenceAssets,
            });
            return {
              page,
              continuity,
              sceneRenderContract: continuity.sceneFidelityContract?.scene_render_contract || null,
            };
          });
        const wardrobeAuthorityPlan = compileWardrobeVisualAuthorityPlan(
          authoritySceneInputs.map((entry) => entry.sceneRenderContract).filter(Boolean),
        );
        wardrobeAuthorityAssets = acceptedWardrobeAuthorityAssets(
          wardrobeAuthorityPlan,
          checkpoint.wardrobeVisualAuthority,
        );
        // Persist the exact active boundary before the first model-sheet call.
        // A provider or QA failure must resume here rather than be reported as
        // if text authority were still running.
        await persistCheckpoint({
          phase: "wardrobe-visual-authority",
          wardrobeVisualAuthority: {
            version: WARDROBE_VISUAL_AUTHORITY_VERSION,
            policyVersion: WARDROBE_VISUAL_AUTHORITY_POLICY_VERSION,
            planDigest: wardrobeAuthorityPlan.validation.artifactDigest,
            assets: [...wardrobeAuthorityAssets.values()],
          },
        });
        for (const authority of wardrobeAuthorityPlan.authorities) {
          if (wardrobeAuthorityAssets.has(authority.authorityId)) continue;
          const source = authoritySceneInputs.find((entry) => (
            entry.sceneRenderContract?.cast?.required?.some((character) => (
              character.character_id === authority.characterId
              && character.outfit?.state_id === authority.stateId
            ))
          ));
          const normalizedName = authority.characterName.toLowerCase();
          const identityReference = source?.continuity?.referenceImages?.find((reference) => (
            reference.kind === "identity"
            && (reference.characterId === authority.characterId
              || String(reference.label || "").toLowerCase().startsWith(`${normalizedName},`))
          ));
          const styleReference = source?.continuity?.referenceImages?.find((reference) => reference.kind === "continuity");
          if (!identityReference) {
            const authorityError = new Error("A wardrobe authority cannot be produced without its exact private identity reference.");
            authorityError.code = "wardrobe_visual_authority_reference_missing";
            authorityError.artifactType = "wardrobe_visual_authority_v1";
            throw authorityError;
          }
          const directAsset = directWardrobeAuthorityAsset(authority, identityReference);
          if (directAsset) {
            wardrobeAuthorityAssets.set(authority.authorityId, directAsset);
            await persistCheckpoint({
              phase: "wardrobe-visual-authority",
              wardrobeVisualAuthority: {
                version: WARDROBE_VISUAL_AUTHORITY_VERSION,
                policyVersion: WARDROBE_VISUAL_AUTHORITY_POLICY_VERSION,
                planDigest: wardrobeAuthorityPlan.validation.artifactDigest,
                assets: [...wardrobeAuthorityAssets.values()],
              },
            });
            console.info("[preview] ordinary wardrobe authority bound to private identity", JSON.stringify({
              jobId: job.id,
              projectId,
              authorityId: authority.authorityId,
              characterId: authority.characterId,
            }));
            continue;
          }
          if (!styleReference) {
            const authorityError = new Error("A garment-only wardrobe authority cannot be produced without the approved style reference.");
            authorityError.code = "wardrobe_visual_authority_reference_missing";
            authorityError.artifactType = "wardrobe_visual_authority_v1";
            throw authorityError;
          }
          const reportAttempt = reportImageAttempt(job.id, `draft:wardrobe-authority:${authority.authorityId}`);
          let acceptedAsset = null;
          let lastIssueCodes = [];
          for (let attempt = 1; attempt <= 2; attempt += 1) {
            reportAttempt({
              phase: "started",
              attempt,
              maximumAttempts: 2,
              model: process.env.REFERENCE_IMAGE_MODEL || "gpt-image-2",
              referencePolicyStage: "locked_style_garment_only",
              referenceKinds: ["continuity"],
            });
            const candidateUrl = await generateImage({
              prompt: wardrobeAuthorityPrompt(authority),
              outName: `wardrobe-${authority.authorityId}-${job.id}-attempt${attempt}`,
              referenceImages: [styleReference],
              sceneContract: `WARDROBE VISUAL AUTHORITY V1: exactly one complete garment-only outfit on one anonymous headless mannequin; no person or identity; exact outfit ${authority.stateId}: ${authority.description}`,
              renderingMode: answers.rendering_mode,
              likenessGoal: answers.likeness_goal,
              quality: "low",
              model: process.env.DRAFT_IMAGE_MODEL || "gpt-image-2",
            });
            reportAttempt({ phase: "generated", attempt, maximumAttempts: 2 });
            const evidence = await inspectWardrobeVisualAuthority({
              imagePath: outputImagePath(candidateUrl),
              entry: authority,
              styleReference,
            });
            lastIssueCodes = evidence.issueCodes;
            if (!evidence.approved) {
              reportAttempt({
                phase: "rejected",
                attempt,
                maximumAttempts: 2,
                issues: evidence.issueCodes,
                referencePolicyStage: "locked_style_garment_only",
              });
              continue;
            }
            const persisted = await persistPreviewAsset({ projectId, assetUrl: candidateUrl });
            acceptedAsset = {
              version: WARDROBE_VISUAL_AUTHORITY_VERSION,
              authorityId: authority.authorityId,
              characterId: authority.characterId,
              characterName: authority.characterName,
              stateId: authority.stateId,
              description: authority.description,
              authorityMode: authority.authorityMode,
              evidenceMode: authority.evidenceMode,
              semanticSignature: authority.semanticSignature,
              identityBearing: false,
              status: "accepted",
              storageKey: persisted.storageKey,
              previewUrl: persisted.previewUrl,
              sha256: persisted.sha256,
              advisoryIssueCodes: evidence.advisoryIssueCodes || [],
            };
            wardrobeAuthorityAssets.set(authority.authorityId, acceptedAsset);
            reportAttempt({
              phase: "approved",
              attempt,
              maximumAttempts: 2,
              ...(evidence.advisoryIssueCodes?.length ? { issues: evidence.advisoryIssueCodes } : {}),
            });
            await persistCheckpoint({
              phase: "wardrobe-visual-authority",
              wardrobeVisualAuthority: {
                version: WARDROBE_VISUAL_AUTHORITY_VERSION,
                policyVersion: WARDROBE_VISUAL_AUTHORITY_POLICY_VERSION,
                planDigest: wardrobeAuthorityPlan.validation.artifactDigest,
                assets: [...wardrobeAuthorityAssets.values()],
              },
            });
            break;
          }
          if (!acceptedAsset) {
            const authorityError = new Error("The private wardrobe model sheet did not pass its bounded identity, cardinality and outfit verification.");
            authorityError.code = "wardrobe_visual_authority_incomplete";
            authorityError.artifactType = "wardrobe_visual_authority_v1";
            authorityError.issues = lastIssueCodes.map((code) => ({ path: `/authorities/${authority.authorityId}`, message: code }));
            throw authorityError;
          }
        }
        assertWardrobeVisualAuthorityCoverage(wardrobeAuthorityPlan, wardrobeAuthorityAssets);
        const wardrobeSatisfiability = assertWardrobeVisualAuthoritySatisfiability(
          wardrobeAuthorityPlan,
          wardrobeAuthorityAssets,
        );
        console.info("[preview] wardrobe visual authority sealed", JSON.stringify({
          jobId: job.id,
          projectId,
          authorityCount: wardrobeAuthorityPlan.authorities.length,
          planDigest: wardrobeAuthorityPlan.validation.artifactDigest.slice(0, 12),
          bindingDigest: wardrobeSatisfiability.bindingDigest.slice(0, 12),
        }));
      }

      const {
        acceptedPages: draftPages,
        recoveryPageNumbers,
      } = partitionPreviewDraftPages(priorResult.draftPages || [], { strictV3Rendering });
      const strictRecoveryPageNumbers = new Set(recoveryPageNumbers);
      if (strictRecoveryPageNumbers.size) {
        console.info("[preview] strict V3 quarantine recovery queued", JSON.stringify({
          jobId: job.id,
          projectId,
          pages: [...strictRecoveryPageNumbers],
          policyVersion: PREVIEW_RETRY_POLICY_VERSION,
        }));
      }
      if (causalRecoveryRun?.pages?.length) {
        console.info("[preview] causal recovery applied", JSON.stringify({
          jobId: job.id,
          projectId,
          version: causalRecoveryRun.version,
          signature: causalRecoveryRun.signature,
          pages: causalRecoveryRun.pages.map((page) => ({
            pageNumber: page.pageNumber,
            issueCodes: page.issueCodes,
            strategies: page.strategies,
          })),
        }));
      }
      const deferredIllustrationPages = [];
      const previewResultSnapshot = () => ({
        coverImageUrl,
        coverImageStorageKey,
        coverPreviewUrl,
        coverStorageKey,
        draftPages: [...draftPages],
        ...(deferredIllustrationPages.length ? {
          deferredIllustrationPages: deferredIllustrationPages.map((item) => ({ ...item })),
        } : {}),
      });
      const completedPageNumbers = new Set(draftPages.map((page) => Number(page.page_number)));
      const estimatedInteriorImageUsdMicros = Math.round(
        generationCostPolicy().estimatedInteriorImageUsd * 1_000_000,
      );
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
          // During ordinary forward generation no later accepted page exists.
          // On a checkpoint resume, however, a previously isolated gap may be
          // repaired between two accepted neighbours; both are then safe,
          // secondary visual evidence for the immutable current contract.
          includeNext: true,
        });
        let sceneContinuity = buildSceneContinuity({
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
        const wardrobeAuthorityReferences = wardrobeVisualReferencesForScene(
          sceneContinuity.sceneFidelityContract?.scene_render_contract,
          wardrobeAuthorityAssets,
        );
        if (wardrobeAuthorityReferences.length) {
          sceneContinuity = buildSceneContinuity({
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
            wardrobeAuthorityReferences,
          });
        }
        const qualityReferenceImages = sceneContinuity.referenceImages || [];
        const pageRecovery = previewCausalRecoveryPage(causalRecoveryRun, page.page_number);
        if (pageRecovery) {
          sceneContinuity = {
            ...sceneContinuity,
            referenceImages: causalRecoveryReferences(
              sceneContinuity.referenceImages || [],
              pageRecovery,
            ),
          };
        }
        const visualPrompt = causalRecoveryPrompt(sceneContractImagePrompt({
          contract: page.scene_contract,
          stylePrompt: final_blueprint.style?.style_prompt || final_blueprint.style?.prompt || "",
          fallbackPrompt: page.image_prompt,
          visualAliases: sceneContinuity.visualAliases,
        }), pageRecovery);
        return {
          pairedText,
          sceneContinuity,
          visualPrompt,
          adjacentReferenceImages,
          pageRecovery,
          qualityReferenceImages,
        };
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
        let deferForProviderSafety = false;

        if (["text", "opening_text", "closing_text"].includes(page.page_type)) {
          text = draftTextByPage.get(page.page_number) || "";
        } else if (page.page_type === "image") {
          const visualRequest = buildPageVisualRequest(page);
          const {
            sceneContinuity,
            visualPrompt,
            pageRecovery,
            qualityReferenceImages,
          } = visualRequest;
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
              safetyFallbackPrompt: causalRecoveryPrompt(sceneContractImagePrompt({
                contract: page.scene_contract,
                stylePrompt: final_blueprint.style?.style_prompt || final_blueprint.style?.prompt || "",
                fallbackPrompt: page.image_prompt,
                visualAliases: sceneContinuity.visualAliases,
                safetyFallback: true,
              }), pageRecovery),
              initialSafetyFallbackStage: pageRecovery?.strategies?.includes("provider_safe_reexpression")
                ? IMAGE_SAFETY_FALLBACK_STAGES.CONTRACT_ONLY
                : IMAGE_SAFETY_FALLBACK_STAGES.FULL_REFERENCES,
              qualityReferenceImages,
              outName: `draft-page${page.page_number}-${job.id}`,
              castPresent: page.cast_present || [],
              pageLabel: `interior illustration for page ${page.page_number}`,
              maximumAttempts: pageRecovery || strictRecoveryPageNumbers.has(Number(page.page_number)) ? 3 : 2,
              onAttempt: reportImageAttempt(job.id, `draft:page:${page.page_number}`),
              onCandidate: createImageCandidateRecorder({
                jobId: job.id,
                projectId,
                pageNumber: page.page_number,
                stepKey: `image:page:${page.page_number}`,
                assetCache: candidateAssetCache,
              }),
              ...sceneContinuity,
              size: findBookFormat(final_blueprint.format?.id || answers.book_format_id).imageSize,
              quality: "low",
              renderingMode: answers.rendering_mode,
              likenessGoal: answers.likeness_goal,
              model: process.env.DRAFT_IMAGE_MODEL || "gpt-image-2",
              retryRepairableFindings: economicDecision.optionalVisualRetry,
              targetedRepairAvailable: !pageRecovery?.strategies?.includes(
                "wardrobe_authority_satisfiability_recovery",
              ),
              verifyExactCast: Boolean(sceneContinuity.sceneFidelityContract?.scene_render_contract),
              strictV3EvidenceRequired: strictV3Rendering,
            });
          } catch (error) {
            if (error instanceof IllustrationSafetyQuarantineError) {
              deferForProviderSafety = true;
              deferredIllustrationPages.push({
                pageNumber: Number(page.page_number),
                kind: error.rejectionKind,
                issueCodes: [...error.issueCodes],
              });
              console.warn("[preview] page isolated after provider safety rejection", JSON.stringify({
                jobId: job.id,
                projectId,
                pageNumber: page.page_number,
                issueCodes: error.issueCodes,
              }));
            } else {
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
                issueCodes: qualityIssueCodes,
                automaticRepair: qualityRepairPolicy.automaticRepair,
                wardrobeTargets: qualityRepairPolicy.wardrobeTargets || [],
                wardrobeDiagnostics: qualityRepairPolicy.wardrobeDiagnostics || undefined,
              }));
              qualityStatus = qualityRepairPolicy.automaticRepair
                ? "repair_pending"
                : strictV3Rendering
                  ? "strict_quarantined"
                  : "review_required";
            }
          }
          if (deferForProviderSafety) {
            const partialResult = previewResultSnapshot();
            updateJob(job.id, { result: partialResult });
            await persistCheckpoint({ phase: `provider-safety-quarantine:page:${page.page_number}` }, {
              previewResult: partialResult,
              finalBlueprint: final_blueprint,
            });
            // This page has no candidate and therefore cannot become a visual
            // anchor. Continue manufacturing every independent page so a free
            // resume later targets only this gap and can use accepted bounds.
            continue;
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
          bookFormat: final_blueprint.format,
          dpi: 150,
        });
        const persistedPage = await persistPreviewAsset({ projectId, assetUrl: localPreviewUrl });
        upsertPreviewDraftPage(draftPages, {
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
        const partialResult = previewResultSnapshot();
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
          issueCodes: strictPageIssueCodes(page),
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
        const {
          sceneContinuity,
          visualPrompt,
          qualityReferenceImages,
          pageRecovery,
        } = buildPageVisualRequest(page);
        const repairPolicy = pendingPage.qualityRepairPolicy
          || targetedVisualRepairPolicy(pendingPage.qualityIssues || [], {
            source: pendingPage.qualityKind || "scene",
          });
        const wardrobeRepairDirective = strictV3WardrobeRepairDirective(repairPolicy);
        const repairSource = pendingPage.imageStorageKey ? {
            kind: "repair_source",
            storageKey: pendingPage.imageStorageKey,
            label: "preserved page candidate; edit only the classified defect",
          } : null;
        const wardrobeReferencePlan = wardrobeRepairReferencePlan({
          repairPolicy,
          // The plan needs the complete private authority set to prove that
          // every target is satisfiable. Its returned generation references
          // are filtered by causalRecoveryReferences immediately below.
          sceneReferences: pageRecovery
            ? qualityReferenceImages
            : sceneContinuity.referenceImages || [],
          repairSource,
        });
        const plannedRepairReferences = wardrobeReferencePlan
          ? wardrobeReferencePlan.references
          : [
              ...(repairSource ? [repairSource] : []),
              ...(sceneContinuity.referenceImages || []),
            ];
        // A causal retry must remain causal through the final repair sweep.
        // Reintroducing the rejected candidate or a contaminated continuity
        // image here would silently undo the reference isolation already
        // applied by buildPageVisualRequest(). Independent QA still receives
        // the complete canonical evidence set below.
        const repairReferences = causalRecoveryReferences(
          plannedRepairReferences,
          pageRecovery,
        );
        const wardrobeRecompose = wardrobeReferencePlan?.mode === "canonical_scene_recompose"
          || pageRecovery?.strategies?.includes("wardrobe_reference_isolation") === true;
        const repairPrompt = causalRecoveryPrompt(
          `${visualPrompt}\n\n${wardrobeRecompose ? "CANONICAL WARDROBE SCENE RECOMPOSITION (policy V8): the preserved candidate and incompatible continuity pixels are deliberately excluded. Recreate the same immutable scene from its contract and the complete canonical identity and wardrobe authorities." : "FINAL TARGETED IMAGE EDIT (policy V8): edit the preserved candidate instead of redesigning it."} Correct only these classified defects: ${(pendingPage.qualityIssues || []).join("; ")}. ${wardrobeRepairDirective} Preserve the camera, composition, background, lighting, unaffected people, unaffected objects and approved cover medium wherever the selected repair mode permits. For a cast or identity correction, do not simply add another person or animal: preserve exactly one complete instance of every required named identity, replace an incorrect identity in place, and remove any accidental duplicate. For a wardrobe correction, change only the explicitly targeted person's clothing to that person's FIXED OUTFIT FOR CURRENT SCENE and preserve face, body, pose and every other subject. The canonical wardrobe sheets are the combined identity-and-outfit authority for every represented human. Do not introduce any other narrative change.`,
          pageRecovery,
        );
        try {
          if (wardrobeReferencePlan && !wardrobeReferencePlan.complete) {
            const error = new Error("The exact accepted wardrobe authority required for isolated repair is unavailable.");
            error.code = "wardrobe_visual_authority_incomplete";
            throw error;
          }
          const repairedLocalImageUrl = await generateQualityCheckedImage({
            prompt: repairPrompt,
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
            qualityReferenceImages: [
              ...(repairSource ? [repairSource] : []),
              ...qualityReferenceImages,
            ],
            size: findBookFormat(final_blueprint.format?.id || answers.book_format_id).imageSize,
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
            bookFormat: final_blueprint.format,
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
          const repairedResult = previewResultSnapshot();
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
            wardrobeTargets: repairPolicy.wardrobeTargets || [],
            repairMode: wardrobeRecompose ? "canonical_wardrobe_recompose" : "targeted_image_edit",
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
          const reviewResult = previewResultSnapshot();
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

      if (deferredIllustrationPages.length) {
        const error = new Error(`The image provider could not produce a policy-safe candidate for ${deferredIllustrationPages.length} page(s). Accepted pages remain checkpointed.`);
        error.code = "preview_provider_safety_quarantine";
        error.pages = deferredIllustrationPages.map((item) => item.pageNumber);
        console.warn("[preview] completed independent pages with provider-safety gaps", JSON.stringify({
          jobId: job.id,
          projectId,
          pages: error.pages,
        }));
        throw error;
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
        const reviewResult = previewResultSnapshot();
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
          textAuthority: narrativeV3TextAuthority,
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
        const completedAt = new Date().toISOString();
        const readyProject = await projectStore.update(job.projectId, {
          status: "preview_ready",
          productConfiguration: startTemporaryPreviewAccess(latest || project, completedAt),
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
          }, { ...checkpoint, phase: "done", retryPolicyVersion: PREVIEW_RETRY_POLICY_VERSION, retryAvailable: false, retryExhausted: false, completedAt }),
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
      const classifiedError = isProviderBillingUnavailable(error)
        ? tagProviderBillingUnavailable(error)
        : error;
      const boundedErrorCode = classifiedError?.code === "preview_provider_safety_quarantine"
        ? "preview_provider_safety_quarantine"
        : classifiedError?.code === "preview_provider_billing_unavailable"
          ? "preview_provider_billing_unavailable"
          : classifiedError?.code === "preview_interrupted"
            ? "preview_interrupted"
            : "preview_generation_failed";
      const publicErrorMessage = boundedErrorCode === "preview_provider_billing_unavailable"
        ? "The illustration service is temporarily unavailable. The project remains saved and retryable."
        : String(classifiedError?.message || classifiedError);
      updateJob(job.id, { status: "failed", errorCode: boundedErrorCode, error: publicErrorMessage });
      await updateGenerationRun(job.id, {
        status: "failed",
        currentStep: getJob(job.id)?.step || checkpoint?.phase || "unknown",
        errorCode: boundedErrorCode,
        errorMessage: publicErrorMessage,
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
        errorCode: String(classifiedError?.code || boundedErrorCode),
        artifactType: String(classifiedError?.artifactType || ""),
        pageNumber: classifiedError?.pageNumber != null && Number.isInteger(Number(classifiedError.pageNumber)) ? Number(classifiedError.pageNumber) : null,
        issues: (Array.isArray(classifiedError?.issues) ? classifiedError.issues : []).slice(0, 12).map((issue) => ({
          keyword: String(issue?.keyword || ""),
          path: String(issue?.path || ""),
          pageNumber: issue?.pageNumber != null && Number.isInteger(Number(issue.pageNumber)) ? Number(issue.pageNumber) : null,
          wordCount: issue?.wordCount != null && Number.isInteger(Number(issue.wordCount)) ? Number(issue.wordCount) : null,
          minimumWords: issue?.minimumWords != null && Number.isInteger(Number(issue.minimumWords)) ? Number(issue.minimumWords) : null,
          maximumWords: issue?.maximumWords != null && Number.isInteger(Number(issue.maximumWords)) ? Number(issue.maximumWords) : null,
          message: String(issue?.message || issue || "").slice(0, 300),
        })),
        error: String(classifiedError?.message || classifiedError),
      }));
      if (creditReservation?.id) await creditStore.releasePreview(creditReservation.id).catch(() => null);
      if (job.projectId) {
        const latest = await projectStore.get(job.projectId);
        const priorCheckpoint = generationCheckpoint(latest, fingerprint) || checkpoint;
        const retryWasConsumed = Boolean(priorCheckpoint?.retryConsumedAt || isTechnicalGenerationRetry);
        const interruptionIsRecoverable = boundedErrorCode === "preview_interrupted";
        const providerBillingIsRecoverable = boundedErrorCode === "preview_provider_billing_unavailable";
        const failureIsRecoverable = interruptionIsRecoverable || providerBillingIsRecoverable;
        const nextCausalRecovery = buildPreviewCausalRecovery({
          previewResult: latest?.previewResult || {},
          priorRecovery: priorCheckpoint?.causalRecovery || causalRecoveryRun,
        });
        const causalFailureDetected = Boolean(nextCausalRecovery?.pages?.length);
        const retryAvailable = failureIsRecoverable
          || nextCausalRecovery?.available === true
          || (!causalFailureDetected && !retryWasConsumed);
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
          retryAvailable,
          retryExhausted: !retryAvailable,
          ...(nextCausalRecovery ? { causalRecovery: nextCausalRecovery } : {}),
          failureReason: boundedErrorCode,
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
            retryAvailable,
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
