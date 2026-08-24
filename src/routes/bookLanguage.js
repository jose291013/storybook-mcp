import express from "express";
import { manuscriptTranslatorAgent } from "../agents/manuscriptTranslator.js";
import { composeBookPagePNG } from "../services/composeBookPagePNG.js";
import { readWooCustomer } from "../services/draftIdentity.js";
import { getDeliveryStorage } from "../services/deliveryStorage.js";
import { createJob, updateJob } from "../services/jobStore.js";
import { withOpenAICostContext } from "../services/openaiCostContext.js";
import { persistPreviewAsset, storageBodyToBuffer } from "../services/previewAssetStorage.js";
import { generationCheckpoint, mergeGenerationCheckpoint } from "../services/previewGenerationCheckpoint.js";
import { projectStore } from "../services/projectStore.js";
import { guardChildSafety } from "../services/childSafety.js";
import {
  assertManuscriptLanguage,
  bookLanguageStatus,
} from "../services/bookLanguage.js";

const router = express.Router();
const repairingProjects = new Set();
const TEXT_PAGE_TYPES = new Set(["text", "opening_text", "closing_text"]);

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

function dataUrl(buffer, contentType = "image/png") {
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

router.post("/projects/:id/book-language-repair", async (req, res) => {
  const identity = requireIdentity(req, res);
  if (!identity) return;
  const project = await projectStore.getForCustomer(req.params.id, identity);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const languageStatus = bookLanguageStatus(project);
  if (!languageStatus.repairAvailable) {
    return res.status(409).json({ error: "This book does not require an available language repair", languageStatus });
  }
  if (repairingProjects.has(project.id)) {
    return res.status(409).json({ error: "The book language is already being repaired" });
  }

  const job = createJob({
    status: "running",
    kind: "book_language_repair",
    projectId: project.id,
    step: "language-repair:translating",
  });
  repairingProjects.add(project.id);
  res.status(202).json({ jobId: job.id, language: languageStatus.expectedLanguage });

  withOpenAICostContext({
    projectId: project.id,
    runId: job.id,
    workflow: "language_repair",
    attemptKind: "technical_repair",
    getStage: () => "book-language-repair",
  }, async () => {
    try {
      const latest = await projectStore.get(project.id);
      const latestStatus = bookLanguageStatus(latest);
      if (!latestStatus.repairAvailable) throw new Error("The language repair is no longer available");
      const textPages = (latest.previewResult?.draftPages || [])
        .filter((page) => TEXT_PAGE_TYPES.has(page.page_type))
        .map((page) => ({ page_number: Number(page.page_number), text: String(page.text || "") }));
      const translated = await manuscriptTranslatorAgent({
        language: latestStatus.expectedLanguage,
        coverTitle: latest.finalBlueprint?.cover?.title || latest.title || "",
        pages: textPages,
        canonicalCharacters: [
          ...(latest.continuitySnapshot?.characterCanons || []),
          { name: latest.finalBlueprint?.hero?.name, role: "child", relationship: "hero" },
          ...(latest.finalBlueprint?.cast || []),
        ].filter((character) => character?.name),
      });
      assertManuscriptLanguage(translated.pages, latestStatus.expectedLanguage);
      const safety = await guardChildSafety({
        text: translated.pages.map((page) => page.text).join("\n"),
        childAge: Number(latest.questionnaire?.age),
        locale: latestStatus.expectedLanguage,
        scope: "language_repaired_manuscript",
      });
      if (safety.intervention) {
        const error = new Error("The repaired manuscript requires child-safety review");
        error.code = "language_repair_safety_review";
        throw error;
      }

      updateJob(job.id, { step: "language-repair:composing" });
      const translatedByPage = new Map(translated.pages.map((page) => [page.page_number, page.text]));
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const draftPages = [];
      for (const page of latest.previewResult.draftPages || []) {
        if (!TEXT_PAGE_TYPES.has(page.page_type)) {
          draftPages.push(page);
          continue;
        }
        const text = translatedByPage.get(Number(page.page_number));
        const composedUrl = await composeBookPagePNG({
          baseUrl,
          body: text,
          outName: `language-repair-page${page.page_number}-${job.id}`,
          pageType: page.page_type,
          pageNumber: Number(page.page_number),
          fontStyle: latest.finalBlueprint?.typography?.id,
          readerAge: latest.finalBlueprint?.hero?.age,
          bookFormat: latest.finalBlueprint?.format,
          dpi: 150,
        });
        const persisted = await persistPreviewAsset({ projectId: latest.id, assetUrl: composedUrl });
        draftPages.push({
          ...page,
          text,
          previewUrl: persisted.previewUrl,
          storageKey: persisted.storageKey,
          languageRepairedAt: new Date().toISOString(),
        });
      }

      let previewResult = { ...latest.previewResult, draftPages };
      const priorTitle = String(latest.finalBlueprint?.cover?.title || "");
      const coverTitle = translated.coverTitle || priorTitle;
      if (coverTitle !== priorTitle && latest.previewResult?.coverImageStorageKey) {
        const coverImage = await getDeliveryStorage().get(latest.previewResult.coverImageStorageKey);
        const coverPageUrl = await composeBookPagePNG({
          baseUrl,
          imageUrl: dataUrl(await storageBodyToBuffer(coverImage.body), coverImage.contentType || "image/png"),
          title: coverTitle,
          outName: `language-repair-cover-${job.id}`,
          pageType: "cover",
          bookFormat: latest.finalBlueprint?.format,
          dpi: 150,
        });
        const persistedCover = await persistPreviewAsset({ projectId: latest.id, assetUrl: coverPageUrl });
        previewResult = {
          ...previewResult,
          coverPreviewUrl: persistedCover.previewUrl,
          coverStorageKey: persistedCover.storageKey,
        };
      }

      const checkpoint = generationCheckpoint(latest) || {};
      const repairedPageTexts = {
        ...(checkpoint.storyScenePlan?.pageTexts || {}),
        ...Object.fromEntries(translated.pages.map((page) => [page.page_number, page.text])),
      };
      const finalBlueprint = {
        ...latest.finalBlueprint,
        language: latestStatus.expectedLanguage,
        cover: { ...latest.finalBlueprint.cover, title: coverTitle },
      };
      const continuitySnapshot = mergeGenerationCheckpoint(latest.continuitySnapshot || {}, {
        ...checkpoint,
        draftTexts: repairedPageTexts,
        ...(checkpoint.storyScenePlan ? {
          storyScenePlan: { ...checkpoint.storyScenePlan, pageTexts: repairedPageTexts },
        } : {}),
        languageRepair: {
          from: latestStatus.detectedLanguage || latestStatus.blueprintLanguage,
          to: latestStatus.expectedLanguage,
          completedAt: new Date().toISOString(),
        },
      });
      const updated = await projectStore.update(latest.id, {
        questionnaire: {
          ...latest.questionnaire,
          language: latestStatus.expectedLanguage,
          book_language: latestStatus.expectedLanguage,
        },
        productConfiguration: {
          ...latest.productConfiguration,
          book_language: latestStatus.expectedLanguage,
        },
        finalBlueprint,
        previewResult,
        continuitySnapshot,
      });
      updateJob(job.id, {
        status: "done",
        step: "language-repair:done",
        result: {
          projectId: latest.id,
          language: latestStatus.expectedLanguage,
          projectStatus: updated.status,
        },
      });
      console.info("[book-language] repaired", JSON.stringify({
        jobId: job.id,
        projectId: latest.id,
        language: latestStatus.expectedLanguage,
        pageCount: translated.pages.length,
      }));
    } catch (error) {
      updateJob(job.id, {
        status: "failed",
        step: "language-repair:failed",
        error: String(error?.message || error),
      });
      console.error("[book-language] repair failed", JSON.stringify({
        jobId: job.id,
        projectId: project.id,
        code: String(error?.code || "book_language_repair_failed"),
        error: String(error?.message || error),
      }));
    } finally {
      repairingProjects.delete(project.id);
    }
  });
});

export default router;
