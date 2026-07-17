import express from "express";
import { createJob, updateJob } from "../services/jobStore.js";
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
import { createPagePlan } from "../config/bookStructure.js";
import { projectStore } from "../services/projectStore.js";
import { readWooCustomer } from "../services/draftIdentity.js";
import { creditStore, InsufficientCreditError } from "../services/creditStore.js";
import { previewEntitlementsEnabled, previewPriceCents } from "../config/previewPricing.js";
import { persistPreviewAsset } from "../services/previewAssetStorage.js";

const router = express.Router();

async function describeReferences({ photos, answers, baseUrl, jobId }) {
  const canons = [];
  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    updateJob(jobId, { step: `photo:${index + 1}/${photos.length}` });
    const isChild = photo.role === "child";
    const name = photo.name || (isChild ? answers.hero_name : `${photo.role}-${index + 1}`);
    const photoUrl = `${baseUrl}/uploads/${photo.id}`;
    const result = await photoDescriptorAgent({
      subject_name: name,
      role: photo.role,
      story_role: photo.story_role,
      relationship: photo.relationship,
      age: isChild ? answers.age : "",
      gender: isChild ? answers.gender : "",
      language: answers.language,
      photo_url: photoUrl,
    });
    canons.push({
      photoId: photo.id,
      photoUrl,
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
  const project = await projectStore.getForCustomer(projectId, identity);
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (project.status === "preview_generating") {
    return res.status(409).json({ error: "Preview generation is already in progress" });
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

  let creditReservation = null;
  if (previewEntitlementsEnabled()) {
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

  const job = createJob({
    status: "running",
    kind: "draft_book",
    referencePhotos: normalized.photos,
    projectId,
    productConfiguration: {
      page_count: normalized.answers.page_count,
      product_type: normalized.answers.product_type,
      font_style: normalized.answers.font_style,
      style_id: normalized.answers.style_id,
      universe_id: normalized.answers.universe_id,
      book_language: normalized.answers.language,
      price_eur: calculateBookPrice(normalized.answers.page_count, normalized.answers.product_type),
      unit_page_price_eur: normalized.answers.product_type === "ebook" ? EBOOK_PAGE_PRICE_EUR : PRINT_PAGE_PRICE_EUR,
      woo_variation_key: `${normalized.answers.product_type}_pages_${normalized.answers.page_count}`,
    },
  });
  await projectStore.updateForCustomer(projectId, identity, { status: "preview_generating", generationJobId: job.id });
  res.json({ jobId: job.id });

  (async () => {
    try {
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const { answers, photos } = normalized;

      updateJob(job.id, { step: "intake" });
      const intake = await intakeAgent(answers);

      const characterCanons = await describeReferences({ photos, answers, baseUrl, jobId: job.id });
      updateJob(job.id, { characterCanons });

      updateJob(job.id, { step: "heroClassifier" });
      const hero_profile = await heroClassifierAgent(intake);
      updateJob(job.id, { step: "storybrand" });
      const storybrand = await storybrandAgent({ intake, hero_profile });
      updateJob(job.id, { step: "worldBuilder" });
      const world = await worldBuilderAgent(intake);
      updateJob(job.id, { step: "style" });
      const style = await styleAgent(intake);

      updateJob(job.id, { step: "blueprint" });
      const childCanon = characterCanons.find((canon) => canon.role === "child");
      let final_blueprint = await blueprintFillerAgent({
        intake,
        hero_profile,
        storybrand,
        world,
        style,
        heroPhotoId: childCanon?.photoId,
        portraitCanonShort: childCanon?.canon_short || "",
        portraitCanonJson: childCanon?.canon_json || null,
        characterCanons,
      });

      updateJob(job.id, { step: "qa", final_blueprint });
      let qa = await qaAgent(final_blueprint);
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

      const storyContext = buildNarrativeContext({ blueprint: final_blueprint, intake, storybrand });
      const draftTextByPage = new Map();
      let previousText = "";
      for (const textPage of final_blueprint.pages.filter((page) => (
        ["text", "opening_text", "closing_text"].includes(page.page_type)
      ))) {
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
      }

      updateJob(job.id, { step: "draft:cover" });
      const coverContinuity = buildSceneContinuity({
        blueprint: final_blueprint,
        characterCanons,
        castPresent: final_blueprint.cover.cast_present || [],
        scenePrompt: final_blueprint.cover.image_prompt,
      });
      const localCoverImageUrl = await generateQualityCheckedImage({
        prompt: final_blueprint.cover.image_prompt,
        outName: `draft-cover-${job.id}`,
        castPresent: final_blueprint.cover.cast_present || [],
        pageLabel: "book cover illustration",
        ...coverContinuity,
        size: "1024x1024",
        quality: "low",
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
      const coverImageUrl = persistedCoverImage.previewUrl;
      const coverImageStorageKey = persistedCoverImage.storageKey;
      const coverPreviewUrl = persistedCover.previewUrl;
      const coverStorageKey = persistedCover.storageKey;

      const draftPages = [];
      const coverReferencePath = outputImagePath(localCoverImageUrl);
      for (const page of final_blueprint.pages) {
        updateJob(job.id, { step: `draft:page:${page.page_number}` });
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
            continuityImagePath: coverReferencePath,
            pairedText,
          });
          localImageUrl = await generateQualityCheckedImage({
            prompt: page.image_prompt,
            outName: `draft-page${page.page_number}-${job.id}`,
            castPresent: page.cast_present || [],
            pageLabel: `interior illustration for page ${page.page_number}`,
            ...sceneContinuity,
            size: "1024x1024",
            quality: "low",
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
        updateJob(job.id, { result: { coverImageUrl, coverImageStorageKey, coverPreviewUrl, coverStorageKey, draftPages: [...draftPages] } });
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
        await projectStore.update(job.projectId, {
          status: "preview_ready",
          finalBlueprint: final_blueprint,
          continuitySnapshot: { characterCanons },
          previewResult: { coverImageUrl, coverImageStorageKey, coverPreviewUrl, coverStorageKey, draftPages },
          generationJobId: job.id,
        });
      }
    } catch (error) {
      updateJob(job.id, { status: "failed", error: String(error?.message || error) });
      if (creditReservation?.id) await creditStore.releasePreview(creditReservation.id).catch(() => null);
      if (job.projectId) await projectStore.update(job.projectId, { status: "preview_failed", generationJobId: job.id });
    }
  })();
});

export default router;
