// src/services/openai.js
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function chatJson({ system, user }) {
  const resp = await client.chat.completions.create({
    model: process.env.TEXT_MODEL || "gpt-4.1-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.4,
  });

  const raw = resp.choices?.[0]?.message?.content?.trim() || "";

  try {
    const data = JSON.parse(raw);
    return { __json_ok: true, data, raw };
  } catch {
    return { __json_ok: false, raw };
  }
}
