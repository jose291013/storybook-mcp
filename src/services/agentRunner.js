// src/services/agentRunner.js
import { chatJson } from "./openai.js";

export async function runAgent({ name, system, user, input, clientKind = "request" }) {
  const originalUser = user(input);
  const out1 = await chatJson({ system, user: originalUser, clientKind });

  if (out1?.__json_ok) return out1.data;

  // Recreate the complete result with its original context. Repairing the malformed
  // fragment alone can lose required fields when the first response was truncated.
  const out2 = await chatJson({
    system: `${system}\n\nThe previous response was invalid or incomplete JSON. Recreate the complete object in the exact requested schema. Return ONLY valid JSON.`,
    user: `${originalUser}\n\nINVALID_PREVIOUS_OUTPUT:\n${String(out1.raw || "").slice(0, 12000)}\n\nReturn the complete corrected JSON object.`,
    temperature: 0,
    clientKind,
  });

  if (!out2?.__json_ok) {
    throw new Error(`Agent ${name} failed to return valid JSON`);
  }
  return out2.data;
}
