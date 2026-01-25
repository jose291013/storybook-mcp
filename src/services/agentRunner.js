// src/services/agentRunner.js
import { chatJson } from "./openai.js";

export async function runAgent({ name, system, user, input }) {
  // 1) tentative normale
  const out1 = await chatJson({ system, user: user(input) });

  if (out1?.__json_ok) return out1.data;

  // 2) repair
  const out2 = await chatJson({
    system: "You fix JSON only. Return ONLY valid JSON. No commentary.",
    user: out1.raw || JSON.stringify(out1, null, 2),
  });

  if (!out2?.__json_ok) {
    throw new Error(`Agent ${name} failed to return valid JSON`);
  }
  return out2.data;
}
