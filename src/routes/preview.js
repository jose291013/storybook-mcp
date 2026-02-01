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
 * Parse companion answer (string or object) into canonical shape
 */
function parseCompanionAnswer(input) {
  // input could be: string, {name,type,description}, null
  if (!input) return { name: "Lumo", type: "robot", description: "" };

  if (typeof input === "object") {
    return {
      name: (input.name || "Lumo").toString().trim() || "Lumo",
      type: (input.type || "robot").toString().trim() || "robot",
      description: (input.description || input.raw || "").toString().trim(),
      raw: input.raw,
    };
  }

  // string
  const raw = String(input).trim();
  // crude heuristics: try to extract name/type if user wrote "Name - type - desc"
  const parts = raw.split(/[-|–—]/).map((s) => s.trim()).filter(Boolean);

  const name = parts[0] || "Lumo";
  const type = parts[1] || "robot";
  const description = parts.slice(2).join(" - ");

  return { name, type, description, raw };
}

function pickCompanionCanon({ intake, world, final_blueprint, fallback }) {
  const fb = final_blueprint || {};
  const fromHero = fb.hero?.companion;
  const fromWorld = world?.world?.companion || world?.companion;

  const name =
    fromHero?.name ||
    fromWorld?.name ||
    intake?.intake?.companion_name ||
    fallback?.name ||
    "Lumo";

  const type =
    fromHero?.type ||
    fromWorld?.type ||
    intake?.intake?.companion_type ||
    fallback?.type ||
    "robot";

  const description =
    fromHero?.description ||
    fromWorld?.description ||
    intake?.intake?.companion_description ||
    fallback?.description ||
    fallback?.raw ||
    "";

  return { name, type, description };
}

function enforceCompanionConsistency(final_blueprint, companion) {
  if (!final_blueprint || typeof final_blueprint !== "object") return final_blueprint;

  final_blueprint.hero = final_blueprint.hero || {};
  final_blueprint.hero.companion = companion;

  const typeRegex = /\b(perro mediano|perro|robot gen[eé]rico y amistoso|robot)\b/gi;
  const typeReplacement = companion.type;

  const replaceIn = (s) =>
    typeof s === "string"
      ? s.replace(typeRegex, typeReplacement).replace(/\bLumo\b/g, companion.name)
      : s;

  if (final_blueprint.style?.style_prompt) {
    final_blueprint.style.style_prompt = replaceIn(final_blueprint.style.style_prompt);
  }

  if (final_blueprint.cover?.image_prompt) {
    final_blueprint.cover.image_prompt = replaceIn(final_blueprint.cover.image_prompt);
  }

  if (Array.isArray(final_blueprint.pages)) {
    final_blueprint.pages = final_blueprint.pages.map((p) => ({
      ...p,
      image_prompt: replaceIn(p.image_prompt || ""),
      text_prompt: replaceIn(p.text_prompt || ""),
    }));
  }

  return final_blueprint;
}

/**
 * POST /api/preview
 * body: { answers: {...}, heroPhotoId?: "..." }
 */
router.post("/preview", async (req, res) => {
  const body = req.body || {};

  // Backward compatible:
  // - Old payload: { answers: {...}, heroPhotoId?: "..." }
  // - New payload: { hero:{...}, message, universe, style, signature_object, companion:{...}, photos:{...}, language, extra_notes }

  let answers = body.answers || null;

  // hero photo id (child)
  const heroPhotoId =
    body.heroPhotoId ||
    body?.photos?.child_photo_id ||
    body?.photos?.childPhotoId ||
    null;

  // companion photo id (optional, not used yet)
  const companionPhotoId =
    body?.photos?.companion_photo_id ||
    body?.photos?.companionPhotoId ||
    null;

  // If new payload (no "answers"), build answers from it
  if (!answers) {
    const companionEnabled = !!body?.companion?.enabled;
    const companionName = (body?.companion?.name || "").trim();
    const companionType = (body?.companion?.type || "").trim();

    answers = {
      hero_name: (body?.hero?.name || "").trim(),
      age: body?.hero?.age != null ? String(body.hero.age).trim() : "",
      gender: (body?.hero?.gender || "").trim(),

      universe: (body?.universe || "").trim(),
      style: (body?.style || "").trim(),
      message: (body?.message || "").trim(),
      language: (String(body?.language || "").trim() || "ES"),

      signature_object: (body?.signature_object || "").trim(),
      extra_notes: (body?.extra_notes || "").trim(),

      // keep your existing intake normalization rules: companion is a free-form string
      companion: companionEnabled
        ? [companionName, companionType].filter(Boolean).join(" - ")
        : "",
    };
  }

  if (!answers) return res.status(400).json({ error: "Missing answers" });
  if (!String(answers.hero_name || "").trim()) {
  return res.status(400).json({ error: "Missing hero name" });
}


  const job = createJob({ status: "running", kind: "preview" });

  // Store useful info (optional but nice for debugging)
  updateJob(job.id, { heroPhotoId, companionPhotoId });

  res.json({ jobId: job.id }); // respond quickly

  (async () => {
    try {
      const baseUrl = process.env.BASE_URL || "https://storybook-mcp.onrender.com";

      updateJob(job.id, { status: "running", step: "intake" });
      const intake = await intakeAgent(answers);

      let companionCanon = parseCompanionAnswer(answers?.companion);
      updateJob(job.id, { companionCanon });

      // --- Photo descriptor (character fingerprint) ---
      let characterFingerprint = "";
      let photoUrl = "";
      let portraitCanonShort = "";
      let portraitCanonJson = null;

      if (heroPhotoId) {
        photoUrl = `${baseUrl}/uploads/${heroPhotoId}`;

        updateJob(job.id, { step: "photoDescriptor" });
        const photoDesc = await photoDescriptorAgent({
          hero_name: intake?.intake?.hero_name,
          age: intake?.intake?.age,
          gender: intake?.intake?.gender,
          language: intake?.intake?.language,
          photo_url: photoUrl,
        });

        characterFingerprint = photoDesc?.photo_descriptor?.character_fingerprint || "";
        portraitCanonShort = photoDesc?.photo_descriptor?.canon_short || "";
        portraitCanonJson = photoDesc?.photo_descriptor?.canon_json || null;

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

      // normalize companion ONCE
      companionCanon = pickCompanionCanon({ intake, world, final_blueprint, fallback: companionCanon });
      enforceCompanionConsistency(final_blueprint, companionCanon);
      updateJob(job.id, { companionCanon });

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
          final_blueprint,
        });
        return;
      }

      // --- Prepare prompts ---
      const coverPrompt = final_blueprint?.cover?.image_prompt || "";
      const page1 = final_blueprint?.pages?.find((p) => p.page_number === 1);
      const page1Prompt = page1?.image_prompt || "";

      if (!coverPrompt.trim() || !page1Prompt.trim()) {
        throw new Error("Missing cover/page1 prompt in blueprint");
      }

      // --- Generate page 1 final text ---
      updateJob(job.id, { step: "text:page1" });
      const page1Text = await textWriterAgent({
        language: final_blueprint.language,
        hero: final_blueprint.hero,
        page_number: 1,
        story_role: page1?.story_role || "introduction",
        text_prompt: page1?.text_prompt || "",
      });

      const page1TextFinal = page1Text?.page_text?.text || "";

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

      // --- Compose e-commerce previews ---
      updateJob(job.id, { step: "compose:cover" });
      const coverPreviewUrl = await composePreviewPNG({
        baseUrl,
        imageUrl: coverUrl,
        title: final_blueprint?.cover?.title || "",
        body: "",
        outName: `cover_preview-${job.id}`,
      });

      updateJob(job.id, { step: "compose:page1" });
      const page1PreviewUrl = await composePreviewPNG({
        baseUrl,
        imageUrl: page1Url,
        title: "",
        body: page1TextFinal,
        outName: `page1_preview-${job.id}`,
      });

      // --- Compose PRINT previews (A5 exact ratio) ---
      updateJob(job.id, { step: "compose:cover_print" });
      const coverPrintPreviewUrl = await composePrintPreviewPNG({
        baseUrl,
        imageUrl: coverUrl,
        title: final_blueprint?.cover?.title || "",
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
        body: page1TextFinal,
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
          coverTitle: final_blueprint?.cover?.title || "",
          page1Text: page1TextFinal,
          language: final_blueprint.language,

          coverPreviewUrl,
          page1PreviewUrl,

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

