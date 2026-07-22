import express from "express";
import { createJob, getJob, updateJob } from "../services/jobStore.js";
import { generateQualityCheckedImage, outputImagePath } from "../services/imageQualityGate.js";
import { normalizeBookRequest } from "../services/normalizeBookRequest.js";
import { composeBookPagePNG } from "../services/composeBookPagePNG.js";
import { buildNarrativeContext } from "../services/buildNarrativeContext.js";
import { buildSceneContinuity } from "../services/visualContinuity.js";
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
import { textWriterAgent } from "../agents/textWriter.js";
import { sceneContractImagePrompt, storyScenePlannerAgent } from "../agents/storyScenePlanner.js";
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
import { notifyPreviewReady } from "../services/previewNotification.js";
import { approvedStoryScenario, storyScenarioRequired } from "../services/storyScenario.js";

const router = express.Router();

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

function reportImageAttempt(jobId, stepPrefix) {
  return ({ phase, attempt, maximumAttempts, error = "", issues = [] }) => {
    const step = `${stepPrefix}:attempt:${attempt}/${maximumAttempts}:${phase}`;
    updateJob(jobId, { step });
    console.info("[preview] image", JSON.stringify({ jobId, step, error: error || undefined, issues: issues.length ? issues : undefined }));
  };
}

async function recoverAbandonedPreview({ project, identity }) {
  const existingJob = project.generationJobId ? getJob(project.generationJobId) : null;
  if (existingJob && !["done", "failed"].includes(existingJob.status)) {
    updateJob(existingJob.id, { status: "failed", step: "preview:abandoned", error: "Preview generation became unresponsive" });
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
  const visualProofAction = String(req.body?.visualProofAction || "");
  const pendingVisualProof = generationCheckpoint(project)?.visualProof;
  if (project.status === "preview_generating") {
    const existingJob = project.generationJobId ? getJob(project.generationJobId) : null;
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
      const visualProof = {
        ...pendingVisualProof,
        status: visualProofAction === "approve" ? "approved" : "regenerating",
        ...(visualProofAction === "approve" ? { approvedAt: new Date().toISOString() } : { regenerationRequestedAt: new Date().toISOString() }),
      };
      const previewResult = visualProofAction === "regenerate"
        ? { ...(project.previewResult || {}), coverImageUrl: "", coverImageStorageKey: "", coverPreviewUrl: "", coverStorageKey: "" }
        : project.previewResult;
      project = await projectStore.updateForCustomer(projectId, identity, {
        generationJobId: null,
        previewResult,
        continuitySnapshot: mergeGenerationCheckpoint(project.continuitySnapshot, {
          ...generationCheckpoint(project),
          visualProof,
        }),
      }) || project;
    } else if (isActivePreviewJob(existingJob)) {
      return res.json({ jobId: existingJob.id, resumed: true });
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
  await projectStore.updateForCustomer(projectId, identity, {
    status: "preview_generating",
    generationJobId: job.id,
    continuitySnapshot: initialSnapshot,
    previewResult: existingCheckpoint ? project.previewResult : null,
    finalBlueprint: existingCheckpoint ? project.finalBlueprint : null,
  });
  console.info("[preview] started", JSON.stringify({ jobId: job.id, projectId, pageCount: normalized.answers.page_count }));
  res.json({ jobId: job.id });

  (async () => {
    try {
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const { answers, photos } = normalized;

      const persistCheckpoint = async (patch, projectPatch = {}) => {
        const latest = await projectStore.get(job.projectId);
        checkpoint = { ...checkpoint, ...patch, fingerprint };
        return projectStore.update(job.projectId, {
          ...projectPatch,
          continuitySnapshot: mergeGenerationCheckpoint(latest?.continuitySnapshot || project.continuitySnapshot, checkpoint),
        });
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
      const storybrand = checkpoint.storybrand || await storybrandAgent({ intake, hero_profile, approvedScenario });
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
      if (!checkpoint.finalBlueprint) await persistCheckpoint({ finalBlueprint: final_blueprint, phase: "blueprint" }, { finalBlueprint: final_blueprint });

      const storyContext = buildNarrativeContext({ blueprint: final_blueprint, intake, storybrand, approvedScenario });
      const draftTextByPage = new Map(Object.entries(checkpoint.draftTexts || {}).map(([page, text]) => [Number(page), text]));
      let previousText = "";
      for (const textPage of final_blueprint.pages.filter((page) => (
        ["text", "opening_text", "closing_text"].includes(page.page_type)
      ))) {
        if (draftTextByPage.has(textPage.page_number)) {
          previousText = draftTextByPage.get(textPage.page_number);
          continue;
        }
        updateJob(job.id, { step: `draft:text:page:${textPage.page_number}` });
        const written = await textWriterAgent({
          language: final_blueprint.language,
          hero: final_blueprint.hero,
          page_number: textPage.page_number,
          page_type: textPage.page_type,
          story_role: textPage.story_role,
          text_prompt: textPage.text_prompt,
          story_context: storyContext,
          previous_text: previousText,
        });
        const text = written.page_text.text;
        draftTextByPage.set(textPage.page_number, text);
        previousText = text;
        await persistCheckpoint({ draftTexts: Object.fromEntries(draftTextByPage), phase: `text:${textPage.page_number}` });
      }

      updateJob(job.id, { step: "story:coherence-and-scene-contracts" });
      let storyScenePlan = checkpoint.storyScenePlan;
      if (!storyScenePlan) {
        const storyScenePlanStartedAt = Date.now();
        console.info("[preview] story scene plan started", JSON.stringify({
          jobId: job.id,
          projectId,
          pageCount: final_blueprint.pages.length,
          spreadCount: final_blueprint.pages.filter((page) => page.page_type === "image").length,
        }));
        storyScenePlan = await storyScenePlannerAgent({
          blueprint: final_blueprint,
          pageTexts: Object.fromEntries(draftTextByPage),
          characterCanons,
          approvedScenario,
        });
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
      if (!checkpoint.storyScenePlan) {
        await persistCheckpoint({
          storyScenePlan,
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
          referenceAssets,
        });
        localCoverImageUrl = await generateQualityCheckedImage({
          prompt: final_blueprint.cover.image_prompt,
          outName: `draft-cover-${job.id}`,
          castPresent: final_blueprint.cover.cast_present || [],
          pageLabel: "book cover illustration",
          onAttempt: reportImageAttempt(job.id, "draft:cover"),
          ...coverContinuity,
          size: "1024x1024",
          quality: "medium",
          renderingMode: answers.rendering_mode,
          likenessGoal: answers.likeness_goal,
          model: process.env.DRAFT_IMAGE_MODEL || "gpt-image-1-mini",
        });
        const localCoverPreviewUrl = await composeBookPagePNG({
          baseUrl,
          imageUrl: localCoverImageUrl,
          title: final_blueprint.cover.title,
          outName: `draft-cover-page-${job.id}`,
          pageType: "cover",
          dpi: 150,
        });
        const persistedCoverImage = await persistPreviewAsset({ projectId, assetUrl: localCoverImageUrl });
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
        console.info("[preview] visual proof awaiting approval", JSON.stringify({ jobId: job.id, projectId, attempts: visualProof.attempts, styleId: answers.style_id }));
        return;
      }

      const draftPages = (priorResult.draftPages || []).filter(isReusableDraftPage);
      const completedPageNumbers = new Set(draftPages.map((page) => Number(page.page_number)));
      const coverReferencePath = localCoverImageUrl ? outputImagePath(localCoverImageUrl) : "";
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

        if (["text", "opening_text", "closing_text"].includes(page.page_type)) {
          text = draftTextByPage.get(page.page_number) || "";
        } else if (page.page_type === "image") {
          const pairedTextPage = final_blueprint.pages.find((candidate) => (
            candidate.spread_number === page.spread_number
            && ["text", "opening_text", "closing_text"].includes(candidate.page_type)
          ));
          const pairedText = pairedTextPage ? draftTextByPage.get(pairedTextPage.page_number) || "" : "";
          const sceneContinuity = buildSceneContinuity({
            blueprint: final_blueprint,
            characterCanons,
            castPresent: page.cast_present || [],
            scenePrompt: page.image_prompt,
            visualState: page.visual_state || {},
            ...(coverReferencePath ? { continuityImagePath: coverReferencePath } : {}),
            ...(!coverReferencePath && coverImageStorageKey ? { continuityImageStorageKey: coverImageStorageKey } : {}),
            pairedText,
            structuredSceneContract: page.scene_contract || null,
            referenceAssets,
          });
          localImageUrl = await generateQualityCheckedImage({
            prompt: sceneContractImagePrompt({
              contract: page.scene_contract,
              stylePrompt: final_blueprint.style?.style_prompt || final_blueprint.style?.prompt || "",
              fallbackPrompt: page.image_prompt,
            }),
            outName: `draft-page${page.page_number}-${job.id}`,
            castPresent: page.cast_present || [],
            pageLabel: `interior illustration for page ${page.page_number}`,
            onAttempt: reportImageAttempt(job.id, `draft:page:${page.page_number}`),
            ...sceneContinuity,
            size: "1024x1024",
            quality: "low",
            renderingMode: answers.rendering_mode,
            likenessGoal: answers.likeness_goal,
            model: process.env.DRAFT_IMAGE_MODEL || "gpt-image-1-mini",
          });
          const persistedImage = await persistPreviewAsset({ projectId, assetUrl: localImageUrl });
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
        });
        draftPages.sort((left, right) => Number(left.page_number) - Number(right.page_number));
        completedPageNumbers.add(Number(page.page_number));
        const partialResult = { coverImageUrl, coverImageStorageKey, coverPreviewUrl, coverStorageKey, draftPages: [...draftPages] };
        updateJob(job.id, { result: partialResult });
        await persistCheckpoint({ phase: `page:${page.page_number}` }, { previewResult: partialResult, finalBlueprint: final_blueprint });
      }

      updateJob(job.id, {
        status: "done",
        step: "draft:done",
        intake,
        storybrand,
        final_blueprint,
        result: { coverImageUrl, coverImageStorageKey, coverPreviewUrl, coverStorageKey, draftPages },
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
      }
    }
  })();
});

export default router;
