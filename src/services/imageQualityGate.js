import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { generateImage } from "./imageRunner.js";
import { createOpenAIClient } from "./openaiClient.js";
import { getDeliveryStorage } from "./deliveryStorage.js";
import { storageBodyToBuffer } from "./previewAssetStorage.js";

function getClient() {
  return createOpenAIClient({ kind: "qa" });
}

function extractText(response) {
  if (response?.output_text) return response.output_text;
  return (response?.output || [])
    .flatMap((item) => item?.content || [])
    .filter((item) => String(item?.type || "").includes("text"))
    .map((item) => item?.text || "")
    .join("\n")
    .trim();
}

function parseJson(text) {
  try { return JSON.parse(text); }
  catch {
    const start = String(text || "").indexOf("{");
    const end = String(text || "").lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(String(text).slice(start, end + 1));
    throw new Error("Image quality control returned invalid JSON");
  }
}

const OBJECTIVE_DEFECT_PATTERN = /(corrupt|blank|nearly blank|abstract noise|repeated (?:band|stripe)|bands|stripes|decoder|extreme(?:ly)? blur|truncated|unfinished|incomplete render|no coherent|no recognizable|unrecognizable scene|broken pixels|pixel corruption)/iu;

export function objectiveTechnicalIssues(issues = []) {
  return (Array.isArray(issues) ? issues : [])
    .map(String)
    .filter((issue) => OBJECTIVE_DEFECT_PATTERN.test(issue));
}

export function isImageSafetyRejection(error) {
  return /(rejected by the safety system|safety system|safety rejection)/iu.test(String(error?.message || error || ""));
}

async function referenceSource(reference) {
  if (!reference) return null;
  if (Buffer.isBuffer(reference.buffer)) return reference.buffer;
  if (reference.storageKey) {
    const asset = await getDeliveryStorage().get(reference.storageKey);
    return storageBodyToBuffer(asset.body);
  }
  if (reference.path) return fs.readFile(reference.path);
  return null;
}

export async function inspectStyleConsistency({ imagePath, styleReference, pageLabel = "illustration" }) {
  const reference = await referenceSource(styleReference);
  if (!reference) return { approved: true, issues: [] };
  const [candidate, locked] = await Promise.all([
    sharp(await fs.readFile(imagePath)).rotate().resize(512, 512, { fit: "inside" }).jpeg({ quality: 72 }).toBuffer(),
    sharp(reference).rotate().resize(512, 512, { fit: "inside" }).jpeg({ quality: 72 }).toBuffer(),
  ]);
  const instruction = `You are checking visual continuity inside one children's book.
Image 1 is the newly generated ${pageLabel}. Image 2 is the locked visual-style reference for the same book.
Classify both images into one broad rendering family:
- realistic_dimensional: photographic-looking illustration, cinematic realism, detailed digital painting, realistic or semi-realistic 3D;
- soft_painterly: watercolor, gouache or pastel;
- flat_drawn: flat cartoon, manga, ink or line art;
- crafted_collage: paper cut, felt, clay or collage.

Images inside the same broad family are compatible. In particular, photographic-looking illustration, detailed realistic 3D, softer realistic 3D and detailed digital painting all belong to realistic_dimensional and MUST be approved together. Differences in texture detail, softness, lighting, color grading, depth of field or degree of polish are not a medium break.
Ignore scene, cast, pose, framing, colors, lighting and background differences.
Reject only a categorical change between two different broad families that would make the pages look as if they came from different books, for example realistic_dimensional beside flat_drawn or soft_painterly.
Return only JSON: {"approved":true,"issues":[]} or {"approved":false,"issues":["short reason"]}.`;
  const response = await getClient().responses.create({
    model: process.env.IMAGE_QA_MODEL || process.env.VISION_MODEL || "gpt-4.1-mini",
    input: [{ role: "user", content: [
      { type: "input_text", text: instruction },
      { type: "input_image", image_url: `data:image/jpeg;base64,${candidate.toString("base64")}`, detail: "low" },
      { type: "input_image", image_url: `data:image/jpeg;base64,${locked.toString("base64")}`, detail: "low" },
    ] }],
    max_output_tokens: 300,
  });
  const result = parseJson(extractText(response));
  const approved = result?.approved === true;
  const issues = Array.isArray(result?.issues) ? result.issues.map(String).filter(Boolean).slice(0, 3) : [];
  return { approved, issues: approved ? [] : (issues.length ? issues : ["The rendering style does not match the locked book reference."]) };
}

export function outputImagePath(imageUrl, outputsDir = "data/outputs") {
  const pathname = new URL(String(imageUrl || ""), "http://localhost").pathname;
  if (!pathname.startsWith("/outputs/")) throw new Error("Generated image URL is invalid");
  return path.resolve(outputsDir, decodeURIComponent(path.basename(pathname)));
}

export async function inspectGeneratedIllustration({ imagePath, pageLabel = "illustration" }) {
  const source = await fs.readFile(imagePath);
  const metadata = await sharp(source).metadata();
  if (metadata.format !== "png" || Number(metadata.width || 0) < 512 || Number(metadata.height || 0) < 512) {
    return { approved: false, issues: ["The generated file is not a complete square PNG illustration."] };
  }
  if (process.env.IMAGE_CONTENT_QA_ENABLED === "false") return { approved: true, issues: [] };

  const compact = await sharp(source).rotate().resize(512, 512, { fit: "inside" }).jpeg({ quality: 72 }).toBuffer();
  const dataUrl = `data:image/jpeg;base64,${compact.toString("base64")}`;
  const instruction = `You are a technical file-quality controller for a personalized children's book.
Inspect the attached ${pageLabel}.

Reject only when the image has an objective technical production defect:
- corrupted pixels, blank or nearly blank content;
- abstract noise, repeated bands or stripes such as a broken decoder output;
- extreme accidental blur, truncated rendering or a visibly unfinished image;
- no coherent recognizable children's-book scene at all.

Approve every coherent illustration, even if you would prefer a different composition, character, outfit, color, pose, style or scene interpretation. Never compare wardrobe, cast, likeness or narrative accuracy. Small preview watermarks and page-number badges are expected and are not defects.
Return only JSON in this exact form: {"approved":true,"issues":[]} or {"approved":false,"issues":["short objective reason"]}.`;

  const response = await getClient().responses.create({
    model: process.env.IMAGE_QA_MODEL || process.env.VISION_MODEL || "gpt-4.1-mini",
    input: [{ role: "user", content: [{ type: "input_text", text: instruction }, { type: "input_image", image_url: dataUrl, detail: "low" }] }],
    max_output_tokens: 300,
  });
  const result = parseJson(extractText(response));
  const reportedIssues = Array.isArray(result?.issues) ? result.issues.map(String).filter(Boolean).slice(0, 5) : [];
  const issues = objectiveTechnicalIssues(reportedIssues);
  // The vision check is deliberately technical, not artistic. A coherent image
  // must not be regenerated merely because it is photorealistic or differs from
  // a preferred illustration style.
  const approved = result?.approved === true || issues.length === 0;
  return { approved, issues: approved ? [] : issues };
}

export async function inspectSceneFidelity({ imagePath, sceneContract, pageLabel = "illustration" }) {
  if (!sceneContract) return { approved: true, issues: [] };
  if (process.env.IMAGE_SCENE_QA_ENABLED === "false") return { approved: true, issues: [] };
  const source = await sharp(await fs.readFile(imagePath)).rotate().resize(512, 512, { fit: "inside" }).jpeg({ quality: 72 }).toBuffer();
  const instruction = `You are checking whether one children's-book ${pageLabel} depicts its authoritative structured scene contract.
Judge only objective, clearly visible contradictions:
- the main action has the wrong subject or wrong target;
- a recurring named character is substituted for a distinct generic character;
- a named observer is shown performing the central action instead;
- a required visible group, object, quantity, spatial relationship or physical scale is plainly absent or contradicted;
- an explicitly forbidden substitution is present.
Do not judge artistic style, beauty, exact facial likeness, clothing detail, lighting or minor composition choices. If the evidence is ambiguous, approve.
SCENE CONTRACT JSON:
${JSON.stringify(sceneContract)}
Return only JSON: {"approved":true,"issues":[]} or {"approved":false,"issues":["short objective contradiction"]}.`;
  const response = await getClient().responses.create({
    model: process.env.IMAGE_QA_MODEL || process.env.VISION_MODEL || "gpt-4.1-mini",
    input: [{ role: "user", content: [
      { type: "input_text", text: instruction },
      { type: "input_image", image_url: `data:image/jpeg;base64,${source.toString("base64")}`, detail: "low" },
    ] }],
    max_output_tokens: 350,
  });
  const result = parseJson(extractText(response));
  const approved = result?.approved === true;
  const issues = Array.isArray(result?.issues) ? result.issues.map(String).filter(Boolean).slice(0, 4) : [];
  return { approved, issues: approved ? [] : (issues.length ? issues : ["The illustration contradicts the structured scene contract."]) };
}

export async function generateQualityCheckedImage({
  prompt,
  castPresent = [],
  pageLabel = "illustration",
  maximumAttempts = Math.max(1, Number.parseInt(process.env.IMAGE_GENERATION_ATTEMPTS || "2", 10) || 2),
  onAttempt = null,
  sceneFidelityContract = null,
  ...generationOptions
}) {
  let previousIssues = [];
  let previousRejectionKind = "technical";
  let omitReferenceImages = false;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    onAttempt?.({ phase: "started", attempt, maximumAttempts, pageLabel });
    const repairNote = previousIssues.length
      ? previousRejectionKind === "style"
        ? `\n\nSTYLE CONTINUITY REGENERATION: the previous output differed from the locked reference because ${previousIssues.join("; ")}. Treat the continuity reference as authoritative. Preserve its same broad rendering family and visual medium. Do not switch between realistic dimensional illustration, painterly watercolor/gouache, flat drawn cartoon/manga, or crafted paper/collage. Differences in scene and lighting are allowed.`
        : previousRejectionKind === "scene"
          ? `\n\nSCENE FIDELITY REGENERATION: the previous output contradicted the authoritative scene contract because ${previousIssues.join("; ")}. Correct exactly who performs the main action and toward whom, keep generic people distinct from recurring named characters, and obey the required quantity, physical scale, spatial relationships and forbidden substitutions.`
          : `\n\nTECHNICAL REGENERATION: the previous output was rejected because ${previousIssues.join("; ")}. Produce a complete, coherent illustration of the requested scene and do not reproduce that defect.`
      : "";
    try {
      const imageUrl = await generateImage({
        ...generationOptions,
        referenceImages: omitReferenceImages
          ? generationOptions.referenceImages?.filter((reference) => reference?.kind === "continuity")
          : generationOptions.referenceImages,
        prompt: `${prompt}${repairNote}`,
        outName: `${generationOptions.outName || "image"}-attempt${attempt}`,
      });
      onAttempt?.({ phase: "generated", attempt, maximumAttempts, pageLabel });
      const inspection = await inspectGeneratedIllustration({
        imagePath: outputImagePath(imageUrl),
        pageLabel,
      });
      const styleReference = generationOptions.referenceImages?.find((reference) => reference?.kind === "continuity");
      const advisoryCheck = async (check) => {
        try { return await check; }
        catch (error) {
          // Narrative/style vision checks may improve a coherent image once, but
          // their own timeout or malformed JSON must never destroy a whole book.
          return { approved: true, issues: [], warning: String(error?.message || error) };
        }
      };
      const [styleInspection, sceneInspection] = inspection.approved
        ? await Promise.all([
          advisoryCheck(inspectStyleConsistency({ imagePath: outputImagePath(imageUrl), styleReference, pageLabel })),
          advisoryCheck(inspectSceneFidelity({ imagePath: outputImagePath(imageUrl), sceneContract: sceneFidelityContract, pageLabel })),
        ])
        : [{ approved: false, issues: [] }, { approved: false, issues: [] }];
      if (inspection.approved && styleInspection.approved && sceneInspection.approved) {
        onAttempt?.({ phase: "approved", attempt, maximumAttempts, pageLabel });
        return imageUrl;
      }
      // Style comparison is bounded and advisory. It may request one stronger
      // regeneration, but a second coherent image must not abort an entire
      // preview because a vision model distinguishes subtle realism or polish.
      if (inspection.approved && attempt === maximumAttempts) {
        onAttempt?.({
          phase: sceneInspection.approved ? "approved-with-style-warning" : "approved-with-scene-warning",
          attempt,
          maximumAttempts,
          pageLabel,
          issues: [...styleInspection.issues, ...sceneInspection.issues],
        });
        return imageUrl;
      }
      previousIssues = inspection.approved ? [...styleInspection.issues, ...sceneInspection.issues] : inspection.issues;
      previousRejectionKind = inspection.approved ? (sceneInspection.approved ? "style" : "scene") : "technical";
      onAttempt?.({ phase: "rejected", attempt, maximumAttempts, pageLabel, issues: previousIssues });
    } catch (error) {
      onAttempt?.({ phase: "failed", attempt, maximumAttempts, pageLabel, error: String(error?.message || error) });
      if (isImageSafetyRejection(error) && !omitReferenceImages && generationOptions.referenceImages?.length && attempt < maximumAttempts) {
        // Do not retry the rejected input unchanged. Keep the textual identity
        // canon, but omit source pixels that may contain a logo or protected
        // character. This makes the next request safer without bypassing policy.
        omitReferenceImages = true;
        previousRejectionKind = "technical";
        previousIssues = ["a supplied reference contained material the safety system could not process; use only the generic non-branded identity description"];
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Illustration rejected after ${maximumAttempts} attempts: ${previousIssues.join(" | ") || "visual quality failure"}`);
}
