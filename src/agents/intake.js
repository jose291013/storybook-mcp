import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";

export async function intakeAgent(rawAnswers) {
  const system = loadPrompt("intake.txt");

  return runAgent({
    name: "intake",
    system,
    user: (input) =>
      `RAW_ANSWERS_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY the JSON object specified by the system instructions.`,
    input: rawAnswers
  });
}
