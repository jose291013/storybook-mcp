// src/agents/textWriter.js
import { loadPrompt } from "../services/loadPrompt.js";
import { bookLanguageInstruction, normalizeBookLanguage } from "../config/bookLanguages.js";
import { createOpenAIClient } from "../services/openaiClient.js";

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

export function getWordsTargetByAge(ageStr, pageType = "text") {
  const age = parseInt(String(ageStr || "").replace(/[^\d]/g, ""), 10);
  let target;
  if (Number.isNaN(age)) target = 60;
  else if (age <= 3) target = 28;
  else if (age === 4) target = 45;
  else if (age === 5) target = 55;
  else if (age === 6) target = 70;
  else if (age === 7) target = 85;
  else if (age === 8) target = 105;
  else if (age <= 10) target = 125;
  else target = 135;

  if (["opening_text", "closing_text"].includes(pageType)) target = Math.round(target * 0.58);
  return { target, tolerance: Math.max(8, Math.round(target * 0.16)) };
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

  const model = process.env.TEXT_MODEL || "gpt-4.1-mini";

  const res = await getClient().responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: `${bookLanguageInstruction(targetLanguage)}\n\n${template}` },
          { type: "input_text", text: "\n\nDATA:\n" + JSON.stringify(inputPayload, null, 2) }
        ]
      }
    ]
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
