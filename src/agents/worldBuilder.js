import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";

export async function worldBuilderAgent(intake) {
  const system = loadPrompt("world_builder.txt");

  return runAgent({
    name: "worldBuilder",
    system,
    user: (input) =>
      `INTAKE_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY JSON as specified.`,
    input: intake?.intake || intake
  });
}
