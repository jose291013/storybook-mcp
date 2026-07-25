import express from "express";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { sceneContractImagePrompt } from "../agents/storyScenePlanner.js";
import { findIllustrationStyle } from "../config/illustrationStyles.js";
import { composeBookPagePNG } from "../services/composeBookPagePNG.js";
import { getDeliveryStorage } from "../services/deliveryStorage.js";
import { readWooCustomer } from "../services/draftIdentity.js";
import { generateQualityCheckedImage } from "../services/imageQualityGate.js";
import { createJob, updateJob } from "../services/jobStore.js";
import { persistPreviewAsset, storageBodyToBuffer } from "../services/previewAssetStorage.js";
import { projectStore } from "../services/projectStore.js";
import { resolveQualityReviewPage } from "../services/qualityReviewResolution.js";
import { buildSceneContinuity } from "../services/visualContinuity.js";

const router = express.Router();
const resolvingProjects = new Set();
const MAX_CREATOR_REPAIRS_PER_PAGE = 1;

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
  const storageKey = project.previewResult?.coverImageStorageKey
    || project.previewResult?.coverStorageKey
    || project.previewResult?.draftPages?.find((page) => page.page_type === "image" && page.imageStorageKey)?.imageStorageKey;
  if (!storageKey) return "";
  const asset = await getDeliveryStorage().get(storageKey);
  const target = path.join(temporaryDirectory, "continuity-reference.png");
  await fs.writeFile(target, await storageBodyToBuffer(asset.body));
  return target;
}

async function recordFailedRepair(projectId, pageNumber, error) {
  const latest = await projectStore.get(projectId);
  if (!latest?.previewResult?.draftPages) return;
  const draftPages = latest.previewResult.draftPages.map((page) => (
    Number(page.page_number) === Number(pageNumber)
      ? {
          ...page,
          qualityReviewRepairCount: Math.max(1, Number(page.qualityReviewRepairCount || 0)),
          qualityReviewRepairFailedAt: new Date().toISOString(),
          qualityReviewRepairError: String(error?.message || error || "quality_review_repair_failed"),
        }
      : page
  ));
  await projectStore.update(projectId, {
    status: "preview_quality_review",
    previewResult: { ...latest.previewResult, draftPages },
  });
}

router.post("/projects/:id/quality-review/pages/:pageNumber/approve", async (req, res) => {
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
  if (Number(currentPage.qualityReviewRepairCount || 0) >= MAX_CREATOR_REPAIRS_PER_PAGE) {
    return res.status(409).json({ error: "The free creator-requested repair has already been used for this page" });
  }
  if (resolvingProjects.has(project.id)) {
    return res.status(409).json({ error: "A quality-review decision is already being applied" });
  }

  const startedAt = new Date().toISOString();
  const draftPages = project.previewResult.draftPages.map((page) => (
    Number(page.page_number) === pageNumber
      ? {
          ...page,
          qualityReviewRepairCount: Number(page.qualityReviewRepairCount || 0) + 1,
          qualityReviewRepairStartedAt: startedAt,
        }
      : page
  ));
  await projectStore.updateForCustomer(project.id, identity, {
    previewResult: { ...project.previewResult, draftPages },
  });
  const job = createJob({
    status: "running",
    kind: "quality_review_page_repair",
    projectId: project.id,
    pageNumber,
    step: `quality:repair:page:${pageNumber}:preparing`,
  });
  resolvingProjects.add(project.id);
  res.json({ jobId: job.id, pageNumber });

  (async () => {
    let temporaryDirectory = "";
    try {
      temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-quality-review-"));
      const refreshed = await projectStore.get(project.id);
      const refreshedPage = reviewPage(refreshed, pageNumber);
      const refreshedBlueprintPage = blueprintPage(refreshed, pageNumber);
      if (!refreshedPage || !refreshedBlueprintPage) throw new Error("Quality-review page is no longer available");

      updateJob(job.id, { step: `quality:repair:page:${pageNumber}:illustrating` });
      const referencePath = await downloadContinuityReference(refreshed, temporaryDirectory);
      const pairedTextPage = refreshed.finalBlueprint.pages?.find((page) => (
        Number(page.spread_number) === Number(refreshedBlueprintPage.spread_number)
        && ["text", "opening_text", "closing_text"].includes(page.page_type)
      ));
      const pairedText = refreshed.previewResult.draftPages?.find((page) => (
        Number(page.page_number) === Number(pairedTextPage?.page_number)
      ))?.text || "";
      const characterCanons = await usableCharacterCanons(refreshed);
      const continuity = buildSceneContinuity({
        blueprint: refreshed.finalBlueprint,
        characterCanons,
        castPresent: refreshedBlueprintPage.cast_present || [],
        scenePrompt: refreshedBlueprintPage.image_prompt,
        visualState: refreshedBlueprintPage.visual_state || {},
        continuityImagePath: referencePath,
        pairedText,
        structuredSceneContract: refreshedBlueprintPage.scene_contract || null,
      });
      const selectedStyle = findIllustrationStyle(
        refreshed.questionnaire?.style_id || refreshed.productConfiguration?.style_id,
      );
      const priorIssues = Array.isArray(refreshedPage.qualityIssues)
        ? refreshedPage.qualityIssues.join("; ")
        : "";
      const repairInstruction = `CREATOR-REQUESTED FREE QUALITY REPAIR: correct only these unresolved objective scene requirements: ${priorIssues || "the approved cast and main action"}. Preserve every other approved story, identity, outfit and rendering choice.`;
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
        size: "1024x1024",
        quality: "low",
        renderingMode: selectedStyle.renderingMode,
        likenessGoal: selectedStyle.likeness,
        model: process.env.DRAFT_IMAGE_MODEL || "gpt-image-2",
        maximumAttempts: 1,
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
      const result = await resolveQualityReviewPage({
        projectId: refreshed.id,
        identity,
        pageNumber,
        resolution: "creator_repaired",
        replacement: {
          imageUrl: persistedImage.previewUrl,
          imageStorageKey: persistedImage.storageKey,
          previewUrl: persistedPage.previewUrl,
          storageKey: persistedPage.storageKey,
          qualityReviewRepairCount: Math.max(1, Number(refreshedPage.qualityReviewRepairCount || 0)),
          qualityReviewRepairCompletedAt: new Date().toISOString(),
        },
      });
      updateJob(job.id, {
        status: "done",
        step: `quality:repair:page:${pageNumber}:done`,
        result: {
          pageNumber,
          repaired: true,
          ready: result.ready,
          remainingPages: result.remainingPages,
        },
      });
      console.info("[quality-review] page repaired", JSON.stringify({
        jobId: job.id,
        projectId: refreshed.id,
        pageNumber,
        remainingPages: result.remainingPages.map((page) => page.pageNumber),
      }));
    } catch (error) {
      await recordFailedRepair(project.id, pageNumber, error).catch(() => null);
      updateJob(job.id, {
        status: "done",
        step: `quality:repair:page:${pageNumber}:still-required`,
        result: {
          pageNumber,
          repaired: false,
          reviewRequired: true,
          repairExhausted: true,
        },
      });
      console.warn("[quality-review] repair remains unresolved", JSON.stringify({
        jobId: job.id,
        projectId: project.id,
        pageNumber,
        error: String(error?.message || error),
      }));
    } finally {
      resolvingProjects.delete(project.id);
      if (temporaryDirectory) {
        await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => null);
      }
    }
  })();
});

export default router;
