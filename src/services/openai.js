// src/services/openai.js
import { createOpenAIClient } from "./openaiClient.js";
import { modelRoute } from "./modelRouting.js";
import { parseJsonSafe } from "./parseJsonSafe.js";

export async function chatJson({
  system,
  user,
  temperature = 0.2,
  clientKind = "request",
  modelRole = "",
}) {
  const route = modelRoute(modelRole);
  const client = createOpenAIClient({ kind: clientKind });
  if (route.api === "responses") {
    const resp = await client.responses.create({
      model: route.model,
      instructions: system,
      input: user,
      reasoning: { effort: route.reasoningEffort },
      text: { format: { type: "json_object" } },
      store: false,
    });
    const raw = String(resp.output_text || "").trim();
    const data = parseJsonSafe(raw);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return { __json_ok: true, data, raw };
    }
    return {
      __json_ok: false,
      raw,
      finishReason: resp.incomplete_details?.reason || resp.status || "",
    };
  }

  const resp = await client.chat.completions.create({
    model: route.model,
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
