import express from "express";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { sceneContractImagePrompt } from "../agents/storyScenePlanner.js";
import { deterministicStoryPlanIssues } from "../agents/storyScenePlanAudit.js";
import { findIllustrationStyle } from "../config/illustrationStyles.js";
import { composeBookPagePNG } from "../services/composeBookPagePNG.js";
import { getDeliveryStorage } from "../services/deliveryStorage.js";
import { readWooCustomer } from "../services/draftIdentity.js";
import { generateQualityCheckedImage } from "../services/imageQualityGate.js";
import { generationRunStore } from "../services/generationRunStore.js";
import { createJob, updateJob } from "../services/jobStore.js";
import { persistPreviewAsset, storageBodyToBuffer } from "../services/previewAssetStorage.js";
import { projectStore } from "../services/projectStore.js";
import {
  MAX_QUALITY_REVIEW_ATTEMPTS_PER_SCOPE,
  qualityReviewCandidateSelection,
  qualityReviewScopePolicy,
  resolveQualityReviewPage,
  saveQualityReviewCandidate,
} from "../services/qualityReviewResolution.js";
import { rewriteApprovedSpreadText } from "../services/rewriteApprovedSpreadText.js";
import {
  classifyQualityReviewFailure,
  qualityReviewInstructionFingerprint,
  qualityReviewRepairStrategy,
} from "../services/qualityReviewFailurePolicy.js";
import { buildSceneContinuity } from "../services/visualContinuity.js";
import { adjacentApprovedIllustrationReferences } from "../services/adjacentVisualContinuity.js";
import { withOpenAICostContext } from "../services/openaiCostContext.js";
import { visualBibleCoverStorageKey } from "../services/visualBible.js";
import { generationCheckpoint } from "../services/previewGenerationCheckpoint.js";
import { wardrobeVisualReferencesFromCheckpoint } from "../services/wardrobeVisualAuthorityV1.js";

const router = express.Router();
const resolvingProjects = new Set();
const MAX_CREATOR_INSTRUCTION_LENGTH = 500;
const MIN_CREATOR_INSTRUCTION_LENGTH = 8;

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

function reviewPage(project, pageNumber) {
  return project.previewResult?.draftPages?.find((page) => (
    Number(page.page_number) === Number(pageNumber)
    && page.page_type === "image"
    && page.qualityStatus === "review_required"
  )) || null;
}

function blueprintPage(project, pageNumber) {
  return project.finalBlueprint?.pages?.find((page) => (
    Number(page.page_number) === Number(pageNumber) && page.page_type === "image"
  )) || null;
}

function creatorInstruction(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CREATOR_INSTRUCTION_LENGTH);
}

function correctionScope(value) {
  return value === "text" ? "text" : value === "illustration" ? "illustration" : "";
}

async function usableCharacterCanons(project) {
  const canons = Array.isArray(project.continuitySnapshot?.characterCanons)
    ? project.continuitySnapshot.characterCanons
    : [];
  return Promise.all(canons.map(async (canon) => {
    if (!canon?.photoId) return canon;
    try {
      await fs.access(path.resolve("data/uploads", path.basename(String(canon.photoId))));
      return canon;
    } catch {
      return { ...canon, photoId: "" };
    }
  }));
}

async function downloadContinuityReference(project, temporaryDirectory) {
  const storageKey = visualBibleCoverStorageKey(project)
    || project.previewResult?.draftPages?.find((page) => page.page_type === "image" && page.imageStorageKey)?.imageStorageKey;
  if (!storageKey) return "";
  const asset = await getDeliveryStorage().get(storageKey);
  const target = path.join(temporaryDirectory, "continuity-reference.png");
  await fs.writeFile(target, await storageBodyToBuffer(asset.body));
  return target;
}

async function recordFailedRepair(projectId, pageNumber, scope, error, instruction, strategy) {
  const latest = await projectStore.get(projectId);
  if (!latest?.previewResult?.draftPages) return;
  const failure = classifyQualityReviewFailure(error, scope);
  const instructionFingerprint = qualityReviewInstructionFingerprint(instruction);
  const draftPages = latest.previewResult.draftPages.map((page) => (
    Number(page.page_number) === Number(pageNumber)
      ? {
          ...page,
          ...(scope === "text"
            ? {
                qualityReviewTextRepairFailedAt: new Date().toISOString(),
                qualityReviewTextRepairError: failure.publicCode,
                qualityReviewTextRepairFailureKind: failure.kind,
                qualityReviewTextRepairFailureCode: failure.publicCode,
                qualityReviewTextRepairFailureInstructionFingerprint: instructionFingerprint,
                qualityReviewTextRepairFailureStrategy: strategy,
              }
            : {
                qualityReviewRepairFailedAt: new Date().toISOString(),
                qualityReviewRepairError: failure.publicCode,
                qualityReviewRepairFailureKind: failure.kind,
                qualityReviewRepairFailureCode: failure.publicCode,
                qualityReviewRepairFailureInstructionFingerprint: instructionFingerprint,
                qualityReviewRepairFailureStrategy: strategy,
              }),
        }
      : page
  ));
  await projectStore.update(projectId, {
    status: "preview_quality_review",
    previewResult: { ...latest.previewResult, draftPages },
  });
  return failure;
}

async function recordDurableAlternative({
  project,
  pageNumber,
  scope,
  storageKey,
  previewUrl,
  metadata = {},
  jobId,
}) {
  try {
    const { step } = await generationRunStore.upsertStep(project.generationJobId, {
      stepKey: `creator-quality-${scope}-alternative:page:${pageNumber}`,
      stepType: `creator_quality_${scope}_alternative`,
      status: "running",
      maxAttempts: 1,
    });
    await generationRunStore.recordCandidate({
      runId: project.generationJobId,
      stepId: step.id,
      projectId: project.id,
      pageNumber,
      candidateNumber: 1,
      status: "accepted",
      storageKey,
      previewUrl,
      metadata: {
        ...metadata,
        source: "creator_quality_review",
        scope,
      },
    });
    await generationRunStore.updateStep(step.id, {
      status: "completed",
      output: { storageKey, previewUrl },
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("[quality-review] durable alternative record failed", JSON.stringify({
      jobId,
      projectId: project.id,
      pageNumber,
      scope,
      error: String(error?.message || error),
    }));
  }
}

async function keepOriginal(req, res) {
  const identity = requireIdentity(req, res);
  if (!identity) return;
  if (resolvingProjects.has(req.params.id)) {
    return res.status(409).json({ error: "A quality-review decision is already being applied" });
  }
  resolvingProjects.add(req.params.id);
  try {
    const result = await resolveQualityReviewPage({
      projectId: req.params.id,
      identity,
      pageNumber: Number.parseInt(req.params.pageNumber, 10),
      resolution: "creator_approved",
    });
    res.json({
      ready: result.ready,
      remainingPages: result.remainingPages,
      projectStatus: result.project?.status,
    });
  } catch (error) {
    res.status(Number(error?.statusCode || 500)).json({ error: String(error?.message || error) });
  } finally {
    resolvingProjects.delete(req.params.id);
  }
}

router.post("/projects/:id/quality-review/pages/:pageNumber/approve", keepOriginal);
router.post("/projects/:id/quality-review/pages/:pageNumber/keep-original", keepOriginal);

router.post("/projects/:id/quality-review/pages/:pageNumber/use-candidate", async (req, res) => {
  const identity = requireIdentity(req, res);
  if (!identity) return;
  if (resolvingProjects.has(req.params.id)) {
    return res.status(409).json({ error: "A quality-review decision is already being applied" });
  }
  resolvingProjects.add(req.params.id);
  try {
    const pageNumber = Number.parseInt(req.params.pageNumber, 10);
    const project = await projectStore.getForCustomer(req.params.id, identity);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const currentPage = reviewPage(project, pageNumber);
    if (!currentPage) return res.status(404).json({ error: "Quality-review page not found" });
    const selection = qualityReviewCandidateSelection(
      currentPage,
      correctionScope(req.body?.scope),
    );
    const result = await resolveQualityReviewPage({
      projectId: project.id,
      identity,
      pageNumber,
      resolution: "creator_repaired",
      replacement: selection.pageReplacement,
      pairedTextReplacement: selection.pairedTextReplacement,
      selectedScope: selection.scope,
    });
    res.json({
      ready: result.ready,
      remainingPages: result.remainingPages,
      projectStatus: result.project?.status,
    });
  } catch (error) {
    res.status(Number(error?.statusCode || 500)).json({ error: String(error?.message || error) });
  } finally {
    resolvingProjects.delete(req.params.id);
  }
});

router.post("/projects/:id/quality-review/pages/:pageNumber/repair", async (req, res) => {
  const identity = requireIdentity(req, res);
  if (!identity) return;
  const project = await projectStore.getForCustomer(req.params.id, identity);
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (project.status !== "preview_quality_review") {
    return res.status(409).json({ error: "This preview is not awaiting quality review" });
  }
  const pageNumber = Number.parseInt(req.params.pageNumber, 10);
  const currentPage = reviewPage(project, pageNumber);
  const scenePage = blueprintPage(project, pageNumber);
  if (!currentPage || !scenePage) return res.status(404).json({ error: "Quality-review page not found" });
  const scope = correctionScope(req.body?.scope);
  if (!scope) return res.status(400).json({ error: "Choose whether to adjust the text or the illustration" });
  const instruction = creatorInstruction(req.body?.instruction);
  if (instruction.length < MIN_CREATOR_INSTRUCTION_LENGTH) {
    return res.status(400).json({ error: "Describe briefly what does not match before creating an alternative" });
  }
  const scopePolicy = qualityReviewScopePolicy(currentPage, scope);
  if (scopePolicy.completedCount >= 1 || scopePolicy.candidateReady) {
    return res.status(409).json({ error: `The free ${scope} alternative has already been used for this page` });
  }
  if (!scopePolicy.canRequest) {
    return res.status(409).json({
      code: "quality_review_technical_attempts_exhausted",
      error: `The two technical ${scope} attempts did not produce an alternative`,
    });
  }
  const previousFailureKind = String(scope === "text"
    ? currentPage.qualityReviewTextRepairFailureKind || ""
    : currentPage.qualityReviewRepairFailureKind || "");
  const previousInstructionFingerprint = String(scope === "text"
    ? currentPage.qualityReviewTextRepairFailureInstructionFingerprint || ""
    : currentPage.qualityReviewRepairFailureInstructionFingerprint || "");
  if (
    scopePolicy.attemptCount > 0
    && previousFailureKind === "request_incompatible"
    && previousInstructionFingerprint === qualityReviewInstructionFingerprint(instruction)
  ) {
    return res.status(422).json({
      code: "quality_review_request_rephrase_required",
      suggestedScope: scope === "text" ? "illustration" : "text",
      error: "The same request conflicts with the approved scene and was not sent again",
    });
  }
  if (resolvingProjects.has(project.id)) {
    return res.status(409).json({ error: "A quality-review decision is already being applied" });
  }

  const startedAt = new Date().toISOString();
  const startedAttemptNumber = scopePolicy.attemptCount + 1;
  const repairStrategy = startedAttemptNumber > 1 && scope === "text"
    ? "contract_minimal_reformulation"
    : qualityReviewRepairStrategy({
        attemptNumber: startedAttemptNumber,
        previousFailureKind,
      });
  const draftPages = project.previewResult.draftPages.map((page) => (
    Number(page.page_number) === pageNumber
      ? {
          ...page,
          ...(scope === "text"
            ? {
                qualityReviewTextRepairAttemptCount: startedAttemptNumber,
                qualityReviewTextRepairStartedAt: startedAt,
                qualityReviewTextRepairStrategy: repairStrategy,
              }
            : {
                qualityReviewRepairAttemptCount: startedAttemptNumber,
                qualityReviewRepairStartedAt: startedAt,
                qualityReviewRepairStrategy: repairStrategy,
              }),
        }
      : page
  ));
  resolvingProjects.add(project.id);
  let job;
  try {
    await projectStore.updateForCustomer(project.id, identity, {
      previewResult: { ...project.previewResult, draftPages },
    });
    job = createJob({
      status: "running",
      kind: `quality_review_${scope}_alternative`,
      projectId: project.id,
      pageNumber,
      step: `quality:${scope}:page:${pageNumber}:preparing`,
    });
  } catch (error) {
    resolvingProjects.delete(project.id);
    return res.status(500).json({ error: String(error?.message || error) });
  }
  res.json({ jobId: job.id, pageNumber, scope });

  withOpenAICostContext({
    projectId: project.id,
    runId: job.id,
    workflow: "quality_review",
    attemptKind: "quality_repair",
    getStage: () => `quality:${scope}:page:${pageNumber}`,
  }, async () => {
    let temporaryDirectory = "";
    try {
      temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-quality-review-"));
      const refreshed = await projectStore.get(project.id);
      const refreshedPage = reviewPage(refreshed, pageNumber);
      const refreshedBlueprintPage = blueprintPage(refreshed, pageNumber);
      if (!refreshedPage || !refreshedBlueprintPage) throw new Error("Quality-review page is no longer available");

      const pairedTextPage = refreshed.finalBlueprint.pages?.find((page) => (
        Number(page.spread_number) === Number(refreshedBlueprintPage.spread_number)
        && ["text", "opening_text", "closing_text"].includes(page.page_type)
      ));
      const pairedDraftTextPage = refreshed.previewResult.draftPages?.find((page) => (
        Number(page.page_number) === Number(pairedTextPage?.page_number)
      ));
      const pairedText = pairedDraftTextPage?.text || "";

      if (scope === "text") {
        if (!pairedTextPage || !pairedDraftTextPage) throw new Error("The paired text page is unavailable");
        updateJob(job.id, { step: `quality:text:page:${pageNumber}:rewriting` });
        const revisedText = await rewriteApprovedSpreadText({
          project: refreshed,
          blueprintPage: refreshedBlueprintPage,
          currentText: pairedText,
          instruction,
          requestId: job.id,
          strategy: repairStrategy,
        });
        const fidelityIssues = deterministicStoryPlanIssues({
          approvedScenario: refreshed.finalBlueprint.approved_scenario,
          pageTexts: { [pairedTextPage.page_number]: revisedText },
          sceneContracts: [refreshedBlueprintPage.scene_contract].filter(Boolean),
          canonicalCharacters: refreshed.continuitySnapshot?.characterCanons || [],
          language: refreshed.finalBlueprint.language || refreshed.locale || "FR",
        });
        if (fidelityIssues.length) {
          throw new Error(`The revised text conflicts with the approved scene: ${fidelityIssues[0].code}`);
        }
        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        const composedTextUrl = await composeBookPagePNG({
          baseUrl,
          body: revisedText,
          outName: `quality-review-text-page${pairedTextPage.page_number}-${job.id}`,
          pageType: pairedDraftTextPage.page_type || "text",
          pageNumber: Number(pairedTextPage.page_number),
          fontStyle: refreshed.finalBlueprint.typography?.id,
          readerAge: refreshed.finalBlueprint.hero?.age,
          dpi: 150,
        });
        const persistedText = await persistPreviewAsset({
          projectId: refreshed.id,
          assetUrl: composedTextUrl,
        });
        await recordDurableAlternative({
          project: refreshed,
          pageNumber,
          scope,
          storageKey: persistedText.storageKey,
          previewUrl: persistedText.previewUrl,
          metadata: { textPageNumber: Number(pairedTextPage.page_number) },
          jobId: job.id,
        });
        const result = await saveQualityReviewCandidate({
          projectId: refreshed.id,
          identity,
          pageNumber,
          instruction,
          candidate: {
            scope: "text",
            textPageNumber: Number(pairedTextPage.page_number),
            text: revisedText,
            previewUrl: persistedText.previewUrl,
            storageKey: persistedText.storageKey,
          },
        });
        updateJob(job.id, {
          status: "done",
          step: `quality:text:page:${pageNumber}:done`,
          result: {
            pageNumber,
            repaired: false,
            candidateReady: true,
            candidateScope: "text",
            reviewRequired: true,
          },
        });
        console.info("[quality-review] text alternative ready", JSON.stringify({
          jobId: job.id,
          projectId: refreshed.id,
          pageNumber,
          candidateGeneratedAt: result.candidate.generatedAt,
        }));
        return;
      }

      updateJob(job.id, { step: `quality:illustration:page:${pageNumber}:illustrating` });
      const referencePath = await downloadContinuityReference(refreshed, temporaryDirectory);
      const characterCanons = await usableCharacterCanons(refreshed);
      const adjacentReferenceImages = adjacentApprovedIllustrationReferences({
        blueprintPages: refreshed.finalBlueprint.pages,
        draftPages: refreshed.previewResult?.draftPages || [],
        currentPageNumber: pageNumber,
        includeNext: true,
      });
      let continuity = buildSceneContinuity({
        blueprint: refreshed.finalBlueprint,
        characterCanons,
        castPresent: refreshedBlueprintPage.cast_present || [],
        scenePrompt: refreshedBlueprintPage.image_prompt,
        visualState: refreshedBlueprintPage.visual_state || {},
        continuityImagePath: referencePath,
        pairedText,
        structuredSceneContract: refreshedBlueprintPage.scene_contract || null,
        adjacentReferenceImages,
      });
      const wardrobeAuthorityReferences = wardrobeVisualReferencesFromCheckpoint(
        continuity.sceneFidelityContract?.scene_render_contract,
        generationCheckpoint(refreshed)?.wardrobeVisualAuthority,
      );
      if (wardrobeAuthorityReferences.length) {
        continuity = buildSceneContinuity({
          blueprint: refreshed.finalBlueprint,
          characterCanons,
          castPresent: refreshedBlueprintPage.cast_present || [],
          scenePrompt: refreshedBlueprintPage.image_prompt,
          visualState: refreshedBlueprintPage.visual_state || {},
          continuityImagePath: referencePath,
          pairedText,
          structuredSceneContract: refreshedBlueprintPage.scene_contract || null,
          adjacentReferenceImages,
          wardrobeAuthorityReferences,
        });
      }
      const selectedStyle = findIllustrationStyle(
        refreshed.questionnaire?.style_id || refreshed.productConfiguration?.style_id,
      );
      const priorIssues = Array.isArray(refreshedPage.qualityIssues)
        ? refreshedPage.qualityIssues.join("; ")
        : "";
      const repairInstruction = [
        `CREATOR-REQUESTED FREE QUALITY ALTERNATIVE: correct only these unresolved objective scene requirements: ${priorIssues || "the approved cast and main action"}.`,
        `CREATOR EXPLANATION OF THE MISMATCH: ${instruction}`,
        "The creator preference is secondary and visual only. Never change the approved chronology, location, physical cast, character identities, object state or main action. Preserve every other approved story, identity, outfit and rendering choice.",
        "Preserve exactly one complete visible instance of every required named person or animal. Replace an incorrect identity in place and remove an accidental duplicate instead of adding another subject.",
        repairStrategy === "resilient_source_preserving_retry"
          ? "SECOND TECHNICAL STRATEGY: make the smallest possible localized edit to the preserved source image. Prefer retaining its pixels and composition over reinterpreting the scene."
          : repairStrategy === "contract_minimal_reformulation"
            ? "SECOND CONTRACT STRATEGY: apply only the portion of the request compatible with the approved scene. Ignore any requested change to location, chronology, cast, object state or main action, and make the smallest visible correction that improves fidelity."
          : "",
      ].join("\n");
      const localImageUrl = await generateQualityCheckedImage({
        prompt: `${sceneContractImagePrompt({
          contract: refreshedBlueprintPage.scene_contract,
          stylePrompt: refreshed.finalBlueprint.style?.style_prompt || refreshed.finalBlueprint.style?.prompt || "",
          fallbackPrompt: refreshedBlueprintPage.image_prompt,
          visualAliases: continuity.visualAliases,
        })}\n\n${repairInstruction}`,
        safetyFallbackPrompt: `${sceneContractImagePrompt({
          contract: refreshedBlueprintPage.scene_contract,
          stylePrompt: refreshed.finalBlueprint.style?.style_prompt || refreshed.finalBlueprint.style?.prompt || "",
          fallbackPrompt: refreshedBlueprintPage.image_prompt,
          visualAliases: continuity.visualAliases,
          safetyFallback: true,
        })}\n\n${repairInstruction}`,
        outName: `quality-review-page${pageNumber}-${job.id}`,
        castPresent: refreshedBlueprintPage.cast_present || [],
        pageLabel: `creator-requested quality repair for page ${pageNumber}`,
        ...continuity,
        referenceImages: [
          ...(refreshedPage.imageStorageKey ? [{
            kind: "repair_source",
            storageKey: refreshedPage.imageStorageKey,
            label: "current accepted page under quality review; preserve its identity likeness, composition and every unaffected detail while correcting only the confirmed mismatch",
          }] : []),
          ...(continuity.referenceImages || []),
        ],
        size: "1024x1024",
        quality: "low",
        renderingMode: selectedStyle.renderingMode,
        likenessGoal: selectedStyle.likeness,
        model: process.env.DRAFT_IMAGE_MODEL || "gpt-image-2",
        maximumAttempts: 1,
        verifyExactCast: true,
        revisionInstruction: `${priorIssues}; ${instruction}`,
      });
      const persistedImage = await persistPreviewAsset({ projectId: refreshed.id, assetUrl: localImageUrl });

      updateJob(job.id, { step: `quality:repair:page:${pageNumber}:layout` });
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const localPreviewUrl = await composeBookPagePNG({
        baseUrl,
        imageUrl: localImageUrl,
        outName: `quality-review-page${pageNumber}-layout-${job.id}`,
        pageType: "image",
        pageNumber,
        fontStyle: refreshed.finalBlueprint.typography?.id,
        readerAge: refreshed.finalBlueprint.hero?.age,
        dpi: 150,
      });
      const persistedPage = await persistPreviewAsset({ projectId: refreshed.id, assetUrl: localPreviewUrl });
      await recordDurableAlternative({
        project: refreshed,
        pageNumber,
        scope,
        storageKey: persistedPage.storageKey,
        previewUrl: persistedPage.previewUrl,
        metadata: { imageStorageKey: persistedImage.storageKey },
        jobId: job.id,
      });
      const result = await saveQualityReviewCandidate({
        projectId: refreshed.id,
        identity,
        pageNumber,
        instruction,
        candidate: {
          scope: "illustration",
          imageUrl: persistedImage.previewUrl,
          imageStorageKey: persistedImage.storageKey,
          previewUrl: persistedPage.previewUrl,
          storageKey: persistedPage.storageKey,
        },
      });
      updateJob(job.id, {
        status: "done",
        step: `quality:repair:page:${pageNumber}:done`,
        result: {
          pageNumber,
          repaired: false,
          candidateReady: true,
          candidateScope: "illustration",
          reviewRequired: true,
        },
      });
      console.info("[quality-review] alternative ready", JSON.stringify({
        jobId: job.id,
        projectId: refreshed.id,
        pageNumber,
        candidateGeneratedAt: result.candidate.generatedAt,
      }));
    } catch (error) {
      const failure = await recordFailedRepair(
        project.id,
        pageNumber,
        scope,
        error,
        instruction,
        repairStrategy,
      ).catch(() => classifyQualityReviewFailure(error, scope));
      const sameRequestBlocked = failure.retrySameInstruction === false;
      updateJob(job.id, {
        status: "done",
        step: `quality:repair:page:${pageNumber}:still-required`,
        result: {
          pageNumber,
          repaired: false,
          reviewRequired: true,
          retryAvailable: startedAttemptNumber < MAX_QUALITY_REVIEW_ATTEMPTS_PER_SCOPE,
          rephraseRequired: sameRequestBlocked,
          suggestedScope: failure.suggestedScope,
          failureCode: failure.publicCode,
          repairExhausted: startedAttemptNumber >= MAX_QUALITY_REVIEW_ATTEMPTS_PER_SCOPE,
          candidateScope: scope,
        },
      });
      console.warn("[quality-review] repair remains unresolved", JSON.stringify({
        jobId: job.id,
        projectId: project.id,
        pageNumber,
        scope,
        failureCode: failure.publicCode,
      }));
    } finally {
      resolvingProjects.delete(project.id);
      if (temporaryDirectory) {
        await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => null);
      }
    }
  });
});

export default router;
