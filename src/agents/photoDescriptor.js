// src/agents/photoDescriptor.js
import { loadPrompt } from "../services/loadPrompt.js";
import { createOpenAIClient } from "../services/openaiClient.js";

function getClient() {
  return createOpenAIClient({ kind: "request" });
}

function extractText(res) {
  // Compatible avec responses API : output_text est souvent dispo
  if (res?.output_text) return res.output_text;
  // fallback : concat si besoin
  const parts = res?.output?.flatMap(o => o?.content || []) || [];
  const text = parts
    .filter(p => p?.type?.includes("text"))
    .map(p => p?.text || "")
    .join("\n")
    .trim();
  return text;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    // tente d’extraire un bloc JSON
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sliced = text.slice(start, end + 1);
      return JSON.parse(sliced);
    }
    throw new Error("PhotoDescriptor returned non-JSON output");
  }
}

export async function photoDescriptorAgent({
  subject_name,
  role = "other",
  story_role = "guest",
  relationship = "",
  age = "",
  gender = "",
  language,
  photo_url,
  hero_name,
}) {
  const resolvedName = subject_name || hero_name || "";
  const template = loadPrompt("photo_descriptor.txt");

  const promptText = template
    .replaceAll("{subject_name}", resolvedName)
    .replaceAll("{hero_name}", resolvedName)
    .replaceAll("{role}", role || "other")
    .replaceAll("{story_role}", story_role || "guest")
    .replaceAll("{relationship}", relationship || "")
    .replaceAll("{age}", age || "")
    .replaceAll("{gender}", gender || "")
    .replaceAll("{language}", language || "")
    .replaceAll("{photo_url}", photo_url || "");

  const model = process.env.VISION_MODEL || process.env.TEXT_MODEL || "gpt-4.1-mini";

  const res = await getClient().responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: promptText },
          // L’image : on passe une URL publique
          { type: "input_image", image_url: photo_url }
        ]
      }
    ]
  });

  const text = extractText(res);
  const json = safeJsonParse(text);

  if (!json?.photo_descriptor?.character_fingerprint) {
    throw new Error("PhotoDescriptor JSON missing photo_descriptor.character_fingerprint");
  }
  if (!json?.photo_descriptor?.canon_short) {
  throw new Error("PhotoDescriptor JSON missing photo_descriptor.canon_short");
}
if (!json?.photo_descriptor?.canon_json) {
  throw new Error("PhotoDescriptor JSON missing photo_descriptor.canon_json");
}


  json.photo_descriptor.subject = {
    name: resolvedName,
    role,
    story_role,
    relationship,
  };
  return json;
}
