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

import { photoDescriptorAgent } from "../agents/photoDescriptor.js";
import { textWriterAgent } from "../agents/textWriter.js";

import { composePreviewPNG } from "../services/composePreviewPNG.js";
import { composePrintPreviewPNG } from "../services/composePrintPreviewPNG.js";

const router = express.Router();

/**
 * POST /api/preview
 * body: { answers: {...}, heroPhotoId?: "..." }
 */
router.post("/preview", async (req, res) => {
  const { answers, heroPhotoId } = req.body || {};
  if (!answers) return res.status(400).json({ error: "Missing answers" });

  const job = createJob({ status: "running", kind: "preview" });
  res.json({ jobId: job.id }); // respond quickly

  (async () => {
    try {
      // ✅ declare once
      const baseUrl = process.env.BASE_URL || "https://storybook-mcp.onrender.com";

      updateJob(job.id, { status: "running", step: "intake" });
      const intake = await intakeAgent(answers);

      // --- Photo descriptor (character fingerprint) ---
      let characterFingerprint = "";
      let photoUrl = "";
      let portraitCanonShort = "";
      let portraitCanonJson = null;


      if (heroPhotoId) {
        photoUrl = `${baseUrl}/uploads/${heroPhotoId}`;

        updateJob(job.id, { step: "photoDescriptor" });
        const photoDesc = await photoDescriptorAgent({
          hero_name: intake.intake.hero_name,
          age: intake.intake.age,
          gender: intake.intake.gender,
          language: intake.intake.language,
          photo_url: photoUrl,
        });

        characterFingerprint =
        photoDesc?.photo_descriptor?.character_fingerprint || "";

        portraitCanonShort =
        photoDesc?.photo_descriptor?.canon_short || "";

        portraitCanonJson =
        photoDesc?.photo_descriptor?.canon_json || null;



        // Save debug info
        updateJob(job.id, { characterFingerprint, portraitCanonShort, portraitCanonJson, photoUrl });

      }

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
  heroPhotoId,
  portraitCanonShort,
  portraitCanonJson,
});


      updateJob(job.id, { step: "qa" });
      const qa = await qaAgent(final_blueprint);

      if (qa?.qa?.status && qa.qa.status !== "approved") {
        updateJob(job.id, {
          status: "failed",
          step: "qa",
          error: qa.qa.issues?.join(" | ") || "QA failed",
          intake,
          hero_profile,
          storybrand,
          world,
          style,
        });
        return;
      }

      // --- Prepare prompts ---
      const coverPrompt = final_blueprint.cover?.image_prompt;
      const page1 = final_blueprint.pages?.find((p) => p.page_number === 1);
      const page1Prompt = page1?.image_prompt;

      if (!coverPrompt || !page1Prompt) {
        throw new Error("Missing cover/page1 prompt in blueprint");
      }

      // --- Generate page 1 final text (not only prompt) ---
      updateJob(job.id, { step: "text:page1" });
      const page1Text = await textWriterAgent({
        language: final_blueprint.language,
        hero: final_blueprint.hero,
        page_number: 1,
        story_role: page1?.story_role || "introduction",
        text_prompt: page1?.text_prompt || "",
      });

      // --- Generate images ---
      updateJob(job.id, { step: "image:cover" });
      const coverUrl = await generateImage({
        prompt: coverPrompt,
        outName: `cover-${job.id}`,
        characterFingerprint,
      });

      updateJob(job.id, { step: "image:page1" });
      const page1Url = await generateImage({
        prompt: page1Prompt,
        outName: `page1-${job.id}`,
        characterFingerprint,
      });

      // --- Compose e-commerce previews (image + text overlay) ---
      updateJob(job.id, { step: "compose:cover" });
      const coverPreviewUrl = await composePreviewPNG({
        baseUrl,
        imageUrl: coverUrl,
        title: final_blueprint.cover?.title || "",
        body: "",
        outName: `cover_preview-${job.id}`,
      });

      updateJob(job.id, { step: "compose:page1" });
      const page1PreviewUrl = await composePreviewPNG({
        baseUrl,
        imageUrl: page1Url,
        title: "",
        body: page1Text.page_text.text,
        outName: `page1_preview-${job.id}`,
      });

      // --- Compose PRINT previews (A5 exact ratio) ---
      updateJob(job.id, { step: "compose:cover_print" });
      const coverPrintPreviewUrl = await composePrintPreviewPNG({
        baseUrl,
        imageUrl: coverUrl,
        title: final_blueprint.cover?.title || "",
        body: "",
        outName: `cover_print_${job.id}`,
        paper: "A5",
        dpi: 150,
        layout: "cover",
      });

      updateJob(job.id, { step: "compose:page1_print" });
      const page1PrintPreviewUrl = await composePrintPreviewPNG({
        baseUrl,
        imageUrl: page1Url,
        title: "",
        body: page1Text.page_text.text,
        outName: `page1_print_${job.id}`,
        paper: "A5",
        dpi: 150,
        layout: "page",
      });

      updateJob(job.id, {
        status: "done",
        step: "done",
        result: {
          coverUrl,
          page1Url,
          coverTitle: final_blueprint.cover?.title || "",
          page1Text: page1Text.page_text.text,
          language: final_blueprint.language,

          // e-commerce overlays
          coverPreviewUrl,
          page1PreviewUrl,

          // print overlays (A5 exact)
          coverPrintPreviewUrl,
          page1PrintPreviewUrl,
        },
        final_blueprint,
      });
    } catch (err) {
      updateJob(job.id, { status: "failed", error: String(err?.message || err) });
    }
  })();
});

export default router;

