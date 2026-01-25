import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";

export async function heroClassifierAgent(intake) {
  const system = loadPrompt("hero_classifier.txt");

  return runAgent({
    name: "heroClassifier",
    system,
    user: (input) =>
      `INTAKE_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY JSON as specified.`,
    input: intake
  });
}
