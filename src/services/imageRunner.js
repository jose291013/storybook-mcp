// src/services/imageRunner.js
import OpenAI from "openai";
import { saveBase64Png } from "./storageLocal.js";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateImage({ prompt, refImageIds = [], outName }) {
  const res = await client.images.generate({
    model: process.env.IMAGE_MODEL || "gpt-image-1",
    prompt,
    size: "1536x1024",
    referenced_image_ids: refImageIds,
  });

  // Selon SDK: parfois url, parfois base64. On gère base64 ici.
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image base64 returned");

  const url = await saveBase64Png(b64, outName);
  return url;
}
