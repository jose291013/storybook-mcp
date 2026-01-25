import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";

export async function qaAgent(final_blueprint) {
  const system = loadPrompt("qa.txt");

  return runAgent({
    name: "qa",
    system,
    user: (input) =>
      `FINAL_BLUEPRINT_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY JSON as specified.`,
    input: final_blueprint
  });
}
