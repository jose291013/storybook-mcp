import express from "express";
import { getJob, updateJob } from "../services/jobStore.js";
import { generateImage } from "../services/imageRunner.js";
import { composeBookPagePNG } from "../services/composeBookPagePNG.js";
import { textWriterAgent } from "../agents/textWriter.js";

const router = express.Router();

function castFingerprintLines(characterCanons, castPresent = []) {
  const selected = castPresent.length
    ? characterCanons.filter((canon) => castPresent.includes(canon.name))
    : characterCanons;
  return selected.map((canon) => `${canon.name || canon.role}: ${canon.character_fingerprint}`);
}

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

      updateJob(jobId, { status: "running", step: "final:cover" });
      let finalCoverImageUrl = job.result?.finalCoverImageUrl || "";
      let finalCoverUrl = job.result?.finalCoverUrl || "";
      if (!finalCoverUrl) {
        finalCoverImageUrl = await generateImage({
          prompt: blueprint.cover.image_prompt,
          outName: `final-cover-${jobId}`,
          characterFingerprints: castFingerprintLines(characterCanons, blueprint.cover.cast_present || []),
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
            story_role: page.story_role,
            text_prompt: page.text_prompt,
          });
          text = written.page_text.text;
        } else if (page.page_type === "image") {
          imageUrl = await generateImage({
            prompt: page.image_prompt,
            outName: `final-page${page.page_number}-${jobId}`,
            characterFingerprints: castFingerprintLines(characterCanons, page.cast_present || []),
            size: "1024x1024",
            quality: process.env.FINAL_IMAGE_QUALITY || "high",
            model: process.env.FINAL_IMAGE_MODEL || "gpt-image-1",
          });
        }

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
