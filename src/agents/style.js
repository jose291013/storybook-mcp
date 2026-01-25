import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";

export async function styleAgent(intake) {
  const system = loadPrompt("style.txt");

  return runAgent({
    name: "style",
    system,
    user: (input) =>
      `INTAKE_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY JSON as specified.`,
    input: intake
  });
}
