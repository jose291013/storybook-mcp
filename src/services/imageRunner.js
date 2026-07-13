import path from "path";
import fs from "fs/promises";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { saveBase64Png } from "./storageLocal.js";

function getClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export function buildFinalPrompt({
  prompt,
  characterFingerprint = "",
  characterFingerprints = [],
  referenceImages = [],
  sceneContract = "",
}) {
  const baseRules = [
    "No text, captions, watermarks, logos, branded characters or copyrighted character lookalikes.",
    "Children's book illustration, print-ready, clean square composition.",
    "Treat every named character as a locked model sheet: never change face, species, colors, body markings, outfit or accessories between pages.",
    "A child must remain the same human child. An animal mascot must remain the exact same animal species and must never become another creature.",
    "Scene action, pose, expression, camera angle and lighting may change; locked identity and wardrobe may not.",
  ];

  const combinedFingerprints = characterFingerprints.length
    ? characterFingerprints.filter(Boolean).join("\n")
    : characterFingerprint;
  const canon = combinedFingerprints?.trim()
    ? `\n\nLOCKED CHARACTER CANON (higher priority than any conflicting scene wording):\n${combinedFingerprints.trim()}`
    : "";
  const referenceContract = referenceImages.length
    ? `\n\nREFERENCE IMAGE CONTRACT:\n${referenceImages.map((item, index) => (
        `- Reference ${index + 1}: ${item.label || "visual continuity reference"}`
      )).join("\n")}\nUse these images only to preserve the named characters, their exact wardrobe and the established illustration style. Create a genuinely new scene composition. Never copy a background, pose, prop, magical object or plot element from a reference unless the current scene explicitly requires it.`
    : "";
  const exactScene = sceneContract?.trim()
    ? `\n\nSCENE CONTRACT (highest priority for this illustration):\n${sceneContract.trim()}`
    : "";

  return `${prompt}\n\nGLOBAL CONTINUITY RULES:\n- ${baseRules.join("\n- ")}${canon}${referenceContract}${exactScene}`;
}

async function loadReferenceFiles(referenceImages) {
  const files = [];
  for (let index = 0; index < referenceImages.length; index += 1) {
    const reference = referenceImages[index];
    const source = await fs.readFile(reference.path);
    const normalized = await sharp(source)
      .rotate()
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    files.push(await toFile(normalized, `reference-${index + 1}.png`, { type: "image/png" }));
  }
  return files;
}

export async function generateImage({
  prompt,
  outName = "image",
  characterFingerprint = "",
  characterFingerprints = [],
  referenceImages = [],
  sceneContract = "",
  size = "1024x1024",
  quality = process.env.IMAGE_QUALITY || "low",
  model = process.env.IMAGE_MODEL || "gpt-image-1-mini",
}) {
  if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
  if (!prompt || typeof prompt !== "string") throw new Error("Missing or invalid prompt");

  const usableReferences = referenceImages.filter((item) => item?.path).slice(0, 8);
  const finalPrompt = buildFinalPrompt({
    prompt,
    characterFingerprint,
    characterFingerprints,
    referenceImages: usableReferences,
    sceneContract,
  });

  let res;
  try {
    if (usableReferences.length) {
      const referenceModel = process.env.REFERENCE_IMAGE_MODEL || "gpt-image-2";
      const payload = {
        model: referenceModel,
        image: await loadReferenceFiles(usableReferences),
        prompt: finalPrompt,
        size,
        quality,
      };
      // gpt-image-2 already treats every reference at high fidelity. Older full
      // GPT Image models need this explicit fidelity request.
      if (["gpt-image-1", "gpt-image-1.5"].includes(referenceModel)) {
        payload.input_fidelity = "high";
      }
      res = await getClient().images.edit(payload);
    } else {
      res = await getClient().images.generate({ model, prompt: finalPrompt, size, quality });
    }
  } catch (error) {
    const message = error?.error?.message || error?.message || "Image generation failed (unknown error)";
    throw new Error(message);
  }

  const item = res?.data?.[0];
  if (item?.b64_json) return saveBase64Png(item.b64_json, outName);
  if (item?.url) throw new Error("Image API returned a URL instead of base64. Implement download-to-local if needed.");
  throw new Error("No image returned (missing b64_json/url)");
}
