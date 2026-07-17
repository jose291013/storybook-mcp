import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";
import sharp from "sharp";
import { generateImage } from "./imageRunner.js";

function getClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
  const approved = result?.approved === true;
  const issues = Array.isArray(result?.issues) ? result.issues.map(String).filter(Boolean).slice(0, 5) : [];
  return { approved, issues: approved ? [] : (issues.length ? issues : ["The image failed technical quality control."]) };
}

export async function generateQualityCheckedImage({
  prompt,
  castPresent = [],
  pageLabel = "illustration",
  maximumAttempts = Math.max(1, Number.parseInt(process.env.IMAGE_GENERATION_ATTEMPTS || "2", 10) || 2),
  ...generationOptions
}) {
  let previousIssues = [];
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const repairNote = previousIssues.length
      ? `\n\nTECHNICAL REGENERATION: the previous output was rejected because ${previousIssues.join("; ")}. Produce a complete, coherent illustration of the requested scene and do not reproduce that defect.`
      : "";
    const imageUrl = await generateImage({
      ...generationOptions,
      prompt: `${prompt}${repairNote}`,
      outName: `${generationOptions.outName || "image"}-attempt${attempt}`,
    });
    const inspection = await inspectGeneratedIllustration({
      imagePath: outputImagePath(imageUrl),
      pageLabel,
    });
    if (inspection.approved) return imageUrl;
    previousIssues = inspection.issues;
  }
  throw new Error(`Illustration rejected after ${maximumAttempts} attempts: ${previousIssues.join(" | ") || "visual quality failure"}`);
}
