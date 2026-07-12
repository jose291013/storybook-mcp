// src/agents/textWriter.js
import OpenAI from "openai";
import { loadPrompt } from "../services/loadPrompt.js";

function getClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

function getWordsTargetByAge(ageStr) {
  const age = parseInt(String(ageStr || "").replace(/[^\d]/g, ""), 10);
  if (Number.isNaN(age)) return { target: 35, tolerance: 8 }; // default

  if (age <= 3) return { target: 20, tolerance: 6 };
  if (age === 4) return { target: 26, tolerance: 6 };
  if (age === 5) return { target: 35, tolerance: 7 };
  if (age === 6) return { target: 42, tolerance: 8 };
  if (age === 7) return { target: 55, tolerance: 10 };
  if (age === 8) return { target: 75, tolerance: 12 };
  if (age <= 10) return { target: 100, tolerance: 15 };

  return { target: 110, tolerance: 20 };
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
  story_role = "",
  text_prompt = ""
}) {
  const template = loadPrompt("text_writer.txt");
  const { target, tolerance } = getWordsTargetByAge(hero?.age);

  const inputPayload = {
    language,
    hero: {
      name: hero?.name || "",
      age: hero?.age || "",
      gender: hero?.gender || ""
    },
    page_number,
    story_role,
    text_prompt,
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
          { type: "input_text", text: template },
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

  return json;
}
