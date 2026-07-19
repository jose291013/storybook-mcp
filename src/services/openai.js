// src/services/openai.js
import { createOpenAIClient } from "./openaiClient.js";
import { parseJsonSafe } from "./parseJsonSafe.js";

function getClient() {
  return createOpenAIClient({ kind: "request" });
}

export async function chatJson({ system, user, temperature = 0.2 }) {
  const resp = await getClient().chat.completions.create({
    model: process.env.TEXT_MODEL || "gpt-4.1-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    // JSON mode prevents Markdown fences and most malformed/truncated structures.
    response_format: { type: "json_object" },
    temperature,
  });

  const raw = resp.choices?.[0]?.message?.content?.trim() || "";
  const data = parseJsonSafe(raw);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return { __json_ok: true, data, raw };
  }
  return { __json_ok: false, raw, finishReason: resp.choices?.[0]?.finish_reason || "" };
}
