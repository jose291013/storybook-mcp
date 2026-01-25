// src/services/imageRunner.js
import OpenAI from "openai";
import { saveBase64Png } from "./storageLocal.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Build a stable, print-friendly image prompt.
 * - No text in image
 * - Includes optional characterFingerprint for identity consistency across pages
 */
function buildFinalPrompt({ prompt, characterFingerprint = "" }) {
  const baseRules = [
    "No text, no captions, no watermarks, no logos.",
    "Children's book illustration, print-ready, clean composition.",
    "Consistent main character design across images.",
  ];

  // For a real product: characterFingerprint is a textual description derived from the uploaded photo
  // (hair/eyes/skin tone/face shape, etc.) to increase identity consistency.
  const fp = characterFingerprint?.trim()
    ? `\n\nMAIN CHARACTER FINGERPRINT (must stay consistent):\n${characterFingerprint.trim()}`
    : "";

  return `${prompt}\n\nGLOBAL RULES:\n- ${baseRules.join("\n- ")}${fp}`;
}

/**
 * Generate an image with OpenAI Images API and save locally.
 *
 * @param {object} params
 * @param {string} params.prompt - The image prompt (already style-rich)
 * @param {string} [params.outName] - Output filename base (without extension)
 * @param {string} [params.characterFingerprint] - Text fingerprint to stabilize character identity
 * @param {string} [params.size] - "1024x1024" | "1536x1024" | "1024x1536" (depends on API support)
 * @returns {Promise<string>} public URL (via storageLocal.js)
 */
export async function generateImage({
  prompt,
  outName = "image",
  characterFingerprint = "",
  size = "1536x1024",
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  if (!prompt || typeof prompt !== "string") {
    throw new Error("Missing or invalid prompt");
  }

  const finalPrompt = buildFinalPrompt({ prompt, characterFingerprint });

  // IMPORTANT:
  // Do NOT send referenced_image_ids — your model/API rejects it (400 Unknown parameter).
  const payload = {
    model: process.env.IMAGE_MODEL || "gpt-image-1",
    prompt: finalPrompt,
    size,
  };

  let res;
  try {
    res = await client.images.generate(payload);
  } catch (err) {
    const msg =
      err?.error?.message ||
      err?.message ||
      "Image generation failed (unknown error)";
    throw new Error(msg);
  }

  // Support both base64 and url (SDK can vary)
  const item = res?.data?.[0];
  const b64 = item?.b64_json;
  const urlFromApi = item?.url;

  if (b64) {
    const url = await saveBase64Png(b64, outName);
    return url;
  }

  if (urlFromApi) {
    // If API returns a URL, we still want local persistence for print workflows.
    // For now, throw a clear error so you can decide: download & store, or keep as URL.
    // (We can implement download+store later if you want.)
    throw new Error(
      "Image API returned a URL instead of base64. Implement download-to-local if needed."
    );
  }

  throw new Error("No image returned (missing b64_json/url)");
}

