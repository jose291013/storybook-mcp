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
import { generateQualityCheckedImage } from "../services/imageQualityGate.js";
import { composeBookPagePNG } from "../services/composeBookPagePNG.js";

const router = express.Router();
const repairingProjects = new Set();
const FREE_TECHNICAL_REPAIRS_PER_PROJECT = 3;

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
  const storageKey = candidate?.imageStorageKey || candidate?.storageKey || project.previewResult?.coverImageStorageKey || project.previewResult?.coverStorageKey;
  if (!storageKey) return "";
  const asset = await getDeliveryStorage().get(storageKey);
  const body = await storageBodyToBuffer(asset.body);
  const target = path.join(temporaryDirectory, "continuity-reference.png");
  await fs.writeFile(target, body);
  return target;
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
  if (existingDraftPage.repairedAt) return res.status(409).json({ error: "This illustration has already received its free technical repair" });
  const priorRepairCount = (project.previewResult.draftPages || []).filter((page) => page.repairedAt).length;
  if (priorRepairCount >= FREE_TECHNICAL_REPAIRS_PER_PROJECT) {
    return res.status(409).json({ error: "The free technical repair limit for this preview has been reached" });
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
      temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "storybook-page-repair-"));
      const refreshed = await projectStore.get(project.id);
      const draftPages = [...(refreshed.previewResult?.draftPages || [])];
      const pairedTextPage = refreshed.finalBlueprint.pages?.find((page) => page.spread_number === blueprintPage.spread_number && ["text", "opening_text", "closing_text"].includes(page.page_type));
      const pairedText = draftPages.find((page) => Number(page.page_number) === Number(pairedTextPage?.page_number))?.text || "";
      const referencePath = await downloadContinuityReference(refreshed, blueprintPage, temporaryDirectory);
      const characterCanons = await usableCharacterCanons(refreshed);
      const continuity = buildSceneContinuity({
        blueprint: refreshed.finalBlueprint,
        characterCanons,
        castPresent: blueprintPage.cast_present || [],
        scenePrompt: blueprintPage.image_prompt,
        visualState: blueprintPage.visual_state || {},
        continuityImagePath: referencePath,
        pairedText,
      });

      updateJob(job.id, { step: `repair:page:${pageNumber}:illustrating` });
      const localImageUrl = await generateQualityCheckedImage({
        prompt: `${blueprintPage.image_prompt}\n\nTECHNICAL REPAIR: replace a corrupted preview illustration. Follow the scene contract exactly and create a complete coherent image.`,
        outName: `repair-page${pageNumber}-${job.id}`,
        castPresent: blueprintPage.cast_present || [],
        pageLabel: `repaired interior illustration for page ${pageNumber}`,
        ...continuity,
        size: "1024x1024",
        quality: "low",
        model: process.env.DRAFT_IMAGE_MODEL || "gpt-image-1-mini",
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
      const index = draftPages.findIndex((page) => Number(page.page_number) === pageNumber);
      if (index < 0) throw new Error("Preview page not found");
      draftPages[index] = {
        ...draftPages[index],
        imageUrl: persistedImage.previewUrl,
        imageStorageKey: persistedImage.storageKey,
        previewUrl: persistedPage.previewUrl,
        storageKey: persistedPage.storageKey,
        repairedAt: new Date().toISOString(),
      };
      const previewResult = { ...refreshed.previewResult, draftPages };
      await projectStore.update(refreshed.id, { status: "preview_ready", previewResult, generationJobId: job.id });
      updateJob(job.id, { status: "done", step: `repair:page:${pageNumber}:done`, result: { pageNumber } });
    } catch (error) {
      await projectStore.update(project.id, { status: "preview_ready" }).catch(() => null);
      updateJob(job.id, { status: "failed", error: String(error?.message || error) });
    } finally {
      repairingProjects.delete(project.id);
      if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => null);
    }
  })();
});

export default router;
