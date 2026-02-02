import express from "express";
import { getJob, updateJob } from "../services/jobStore.js";
import { generateImage } from "../services/imageRunner.js";

import { textWriterAgent } from "../agents/textWriter.js";

import { composePreviewPNG } from "../services/composePreviewPNG.js";
import { composePrintPreviewPNG } from "../services/composePrintPreviewPNG.js";

const router = express.Router();

/**
 * POST /api/finalize
 * body: { jobId: "..." }
 *
 * Generates the rest of the book AFTER payment:
 * - for pages 2..24: generate image + final text + preview + print preview
 * - stores results in job.result.pages[]
 * - idempotent: if a page already exists, it skips it
 */
router.post("/finalize", async (req, res) => {
  const { jobId } = req.body || {};
  if (!jobId) return res.status(400).json({ error: "Missing jobId" });

  const job = getJob(jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  const final_blueprint = job.final_blueprint;
  if (!final_blueprint || typeof final_blueprint !== "object") {
    return res.status(400).json({ error: "Missing final_blueprint on job. Run /preview first." });
  }

  // Respond immediately (async job)
  res.json({ ok: true, jobId });

  // Run async in background like preview.js
  (async () => {
    try {
      const baseUrl = process.env.BASE_URL || "https://storybook-mcp.onrender.com";
      const characterFingerprint = job.characterFingerprint || "";

      // Ensure result container
      const currentResult = job.result || {};
      const pagesResults = Array.isArray(currentResult.pages) ? currentResult.pages : [];

      // Helper: check if page already generated
      const hasPage = (n) => pagesResults.some((p) => p && p.page_number === n);

      // Determine which pages to generate (default 2..24)
      const allPages = Array.isArray(final_blueprint.pages) ? final_blueprint.pages : [];
      const pagesToGenerate = allPages
        .filter((p) => p && typeof p.page_number === "number" && p.page_number >= 2)
        .sort((a, b) => a.page_number - b.page_number);

      updateJob(jobId, { status: "running", step: "finalize:start" });

      for (const p of pagesToGenerate) {
        const pageNumber = p.page_number;

        if (hasPage(pageNumber)) {
          // skip already done
          continue;
        }

        // 1) Generate final text for this page
        updateJob(jobId, { step: `finalize:text:page${pageNumber}` });

        const pageText = await textWriterAgent({
          language: final_blueprint.language,
          hero: final_blueprint.hero,
          page_number: pageNumber,
          story_role: p.story_role || "",
          text_prompt: p.text_prompt || "",
        });

        const pageTextFinal = pageText?.page_text?.text || "";

        // 2) Generate image
        updateJob(jobId, { step: `finalize:image:page${pageNumber}` });

        const pageImageUrl = await generateImage({
          prompt: p.image_prompt || "",
          outName: `page${pageNumber}-${jobId}`,
          characterFingerprint,
        });

        // 3) Compose e-commerce preview PNG (text on image)
        updateJob(jobId, { step: `finalize:compose:page${pageNumber}` });

        const pagePreviewUrl = await composePreviewPNG({
          baseUrl,
          imageUrl: pageImageUrl,
          title: "",
          body: pageTextFinal,
          outName: `page${pageNumber}_preview-${jobId}`,
        });

        // 4) Compose PRINT preview PNG
        updateJob(jobId, { step: `finalize:compose:page${pageNumber}_print` });

        const pagePrintPreviewUrl = await composePrintPreviewPNG({
          baseUrl,
          imageUrl: pageImageUrl,
          title: "",
          body: pageTextFinal,
          outName: `page${pageNumber}_print_${jobId}`,
          paper: "A5",
          dpi: 150,
          layout: "page",
        });

        // 5) Save page result
        pagesResults.push({
          page_number: pageNumber,
          imageUrl: pageImageUrl,
          previewUrl: pagePreviewUrl,
          printPreviewUrl: pagePrintPreviewUrl,
          text: pageTextFinal,
        });

        // Keep sorted
        pagesResults.sort((a, b) => a.page_number - b.page_number);

        updateJob(jobId, {
          result: {
            ...currentResult,
            pages: pagesResults,
          },
          step: `finalize:page${pageNumber}:done`,
        });
      }

      updateJob(jobId, { status: "done", step: "finalize:done" });
    } catch (err) {
      updateJob(jobId, { status: "failed", step: "finalize", error: String(err?.message || err) });
    }
  })();
});

export default router;
