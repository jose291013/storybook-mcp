import path from "path";
import fs from "fs/promises";
import { toFile } from "openai";
import sharp from "sharp";
import { saveBase64Png } from "./storageLocal.js";
import { createOpenAIClient } from "./openaiClient.js";
import { getDeliveryStorage } from "./deliveryStorage.js";
import { sanitizeBrandSensitiveText } from "./imageVisualContract.js";
import { storageBodyToBuffer } from "./previewAssetStorage.js";

function getClient() {
  return createOpenAIClient({ kind: "image" });
}

export { sanitizeBrandSensitiveText } from "./imageVisualContract.js";

export function prioritizeVisualReferences(referenceImages = []) {
  return [...referenceImages]
    .filter(Boolean)
    .sort((left, right) => {
      const rank = (item) => item?.kind === "repair_source"
        ? 0
        : item?.kind === "continuity"
          ? 1
          : item?.kind === "wardrobe"
            ? 2
          : item?.kind === "adjacent_scene"
            ? 3
            : item?.kind === "identity"
              ? 4
              : 4;
      return rank(left) - rank(right);
    });
}

export function buildFinalPrompt({
  prompt,
  characterFingerprint = "",
  characterFingerprints = [],
  referenceImages = [],
  sceneContract = "",
  renderingMode = "illustrated_faithful",
  likenessGoal = "strong",
  providerSafetyMinimal = false,
  providerSafetyFinishing = false,
}) {
  const renderingRule = renderingMode === "photorealistic"
    ? "Photorealistic fairy-tale photography: preserve natural facial geometry, true skin texture and realistic human proportions. Never turn a person into a cartoon, doll, figurine or CGI character; never enlarge the eyes."
    : renderingMode === "cartoon"
      ? "Clearly stylized children's-book art: preserve the strongest identity markers, face shape, hairstyle, colors and distinctive visible details while applying the selected cartoon medium honestly."
      : "Faithful children's-book illustration: change the artistic medium, but preserve natural facial proportions, face geometry, eye shape and spacing, nose, mouth, ears, hairstyle and every distinctive visible identity marker.";
  const baseRules = providerSafetyFinishing ? [
    "Create the final premium storybook illustration from the supplied private visual authorities.",
    "Reference 1 fixes the complete scene composition, cast count, action, setting and object placement.",
    "Apply each remaining reference only to its declared identity, outfit or artistic-medium role.",
    "Preserve one complete, separate figure per declared traveler and keep the gentle medium or wide composition.",
    "Keep the exact physical medium, posture, wardrobe, equipment and main action stated in the minimal scene contract.",
    "No text, captions, watermarks, logos, brands or additional story events.",
  ] : providerSafetyMinimal ? [
    "No text, captions, watermarks, logos, brands or copyrighted character lookalikes.",
    "Create one calm, age-appropriate illustrated instant. Every figure wears the declared outfit, remains complete and keeps respectful personal space.",
    "Obey the exact cast count, setting, physical medium, action, outfit, equipment and object quantities in the minimal scene contract.",
    "Use a gentle, reassuring storybook presentation with a clear medium or wide composition and no additional dramatic event.",
  ] : [
    "No text, captions, watermarks, logos, branded characters or copyrighted character lookalikes.",
    "Print-ready, clean square composition for a premium children's book.",
    renderingRule,
    `Identity fidelity target: ${likenessGoal}. The selected medium may change; the person's identity may not be replaced by a generic child.`,
    "Treat every visual character role as a locked model sheet: never change face, species, stable colors or body markings. Wardrobe and conditional equipment remain stable only inside the exact state interval declared by the current scene contract, and change only when that contract changes them.",
    "A child must remain the same human child. An animal mascot must remain the exact same animal species and must never become another creature.",
    "Each identity reference belongs to one complete separate individual. Never fuse, splice, morph or exchange heads, faces, bodies, limbs, species, clothing or markings between two references; never create a human-animal hybrid unless the current scene explicitly requests that exact fantasy being.",
    "Scene action, pose, expression, camera angle and lighting may change. Identity may not change. Wardrobe follows the current scene directive and remains exact within that declared state.",
    "Reference photos may contain printed words, labels or commercial logos on clothing. When the current scene explicitly requires the ordinary source outfit, remove those marks while preserving its broad garment type and color. When another scene outfit is active, do not preserve or copy the source-photo clothing.",
  ];

  const combinedFingerprints = providerSafetyMinimal || providerSafetyFinishing
    ? ""
    : sanitizeBrandSensitiveText(characterFingerprints.length
      ? characterFingerprints.filter(Boolean).join("\n")
      : characterFingerprint);
  const canon = combinedFingerprints?.trim()
    ? `\n\nLOCKED CHARACTER CANON (higher priority than any conflicting scene wording):\n${combinedFingerprints.trim()}`
    : "";
  const orderedReferences = providerSafetyMinimal ? [] : prioritizeVisualReferences(referenceImages);
  const hasPrimaryStyleAnchor = orderedReferences.some((item) => item?.kind === "continuity");
  const hasRepairSource = orderedReferences.some((item) => item?.kind === "repair_source");
  const wardrobeReferenceLabel = (item) => item?.evidenceMode === "broad_garment_attributes"
    ? "LOCKED ORDINARY WARDROBE ATTRIBUTES"
    : "LOCKED EXACT WARDROBE DESIGN";
  const providerFinishingReferenceContract = orderedReferences.length
    ? `\n\nPRIVATE FINISHING REFERENCES:\n${orderedReferences.map((item, index) => (
        `- Reference ${index + 1}: ${item.kind === "repair_source" ? "scene composition and action" : item.kind === "continuity" ? "approved artistic medium" : item.kind === "wardrobe" ? "declared outfit" : item.kind === "identity" ? "declared traveler identity" : "supporting visual authority"}`
      )).join("\n")}\nKeep Reference 1 as the exact scene foundation. Apply each other reference only to its stated role and keep every traveler complete and separate.`
    : "";
  const standardReferenceContract = orderedReferences.length
    ? `\n\nREFERENCE IMAGE CONTRACT:\n${orderedReferences.map((item, index) => (
        `- Reference ${index + 1} [${item.kind === "repair_source" ? "TARGET IMAGE TO EDIT" : item.kind === "continuity" ? "PRIMARY APPROVED STYLE ANCHOR" : item.kind === "wardrobe" ? wardrobeReferenceLabel(item) : item.kind === "adjacent_scene" ? "ADJACENT APPROVED SCENE" : item.kind === "identity" ? "IDENTITY ONLY" : "SUPPORTING REFERENCE"}]: ${providerSafetyFinishing ? "private canonical visual authority" : item.label || "visual continuity reference"}`
      )).join("\n")}\n${hasRepairSource ? "The TARGET IMAGE TO EDIT controls the existing composition, camera, lighting, background, unaffected cast and unaffected objects. Make the smallest local correction requested by the prompt; do not redesign or regenerate the scene." : "Create a genuinely new scene composition."} ${hasPrimaryStyleAnchor ? "The PRIMARY APPROVED STYLE ANCHOR alone controls the book's rendering family, artistic medium, surface treatment, character proportions and world palette." : "No approved-cover style anchor is present yet; follow the requested style prompt and never derive the rendering medium from an identity photo."} A LOCKED ORDINARY WARDROBE ATTRIBUTES reference is the sole identity-bound source for that person's ordinary outfit: preserve broad garment categories, dominant colors and footwear, while ignoring logos, print, minor texture, folds, fit and hidden details. A LOCKED EXACT WARDROBE DESIGN reference is the sole garment authority for that person's active special outfit: preserve its exact design, colors, material and footwear while changing pose and camera. ADJACENT APPROVED SCENE references are local continuity evidence only: preserve recurring identities, established world details and physical states that truly carry over, but never copy their prior action, pose, composition, camera, obsolete location or obsolete equipment. The current SCENE CONTRACT always overrides an adjacent image when the story intentionally changes place, time, wardrobe, equipment or action. IDENTITY ONLY references preserve stable facial or animal traits only; never copy their photographic medium, lighting, background, pose, printed clothing or undeclared wardrobe. Each numbered identity maps to its own separate complete subject; never combine two numbered references into one body or identity. Preserve reference wardrobe only when the current scene wardrobe directive requires it; otherwise follow the declared scene outfit. Never copy a prop, magical object or plot element from a reference unless the current scene explicitly requires it.`
    : "";
  const referenceContract = providerSafetyFinishing
    ? providerFinishingReferenceContract
    : standardReferenceContract;
  const safeSceneContract = sanitizeBrandSensitiveText(sceneContract).trim();
  const exactScene = safeSceneContract
    ? `\n\nSCENE CONTRACT (highest priority for this illustration):\n${safeSceneContract}`
    : "";

  return `${sanitizeBrandSensitiveText(prompt)}\n\nGLOBAL CONTINUITY RULES:\n- ${baseRules.join("\n- ")}${canon}${referenceContract}${exactScene}`;
}

async function normalizeIdentityReference(source, normalizationMode = "full_and_face") {
  const oriented = await sharp(source).rotate().png().toBuffer();
  const metadata = await sharp(oriented).metadata();
  const width = Math.max(1, Number(metadata.width || 1));
  const height = Math.max(1, Number(metadata.height || 1));
  if (normalizationMode === "face_focus") {
    const upperHeight = height > width * 1.2 ? Math.max(1, Math.floor(height * 0.45)) : height;
    const upper = await sharp(oriented).extract({ left: 0, top: 0, width, height: upperHeight }).toBuffer();
    const faceFocus = await sharp(upper)
      .resize(1024, 1024, { fit: "cover", position: sharp.strategy.attention })
      .png()
      .toBuffer();
    return sharp(faceFocus)
      .composite([{
        input: { create: { width: 1024, height: 360, channels: 4, background: "#f7f4ee" } },
        left: 0,
        top: 664,
      }])
      .png()
      .toBuffer();
  }
  const square = Math.min(width, height);
  const full = await sharp(oriented).resize(380, 980, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const faceFocus = await sharp(oriented).extract({ left: Math.max(0, Math.floor((width - square) / 2)), top: 0, width: square, height: square }).resize(620, 620, { fit: "cover" }).png().toBuffer();
  return sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#f7f4ee" } })
    .composite([
      { input: full, left: 10, top: 22, gravity: "southwest" },
      { input: faceFocus, left: 394, top: 26 },
    ])
    .png()
    .toBuffer();
}

async function loadReferenceFiles(referenceImages) {
  const files = [];
  for (let index = 0; index < referenceImages.length; index += 1) {
    const reference = referenceImages[index];
    let source;
    if (Buffer.isBuffer(reference.buffer)) source = reference.buffer;
    else if (reference.storageKey) {
      const asset = await getDeliveryStorage().get(reference.storageKey);
      source = await storageBodyToBuffer(asset.body);
    } else source = await fs.readFile(reference.path);
    const normalized = reference.kind === "identity"
      ? await normalizeIdentityReference(source, reference.normalizationMode)
      : await sharp(source).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
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
  renderingMode = "illustrated_faithful",
  likenessGoal = "strong",
  size = "1024x1024",
  quality = process.env.IMAGE_QUALITY || "low",
  model = process.env.IMAGE_MODEL || "gpt-image-2",
  providerSafetyMinimal = false,
  providerSafetyFinishing = false,
}) {
  if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
  if (!prompt || typeof prompt !== "string") throw new Error("Missing or invalid prompt");

  const usableReferences = providerSafetyMinimal
    ? []
    : prioritizeVisualReferences(referenceImages)
      .filter((item) => item?.path || item?.storageKey || Buffer.isBuffer(item?.buffer))
      .slice(0, 8);
  const finalPrompt = buildFinalPrompt({
    prompt,
    characterFingerprint,
    characterFingerprints,
    referenceImages: usableReferences,
    sceneContract,
    renderingMode,
    likenessGoal,
    providerSafetyMinimal,
    providerSafetyFinishing,
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
