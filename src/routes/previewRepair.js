import express from "express";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { createJob, getJob, updateJob } from "../services/jobStore.js";
import { readWooCustomer } from "../services/draftIdentity.js";
import { projectStore } from "../services/projectStore.js";
import { getDeliveryStorage } from "../services/deliveryStorage.js";
import { persistPreviewAsset, storageBodyToBuffer } from "../services/previewAssetStorage.js";
import { buildSceneContinuity } from "../services/visualContinuity.js";
import { generateQualityCheckedImage, inspectGeneratedIllustration, inspectStyleConsistency } from "../services/imageQualityGate.js";
import { composeBookPagePNG } from "../services/composeBookPagePNG.js";
import { sceneContractImagePrompt } from "../agents/storyScenePlanner.js";
import { findIllustrationStyle } from "../config/illustrationStyles.js";

const router = express.Router();
const repairingProjects = new Set();
const FREE_TECHNICAL_CHECKS_PER_PROJECT = 3;
const FREE_TECHNICAL_REPAIRS_PER_PROJECT = 3;
const TECHNICAL_CHECK_POLICY_VERSION = 3;
const MAX_FAILED_REPAIR_ATTEMPTS_PER_PAGE = 2;

function repairFailureCode(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (message.includes("safety system") || message.includes("safety rejection")) return "image_safety_rejection";
  if (message.includes("style consistency") || message.includes("rendering medium")) return "style_continuity_failed";
  if (message.includes("timeout") || message.includes("timed out")) return "upstream_timeout";
  return "technical_repair_failed";
}

function logRepair(event, details) {
  console.log(`[preview-repair] ${event}`, JSON.stringify(details));
}

function names(values = []) {
  return new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean));
}

function chooseReferencePage(project, targetBlueprintPage) {
  const blueprintPages = new Map((project.finalBlueprint?.pages || []).map((page) => [Number(page.page_number), page]));
  const targetCast = names(targetBlueprintPage.cast_present);
  return (project.previewResult?.draftPages || [])
    .filter((page) => page.page_type === "image" && Number(page.page_number) !== Number(targetBlueprintPage.page_number) && (page.imageStorageKey || page.storageKey))
    .map((page) => {
      const candidateCast = names(blueprintPages.get(Number(page.page_number))?.cast_present);
      const sharedCast = [...targetCast].filter((name) => candidateCast.has(name)).length;
      const distance = Math.abs(Number(page.page_number) - Number(targetBlueprintPage.page_number));
      return { page, score: (sharedCast * 1000) - distance };
    })
    .sort((left, right) => right.score - left.score)[0]?.page || null;
}

async function usableCharacterCanons(project) {
  const persisted = project.continuitySnapshot?.characterCanons;
  const fromJob = project.generationJobId ? getJob(project.generationJobId)?.characterCanons : null;
  const canons = Array.isArray(persisted) ? persisted : (Array.isArray(fromJob) ? fromJob : []);
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

async function downloadContinuityReference(project, blueprintPage, temporaryDirectory) {
  const candidate = chooseReferencePage(project, blueprintPage);
  const storageKey = project.previewResult?.coverImageStorageKey || project.previewResult?.coverStorageKey || candidate?.imageStorageKey || candidate?.storageKey;
  if (!storageKey) return "";
  const asset = await getDeliveryStorage().get(storageKey);
  const body = await storageBodyToBuffer(asset.body);
  const target = path.join(temporaryDirectory, "continuity-reference.png");
  await fs.writeFile(target, body);
  return target;
}

async function downloadStoredPreviewAsset(storageKey, targetPath) {
  if (!storageKey) throw new Error("The existing preview image is unavailable");
  const asset = await getDeliveryStorage().get(storageKey);
  const body = await storageBodyToBuffer(asset.body);
  await fs.writeFile(targetPath, body);
  return targetPath;
}

router.post("/projects/:id/preview-pages/:pageNumber/repair", async (req, res) => {
  let identity;
  try { identity = readWooCustomer(req); }
  catch (error) { return res.status(401).json({ error: String(error?.message || error) }); }
  if (!identity) return res.status(401).json({ error: "Authentication required" });

  const project = await projectStore.getForCustomer(req.params.id, identity);
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (project.status === "purchased") return res.status(409).json({ error: "A purchased revision cannot be overwritten" });
  if (!["preview_ready", "preview_repairing"].includes(project.status) || !project.previewResult || !project.finalBlueprint) {
    return res.status(409).json({ error: "A completed preview is required" });
  }
  if (repairingProjects.has(project.id)) return res.status(409).json({ error: "An illustration repair is already in progress" });

  const pageNumber = Number.parseInt(req.params.pageNumber, 10);
  const blueprintPage = project.finalBlueprint.pages?.find((page) => Number(page.page_number) === pageNumber);
  if (!blueprintPage || blueprintPage.page_type !== "image") return res.status(400).json({ error: "Only an illustration page can be repaired" });
  const existingDraftPage = project.previewResult.draftPages?.find((page) => Number(page.page_number) === pageNumber);
  if (!existingDraftPage) return res.status(404).json({ error: "Preview page not found" });
  if (Number(existingDraftPage.technicalRepairFailureCount || 0) >= MAX_FAILED_REPAIR_ATTEMPTS_PER_PAGE) {
    return res.status(409).json({ error: "The bounded repair attempts for this page have been exhausted" });
  }
  if (existingDraftPage.repairedAt || (existingDraftPage.technicalCheckAt && Number(existingDraftPage.technicalCheckPolicyVersion || 1) >= TECHNICAL_CHECK_POLICY_VERSION)) {
    return res.status(409).json({ error: "This page has already received its one-time technical check" });
  }
  const priorCheckCount = (project.previewResult.draftPages || []).filter((page) => (
    page.repairedAt || (page.technicalCheckAt && Number(page.technicalCheckPolicyVersion || 1) >= TECHNICAL_CHECK_POLICY_VERSION)
  )).length;
  if (priorCheckCount >= FREE_TECHNICAL_CHECKS_PER_PROJECT) {
    return res.status(409).json({ error: "The technical-check limit for this preview has been reached" });
  }

  const priorCharacterCanons = project.continuitySnapshot?.characterCanons
    || (project.generationJobId ? getJob(project.generationJobId)?.characterCanons : null)
    || [];
  const job = createJob({
    status: "running",
    kind: "preview_page_repair",
    projectId: project.id,
    pageNumber,
    step: `repair:page:${pageNumber}:preparing`,
    characterCanons: priorCharacterCanons,
  });
  repairingProjects.add(project.id);
  await projectStore.updateForCustomer(project.id, identity, { status: "preview_repairing", generationJobId: job.id });
  res.json({ jobId: job.id, pageNumber });

  (async () => {
    let temporaryDirectory = "";
    try {
      logRepair("started", { jobId: job.id, projectId: project.id, pageNumber });
      temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-page-repair-"));
      const refreshed = await projectStore.get(project.id);
      const draftPages = [...(refreshed.previewResult?.draftPages || [])];
      const index = draftPages.findIndex((page) => Number(page.page_number) === pageNumber);
      if (index < 0) throw new Error("Preview page not found");

      updateJob(job.id, { step: `repair:page:${pageNumber}:checking` });
      const existingStorageKey = draftPages[index].imageStorageKey || draftPages[index].storageKey;
      const existingImagePath = await downloadStoredPreviewAsset(
        existingStorageKey,
        path.join(temporaryDirectory, "existing-preview.png"),
      );
      const referencePath = await downloadContinuityReference(refreshed, blueprintPage, temporaryDirectory);
      const fileInspection = await inspectGeneratedIllustration({
        imagePath: existingImagePath,
        pageLabel: `existing composed preview page ${pageNumber}; its small preview watermark and page-number badge are expected`,
      });
      const styleInspection = fileInspection.approved
        ? await inspectStyleConsistency({
          imagePath: existingImagePath,
          styleReference: referencePath ? { path: referencePath, kind: "continuity" } : null,
          pageLabel: `existing preview illustration for page ${pageNumber}`,
        })
        : { approved: false, issues: [] };
      const technicalInspection = fileInspection.approved ? styleInspection : fileInspection;
      logRepair("inspected", {
        jobId: job.id,
        projectId: project.id,
        pageNumber,
        fileApproved: fileInspection.approved,
        styleApproved: styleInspection.approved,
        issues: technicalInspection.issues,
      });
      const technicalCheckAt = new Date().toISOString();
      draftPages[index] = {
        ...draftPages[index],
        technicalCheckAt,
        technicalCheckPolicyVersion: TECHNICAL_CHECK_POLICY_VERSION,
        technicalCheckResult: technicalInspection.approved ? "passed" : "defective",
        technicalCheckIssues: technicalInspection.issues,
      };
      let previewResult = { ...refreshed.previewResult, draftPages };
      await projectStore.update(refreshed.id, { previewResult });

      if (technicalInspection.approved) {
        await projectStore.update(refreshed.id, { status: "preview_ready", previewResult, generationJobId: job.id });
        updateJob(job.id, {
          status: "done",
          step: `repair:page:${pageNumber}:no-defect`,
          result: { pageNumber, repaired: false, technicalDefect: false },
        });
        logRepair("no-defect", { jobId: job.id, projectId: project.id, pageNumber });
        return;
      }

      const priorDefectCount = draftPages.filter((page, pageIndex) => (
        pageIndex !== index && (page.technicalCheckResult === "defective" || page.repairedAt)
      )).length;
      if (priorDefectCount >= FREE_TECHNICAL_REPAIRS_PER_PROJECT) {
        await projectStore.update(refreshed.id, { status: "preview_ready", previewResult, generationJobId: job.id });
        updateJob(job.id, {
          status: "done",
          step: `repair:page:${pageNumber}:repair-limit`,
          result: { pageNumber, repaired: false, technicalDefect: true, repairLimitReached: true },
        });
        logRepair("repair-limit", { jobId: job.id, projectId: project.id, pageNumber });
        return;
      }

      const pairedTextPage = refreshed.finalBlueprint.pages?.find((page) => page.spread_number === blueprintPage.spread_number && ["text", "opening_text", "closing_text"].includes(page.page_type));
      const pairedText = draftPages.find((page) => Number(page.page_number) === Number(pairedTextPage?.page_number))?.text || "";
      const characterCanons = await usableCharacterCanons(refreshed);
      const continuity = buildSceneContinuity({
        blueprint: refreshed.finalBlueprint,
        characterCanons,
        castPresent: blueprintPage.cast_present || [],
        scenePrompt: blueprintPage.image_prompt,
        visualState: blueprintPage.visual_state || {},
        continuityImagePath: referencePath,
        pairedText,
        structuredSceneContract: blueprintPage.scene_contract || null,
      });

      updateJob(job.id, { step: `repair:page:${pageNumber}:illustrating` });
      const selectedStyle = findIllustrationStyle(refreshed.questionnaire?.style_id || refreshed.productConfiguration?.style_id);
      const technicalRepairInstruction = "TECHNICAL REPAIR: replace an illustration with an objective production defect. Follow the compact visual specification and continuity reference exactly.";
      const localImageUrl = await generateQualityCheckedImage({
        prompt: `${sceneContractImagePrompt({
          contract: blueprintPage.scene_contract,
          stylePrompt: refreshed.finalBlueprint.style?.style_prompt || refreshed.finalBlueprint.style?.prompt || "",
          fallbackPrompt: blueprintPage.image_prompt,
          visualAliases: continuity.visualAliases,
        })}\n\n${technicalRepairInstruction}`,
        safetyFallbackPrompt: `${sceneContractImagePrompt({
          contract: blueprintPage.scene_contract,
          stylePrompt: refreshed.finalBlueprint.style?.style_prompt || refreshed.finalBlueprint.style?.prompt || "",
          fallbackPrompt: blueprintPage.image_prompt,
          visualAliases: continuity.visualAliases,
          safetyFallback: true,
        })}\n\n${technicalRepairInstruction}`,
        outName: `repair-page${pageNumber}-${job.id}`,
        castPresent: blueprintPage.cast_present || [],
        pageLabel: `repaired interior illustration for page ${pageNumber}`,
        ...continuity,
        size: "1024x1024",
        quality: "low",
        renderingMode: selectedStyle.renderingMode,
        likenessGoal: selectedStyle.likeness,
        model: process.env.DRAFT_IMAGE_MODEL || "gpt-image-2",
        maximumAttempts: 2,
      });
      const persistedImage = await persistPreviewAsset({ projectId: refreshed.id, assetUrl: localImageUrl });

      updateJob(job.id, { step: `repair:page:${pageNumber}:layout` });
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const localPreviewUrl = await composeBookPagePNG({
        baseUrl,
        imageUrl: localImageUrl,
        outName: `repair-page${pageNumber}-layout-${job.id}`,
        pageType: "image",
        pageNumber,
        fontStyle: refreshed.finalBlueprint.typography?.id,
        readerAge: refreshed.finalBlueprint.hero?.age,
        dpi: 150,
      });
      const persistedPage = await persistPreviewAsset({ projectId: refreshed.id, assetUrl: localPreviewUrl });
      draftPages[index] = {
        ...draftPages[index],
        imageUrl: persistedImage.previewUrl,
        imageStorageKey: persistedImage.storageKey,
        previewUrl: persistedPage.previewUrl,
        storageKey: persistedPage.storageKey,
        repairedAt: new Date().toISOString(),
      };
      previewResult = { ...refreshed.previewResult, draftPages };
      await projectStore.update(refreshed.id, { status: "preview_ready", previewResult, generationJobId: job.id });
      updateJob(job.id, { status: "done", step: `repair:page:${pageNumber}:done`, result: { pageNumber, repaired: true, technicalDefect: true } });
      logRepair("done", { jobId: job.id, projectId: project.id, pageNumber });
    } catch (error) {
      const errorMessage = String(error?.message || error);
      const errorCode = repairFailureCode(error);
      const latest = await projectStore.get(project.id).catch(() => null);
      if (latest?.previewResult?.draftPages) {
        const draftPages = latest.previewResult.draftPages.map((page) => {
          if (Number(page.page_number) !== pageNumber || page.repairedAt) return page;
          return {
            ...page,
            technicalCheckAt: null,
            technicalCheckPolicyVersion: null,
            technicalCheckResult: null,
            technicalCheckIssues: [],
            technicalRepairFailureAt: new Date().toISOString(),
            technicalRepairFailureCount: Number(page.technicalRepairFailureCount || 0) + 1,
            technicalRepairFailureCode: errorCode,
          };
        });
        await projectStore.update(project.id, {
          status: "preview_ready",
          previewResult: { ...latest.previewResult, draftPages },
          generationJobId: job.id,
        }).catch(() => null);
      } else {
        await projectStore.update(project.id, { status: "preview_ready", generationJobId: job.id }).catch(() => null);
      }
      console.error("[preview-repair] failed", JSON.stringify({
        jobId: job.id,
        projectId: project.id,
        pageNumber,
        step: getJob(job.id)?.step,
        errorCode,
        error: errorMessage,
      }));
      updateJob(job.id, { status: "failed", error: errorMessage, errorCode });
    } finally {
      repairingProjects.delete(project.id);
      if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => null);
    }
  })();
});

export default router;
