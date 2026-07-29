// src/agents/textWriter.js
import { loadPrompt } from "../services/loadPrompt.js";
import { bookLanguageInstruction, normalizeBookLanguage } from "../config/bookLanguages.js";
import { getWordsTargetByAge } from "../config/readingGuidance.js";
import { createOpenAIClient } from "../services/openaiClient.js";
import { modelRoute } from "../services/modelRouting.js";

export { getWordsTargetByAge };

function getClient() {
  return createOpenAIClient({ kind: "request" });
}

function extractText(res) {
  if (res?.output_text) return res.output_text;
  const parts = res?.output?.flatMap(o => o?.content || []) || [];
  return parts
    .filter(p => (p?.type || "").includes("text"))
    .map(p => p?.text || "")
    .join("\n")
    .trim();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("TextWriter returned non-JSON output");
  }
}

/**
 * Generates final readable page text from a text_prompt.
 * @param {object} params
 * @param {string} params.language - "ES"
 * @param {object} params.hero - {name, age, gender}
 * @param {number} params.page_number
 * @param {string} params.story_role
 * @param {string} params.text_prompt
 */
export async function textWriterAgent({
  language = "ES",
  hero = {},
  page_number,
  page_type = "text",
  story_role = "",
  text_prompt = "",
  story_context = {},
  previous_text = "",
}) {
  const template = loadPrompt("text_writer.txt");
  const targetLanguage = normalizeBookLanguage(language);
  const { target, tolerance } = getWordsTargetByAge(hero?.age, page_type);

  const inputPayload = {
    language: targetLanguage,
    hero: {
      name: hero?.name || "",
      age: hero?.age || "",
      gender: hero?.gender || ""
    },
    page_number,
    page_type,
    story_role,
    text_prompt,
    story_context,
    previous_text,
    voice_rules: {
      spanish: {
        pronoun: "tú",
        tone: "warm, playful, gentle",
        scary: "avoid"
      }
    },
    word_target: target,
    word_tolerance: tolerance
  };

  const route = modelRoute("story_writer");

  const res = await getClient().responses.create({
    model: route.model,
    instructions: `${bookLanguageInstruction(targetLanguage)}\n\n${template}`,
    input: `Return one valid JSON object.\n\nJSON INPUT DATA:\n${JSON.stringify(inputPayload, null, 2)}`,
    reasoning: { effort: route.reasoningEffort },
    text: { format: { type: "json_object" } },
    store: false,
  });

  const text = extractText(res);
  const json = safeJsonParse(text);

  const out = json?.page_text;
  if (!out?.text) throw new Error("TextWriter JSON missing page_text.text");

  // light validation: ensure page_number matches
  if (out.page_number !== page_number) {
    out.page_number = page_number;
  }
  out.language = targetLanguage;

  return json;
}
