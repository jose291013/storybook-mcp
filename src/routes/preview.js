import express from "express";
import { createJob, updateJob } from "../services/jobStore.js";
import { generateImage } from "../services/imageRunner.js";

import { intakeAgent } from "../agents/intake.js";
import { heroClassifierAgent } from "../agents/heroClassifier.js";
import { storybrandAgent } from "../agents/storybrand.js";
import { worldBuilderAgent } from "../agents/worldBuilder.js";
import { styleAgent } from "../agents/style.js";
import { blueprintFillerAgent } from "../agents/blueprintFiller.js";
import { qaAgent } from "../agents/qa.js";

const router = express.Router();

/**
 * POST /api/preview
 * body: { answers: {...10 questions...}, heroPhotoId?: "..." }
 */
router.post("/preview", async (req, res) => {
  const { answers, heroPhotoId } = req.body || {};
  if (!answers) return res.status(400).json({ error: "Missing answers" });

  const job = createJob({ status: "running", kind: "preview" });
  res.json({ jobId: job.id }); // respond quickly, do async work

  // run async pipeline
  (async () => {
    try {
      updateJob(job.id, { status: "running", step: "intake" });
      const intake = await intakeAgent(answers);

      updateJob(job.id, { step: "heroClassifier" });
      const hero_profile = await heroClassifierAgent(intake);

      updateJob(job.id, { step: "storybrand" });
      const storybrand = await storybrandAgent({ intake, hero_profile });

      updateJob(job.id, { step: "worldBuilder" });
      const world = await worldBuilderAgent(intake);

      updateJob(job.id, { step: "style" });
      const style = await styleAgent(intake);

      updateJob(job.id, { step: "blueprintFiller" });
      const final_blueprint = await blueprintFillerAgent({
        intake,
        hero_profile,
        storybrand,
        world,
        style,
        heroPhotoId
      });

      updateJob(job.id, { step: "qa" });
      const qa = await qaAgent(final_blueprint);

      if (qa?.qa?.status && qa.qa.status !== "approved") {
        updateJob(job.id, { status: "failed", error: qa.qa.issues?.join(" | ") || "QA failed", intake, hero_profile, storybrand, world, style });
        return;
      }

      // Generate 2 images (cover + page1)
      const coverPrompt = final_blueprint.cover?.image_prompt;
      const page1 = final_blueprint.pages?.find(p => p.page_number === 1);
      const page1Prompt = page1?.image_prompt;

      if (!coverPrompt || !page1Prompt) throw new Error("Missing cover/page1 prompt in blueprint");

      updateJob(job.id, { step: "image:cover" });
      const coverUrl = await generateImage({
        prompt: coverPrompt,
        refImageIds: heroPhotoId ? [heroPhotoId] : [],
        outName: `${job.id}-cover`
      });

      updateJob(job.id, { step: "image:page1" });
      const page1Url = await generateImage({
        prompt: page1Prompt,
        refImageIds: heroPhotoId ? [heroPhotoId] : [],
        outName: `${job.id}-page1`
      });

      const page1TextPrompt = page1?.text_prompt;

      updateJob(job.id, {
        status: "done",
        step: "done",
        result: {
          coverUrl,
          page1Url,
          page1TextPrompt,
          language: final_blueprint.language
        },
        final_blueprint
      });
    } catch (err) {
      updateJob(job.id, { status: "failed", error: String(err?.message || err) });
    }
  })();
});

export default router;
