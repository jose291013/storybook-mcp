import { runAgent } from "../services/agentRunner.js";
import { loadPrompt } from "../services/loadPrompt.js";

export async function storybrandAgent({ intake, hero_profile }) {
  const system = loadPrompt("storybrand.txt");

  return runAgent({
    name: "storybrand",
    system,
    user: (input) =>
      `INPUT_JSON:\n${JSON.stringify(input, null, 2)}\n\nReturn ONLY JSON as specified.`,
    input: { intake, hero_profile }
  });
}
