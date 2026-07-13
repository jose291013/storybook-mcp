import express from "express";
import path from "path";
import { existsSync } from "fs";
import { getJob, updateJob } from "../services/jobStore.js";
import { generateImage } from "../services/imageRunner.js";
import { composeBookPagePNG } from "../services/composeBookPagePNG.js";
import { textWriterAgent } from "../agents/textWriter.js";
import { buildNarrativeContext } from "../services/buildNarrativeContext.js";
import { buildSceneContinuity } from "../services/visualContinuity.js";

const router = express.Router();

router.post("/finalize", async (req, res) => {
  const { jobId } = req.body || {};
  if (!jobId) return res.status(400).json({ error: "Missing jobId" });

  const job = getJob(jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (!job.final_blueprint) {
    return res.status(400).json({ error: "Missing final blueprint. Generate the draft first." });
  }

  res.json({ ok: true, jobId });

  (async () => {
    try {
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const blueprint = job.final_blueprint;
      const characterCanons = job.characterCanons || [];
      const draftPages = job.result?.draftPages || [];
      const existingFinalPages = job.result?.finalPages || [];
      const finalPages = [...existingFinalPages];
      const storyContext = buildNarrativeContext({ blueprint, intake: job.intake, storybrand: job.storybrand });
      let previousText = "";

      updateJob(jobId, { status: "running", step: "final:cover" });
      let finalCoverImageUrl = job.result?.finalCoverImageUrl || "";
      let finalCoverUrl = job.result?.finalCoverUrl || "";
      const draftCoverPath = path.resolve(`data/outputs/draft-cover-${jobId}.png`);
      const finalCoverPath = path.resolve(`data/outputs/final-cover-${jobId}.png`);
      if (!finalCoverUrl) {
        const coverContinuity = buildSceneContinuity({
          blueprint,
          characterCanons,
          castPresent: blueprint.cover.cast_present || [],
          scenePrompt: blueprint.cover.image_prompt,
          continuityImagePath: existsSync(draftCoverPath) ? draftCoverPath : "",
        });
        finalCoverImageUrl = await generateImage({
          prompt: blueprint.cover.image_prompt,
          outName: `final-cover-${jobId}`,
          ...coverContinuity,
          size: "1024x1024",
          quality: process.env.FINAL_IMAGE_QUALITY || "high",
          model: process.env.FINAL_IMAGE_MODEL || "gpt-image-1",
        });
        finalCoverUrl = await composeBookPagePNG({
          baseUrl,
          imageUrl: finalCoverImageUrl,
          title: blueprint.cover.title,
          outName: `final-cover-page-${jobId}`,
          pageType: "cover",
          dpi: 300,
        });
      }

      for (const page of blueprint.pages) {
        if (finalPages.some((item) => item.page_number === page.page_number)) continue;
        updateJob(jobId, { step: `final:page:${page.page_number}` });

        const draftPage = draftPages.find((item) => item.page_number === page.page_number);
        let text = draftPage?.text || "";
        let imageUrl = "";

        if (["text", "opening_text", "closing_text"].includes(page.page_type) && !text) {
          const written = await textWriterAgent({
            language: blueprint.language,
            hero: blueprint.hero,
            page_number: page.page_number,
            page_type: page.page_type,
            story_role: page.story_role,
            text_prompt: page.text_prompt,
            story_context: storyContext,
            previous_text: previousText,
          });
          text = written.page_text.text;
        } else if (page.page_type === "image") {
          const sceneContinuity = buildSceneContinuity({
            blueprint,
            characterCanons,
            castPresent: page.cast_present || [],
            scenePrompt: page.image_prompt,
            visualState: page.visual_state || {},
            continuityImagePath: existsSync(finalCoverPath)
              ? finalCoverPath
              : (existsSync(draftCoverPath) ? draftCoverPath : ""),
          });
          imageUrl = await generateImage({
            prompt: page.image_prompt,
            outName: `final-page${page.page_number}-${jobId}`,
            ...sceneContinuity,
            size: "1024x1024",
            quality: process.env.FINAL_IMAGE_QUALITY || "high",
            model: process.env.FINAL_IMAGE_MODEL || "gpt-image-1",
          });
        }
        if (text) previousText = text;

        const printUrl = await composeBookPagePNG({
          baseUrl,
          imageUrl,
          body: text,
          outName: `final-page${page.page_number}-print-${jobId}`,
          pageType: page.page_type,
          pageNumber: page.page_number,
          dpi: 300,
        });
        finalPages.push({
          page_number: page.page_number,
          page_type: page.page_type,
          spread_number: page.spread_number,
          text,
          imageUrl,
          printUrl,
        });
        finalPages.sort((a, b) => a.page_number - b.page_number);
        updateJob(jobId, {
          result: {
            ...job.result,
            finalCoverImageUrl,
            finalCoverUrl,
            finalPages: [...finalPages],
          },
        });
      }

      updateJob(jobId, {
        status: "done",
        step: "final:done",
        result: {
          ...job.result,
          finalCoverImageUrl,
          finalCoverUrl,
          finalPages,
        },
      });
    } catch (error) {
      updateJob(jobId, { status: "failed", step: "final", error: String(error?.message || error) });
    }
  })();
});

export default router;
